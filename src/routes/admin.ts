import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import os from 'os';
import { redis } from '../services/redis.js';
import { REDIS_KEYS, UserData } from '../middleware/auth.js';
import { TIERS, TierName } from '../config.js';
import { stripe } from '../services/stripe.js';

const router = Router();

// Admin API key from environment
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// Admin auth middleware
function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-admin-key'];

  if (!ADMIN_API_KEY || apiKey !== ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid admin key' });
    return;
  }

  next();
}

// Apply admin auth to all routes
router.use(adminAuth);

// Helper to get month key
function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// GET /admin/stats - Dashboard overview stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    // Get all users
    const userKeys = await redis.keys('user:*');
    const users: UserData[] = [];

    for (const key of userKeys) {
      const data = await redis.get(key);
      if (data) users.push(JSON.parse(data));
    }

    // Count by tier
    const tierCounts = {
      free: users.filter(u => u.tier === 'free').length,
      pro: users.filter(u => u.tier === 'pro').length,
      scale: users.filter(u => u.tier === 'scale').length,
    };

    // Get total API keys
    const apiKeyCount = (await redis.keys('apikey:sniff_*')).length;

    // Get this month's total usage
    const usageKeys = await redis.keys(`usage:*:${getMonthKey()}`);
    let totalUsage = 0;
    for (const key of usageKeys) {
      const usage = await redis.get(key);
      totalUsage += parseInt(usage || '0', 10);
    }

    // Calculate MRR (Monthly Recurring Revenue)
    const mrr = (tierCounts.pro * TIERS.pro.price) + (tierCounts.scale * TIERS.scale.basePrice);

    res.json({
      users: {
        total: users.length,
        byTier: tierCounts,
        withApiKey: apiKeyCount,
        cardVerified: users.filter(u => u.cardVerified).length,
      },
      usage: {
        thisMonth: totalUsage,
        monthKey: getMonthKey(),
      },
      revenue: {
        mrr: mrr / 100, // Convert cents to dollars
        mrrFormatted: `$${(mrr / 100).toFixed(2)}`,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /admin/users - List all users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { tier, search, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // Get all users
    const userKeys = await redis.keys('user:*');
    let users: (UserData & { usage: number; apiKey?: string })[] = [];

    for (const key of userKeys) {
      const data = await redis.get(key);
      if (data) {
        const user = JSON.parse(data) as UserData;

        // Filter by tier if specified
        if (tier && user.tier !== tier) continue;

        // Filter by search if specified
        if (search && !user.email.includes(search as string)) continue;

        // Get usage for this user
        const usageKey = `usage:${user.email}:${getMonthKey()}`;
        const usage = parseInt(await redis.get(usageKey) || '0', 10);

        // Get API key if exists
        const apiKeys = await redis.keys('apikey:sniff_*');
        let userApiKey: string | undefined;
        for (const k of apiKeys) {
          const keyEmail = await redis.get(k);
          if (keyEmail === user.email) {
            userApiKey = k.replace('apikey:', '');
            break;
          }
        }

        users.push({ ...user, usage, apiKey: userApiKey });
      }
    }

    // Sort by creation date (newest first)
    users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Paginate
    const total = users.length;
    const totalPages = Math.ceil(total / limitNum);
    users = users.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /admin/users/:email - Get single user details
router.get('/users/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const userData = await redis.get(REDIS_KEYS.user(email));

    if (!userData) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = JSON.parse(userData) as UserData;

    // Get usage history (last 6 months)
    const usageHistory: { month: string; usage: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const usage = parseInt(await redis.get(`usage:${email}:${monthKey}`) || '0', 10);
      usageHistory.push({ month: monthKey, usage });
    }

    // Get API key
    const apiKeys = await redis.keys('apikey:sniff_*');
    let userApiKey: string | undefined;
    for (const k of apiKeys) {
      const keyEmail = await redis.get(k);
      if (keyEmail === email) {
        userApiKey = k.replace('apikey:', '');
        break;
      }
    }

    // Get Stripe info if available
    let stripeInfo = null;
    if (user.stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);
        if (!('deleted' in customer)) {
          stripeInfo = {
            customerId: customer.id,
            created: new Date(customer.created * 1000).toISOString(),
          };
        }

        if (user.stripeSubscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
          const sub = subscription as unknown as { id: string; status: string; current_period_end: number };
          stripeInfo = {
            ...stripeInfo,
            subscriptionId: sub.id,
            status: sub.status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
          };
        }
      } catch {
        // Stripe info not available
      }
    }

    res.json({
      user: {
        ...user,
        apiKey: userApiKey,
        tierInfo: TIERS[user.tier],
      },
      usageHistory,
      stripe: stripeInfo,
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PATCH /admin/users/:email - Update user
router.patch('/users/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const { tier } = req.body;

    const userData = await redis.get(REDIS_KEYS.user(email));

    if (!userData) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = JSON.parse(userData) as UserData;

    // Update tier if provided and valid
    if (tier && tier in TIERS) {
      user.tier = tier as TierName;
    }

    await redis.set(REDIS_KEYS.user(email), JSON.stringify(user));

    res.json({ message: 'User updated', user });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /admin/users/:email - Delete user
router.delete('/users/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    // Delete user data
    await redis.del(REDIS_KEYS.user(email));

    // Delete API key
    const apiKeys = await redis.keys('apikey:sniff_*');
    for (const k of apiKeys) {
      const keyEmail = await redis.get(k);
      if (keyEmail === email) {
        await redis.del(k);
        break;
      }
    }

    // Delete usage data
    const usageKeys = await redis.keys(`usage:${email}:*`);
    for (const k of usageKeys) {
      await redis.del(k);
    }

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /admin/users/:email/revoke-key - Revoke and regenerate API key
router.post('/users/:email/revoke-key', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    const userData = await redis.get(REDIS_KEYS.user(email));

    if (!userData) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Find and delete existing API key
    const apiKeys = await redis.keys('apikey:sniff_*');
    for (const k of apiKeys) {
      const keyEmail = await redis.get(k);
      if (keyEmail === email) {
        await redis.del(k);
        break;
      }
    }

    res.json({ message: 'API key revoked. User will need to sign up again to get a new key.' });
  } catch (error) {
    console.error('Admin revoke key error:', error);
    res.status(500).json({ error: 'Failed to revoke key' });
  }
});

// GET /admin/system - System resource monitoring
router.get('/system', async (_req: Request, res: Response) => {
  try {
    // Memory info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    // CPU info
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    // Uptime
    const uptimeSeconds = os.uptime();
    const uptimeDays = Math.floor(uptimeSeconds / 86400);
    const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);

    // Redis memory
    let redisMemory = null;
    try {
      const redisInfo = await redis.info('memory');
      const usedMemMatch = redisInfo.match(/used_memory_human:(\S+)/);
      const peakMemMatch = redisInfo.match(/used_memory_peak_human:(\S+)/);
      redisMemory = {
        used: usedMemMatch ? usedMemMatch[1] : 'unknown',
        peak: peakMemMatch ? peakMemMatch[1] : 'unknown',
      };
    } catch {
      // Redis info not available
    }

    // Upgrade recommendations
    const recommendations: string[] = [];
    if (memPercent > 80) {
      recommendations.push('Memory usage is high (>80%). Consider upgrading RAM.');
    }
    if (loadAvg[0] > cpus.length) {
      recommendations.push('CPU load is high. Consider upgrading to more vCPUs.');
    }

    res.json({
      memory: {
        total: `${Math.round(totalMem / 1024 / 1024)} MB`,
        used: `${Math.round(usedMem / 1024 / 1024)} MB`,
        free: `${Math.round(freeMem / 1024 / 1024)} MB`,
        percent: memPercent,
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || 'unknown',
        loadAverage: {
          '1min': loadAvg[0].toFixed(2),
          '5min': loadAvg[1].toFixed(2),
          '15min': loadAvg[2].toFixed(2),
        },
      },
      uptime: {
        seconds: uptimeSeconds,
        formatted: `${uptimeDays}d ${uptimeHours}h`,
      },
      redis: redisMemory,
      recommendations,
      upgradeThresholds: {
        memory: '80% usage = consider upgrade',
        cpu: 'load > cores = consider upgrade',
      },
    });
  } catch (error) {
    console.error('Admin system error:', error);
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});

// GET /admin/usage - Usage analytics
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const { months = '6' } = req.query;
    const monthsNum = parseInt(months as string, 10);

    const usageByMonth: { month: string; total: number; byTier: Record<string, number> }[] = [];
    const now = new Date();

    for (let i = 0; i < monthsNum; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const usageKeys = await redis.keys(`usage:*:${monthKey}`);
      let total = 0;
      const byTier: Record<string, number> = { free: 0, pro: 0, scale: 0 };

      for (const key of usageKeys) {
        const email = key.split(':')[1];
        const usage = parseInt(await redis.get(key) || '0', 10);
        total += usage;

        // Get user tier
        const userData = await redis.get(REDIS_KEYS.user(email));
        if (userData) {
          const user = JSON.parse(userData) as UserData;
          byTier[user.tier] = (byTier[user.tier] || 0) + usage;
        }
      }

      usageByMonth.push({ month: monthKey, total, byTier });
    }

    res.json({ usageByMonth: usageByMonth.reverse() });
  } catch (error) {
    console.error('Admin usage error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

export default router;
