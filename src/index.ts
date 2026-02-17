import express from 'express';
import { config } from './config.js';
import { disconnect } from './services/redis.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { usageLimitMiddleware } from './middleware/usageLimit.js';
import verifyRoutes from './routes/verify.js';
import authRoutes from './routes/auth.js';
import webhookRoutes from './routes/webhook.js';
import healthRoutes from './routes/health.js';
import adminRoutes from './routes/admin.js';

const app = express();

// Stripe webhook needs raw body - must be before express.json()
app.use('/webhook/stripe', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes
app.use(express.json());

// CORS headers
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  config.appUrl,
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-admin-key');
  next();
});

// Handle preflight
app.options('*', (_req, res) => {
  res.sendStatus(204);
});

// Root route
app.get('/', (_req, res) => {
  res.status(403).send('You shouldn\'t be here.');
});

// Public routes
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/webhook', webhookRoutes);

// Admin routes (requires admin API key)
app.use('/admin', adminRoutes);

// API v1 routes (authenticated)
app.use('/v1/verify', authMiddleware, rateLimitMiddleware, usageLimitMiddleware, verifyRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  await disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
app.listen(config.port, () => {
  console.log(`Sniffmail API running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Reacher backend: ${config.reacherBackendUrl}`);
});
