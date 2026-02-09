# @juztuz/burner-email-validator

A comprehensive email validation library that detects disposable/burner email addresses and optionally verifies mailbox existence via SMTP.

## Features

- **Syntax Validation** — Validates email format
- **Disposable Email Detection** — Blocks burner/temporary email addresses using multiple sources:
  - GitHub disposable email blocklist (26,000+ domains)
  - Scraped domains from temp mail providers
  - Live-discovered domains from temp mail APIs
  - DeBounce API real-time detection
  - node-email-verifier's built-in list
- **MX Record Lookup** — Verifies the domain has mail servers
- **Deep SMTP Verification** — Connects to mail servers to verify mailbox existence (optional, requires self-hosted Reacher backend)
- **Caching** — In-memory or Redis caching to avoid redundant checks
- **Batch Processing** — Validate multiple emails with concurrency control

## Installation

```bash
npm install @juztuz/burner-email-validator
```

For Redis caching support (optional):
```bash
npm install ioredis
```

## Quick Start

```typescript
import { validateEmail } from '@juztuz/burner-email-validator';

// Basic validation (syntax + disposable + MX check)
const result = await validateEmail('someone@gmail.com');

if (!result.valid) {
  console.log(`Invalid: ${result.reason}`);
  // Possible reasons: 'invalid_syntax', 'disposable', 'no_mx_records'
}
```

## API Reference

### `validateEmail(email, options?)`

Validates a single email address.

```typescript
import { validateEmail } from '@juztuz/burner-email-validator';

const result = await validateEmail('user@example.com', {
  deep: false,        // Enable SMTP verification (default: false)
  checkMx: true,      // Check MX records (default: true)
  useDeBounce: true,  // Use DeBounce API (default: true)
  timeout: 5,         // DNS timeout in seconds (default: 5)
});
```

**Returns: `ValidationResult`**

```typescript
{
  email: string;           // Normalized email address
  valid: boolean;          // Overall validity
  reason: ValidationReason | null;  // Why it's invalid (null if valid)
  disposable: boolean;     // Is it a disposable/burner email
  mx: boolean;             // Has valid MX records
  smtp: SmtpResult | null; // SMTP details (only with deep: true)
  cached: boolean;         // Was result from cache
}
```

**Validation Reasons:**
- `invalid_syntax` — Email format is invalid
- `disposable` — Domain is a known disposable email provider
- `no_mx_records` — Domain has no mail servers
- `mailbox_not_found` — Mailbox doesn't exist (deep mode)
- `mailbox_full` — Mailbox is full (deep mode)
- `mailbox_disabled` — Mailbox is disabled (deep mode)
- `catch_all` — Domain accepts all emails (deep mode)
- `smtp_error` — Could not connect to mail server (deep mode)

### `validateEmails(emails, options?)`

Validates multiple emails with concurrency control.

```typescript
import { validateEmails } from '@juztuz/burner-email-validator';

const { results, summary } = await validateEmails(
  ['a@gmail.com', 'b@tempmail.com', 'c@company.com'],
  {
    deep: true,
    concurrency: 5,  // Max parallel requests (default: 5)
  }
);

console.log(summary);
// { total: 3, valid: 2, invalid: 0, disposable: 1, unknown: 0 }
```

### `configure(options)`

Configure global settings (required for deep mode).

```typescript
import { configure } from '@juztuz/burner-email-validator';

configure({
  reacherUrl: 'http://your-vps:8080',  // Reacher backend URL
  reacherApiKey: 'optional-api-key',    // If Reacher has auth enabled
  cache: {
    enabled: true,           // Enable caching (default: true)
    store: customCacheStore, // Custom cache implementation
    ttl: {
      safe: 604800,          // 7 days for valid emails
      invalid: 2592000,      // 30 days for invalid emails
      risky: 86400,          // 1 day for risky emails
      unknown: 0,            // Don't cache unknown results
    },
  },
});
```

### `isDisposableDomain(domain)`

Quick synchronous check if a domain is disposable (no network calls).

```typescript
import { isDisposableDomain } from '@juztuz/burner-email-validator';

if (isDisposableDomain('tempmail.com')) {
  console.log('Blocked!');
}
```

### `getValidatorStats()`

Get statistics about loaded blocklists.

```typescript
import { getValidatorStats } from '@juztuz/burner-email-validator';

const stats = getValidatorStats();
console.log(stats.githubBlocklist);    // { loaded: true, count: 26000 }
console.log(stats.scrapedDomains);     // { loaded: true, count: 5000 }
console.log(stats.discoveredDomains);  // { loaded: true, count: 150 }
```

## Deep Mode (SMTP Verification)

Deep mode connects to a self-hosted [Reacher](https://github.com/reacherhq/check-if-email-exists) backend to verify that a specific mailbox actually exists. This catches cases like `fakeperson@gmail.com` that pass basic validation.

### Why Self-Hosted?

- **No per-verification fees** — Unlimited checks
- **Full control** — Your data stays on your infrastructure
- **Port 25 access** — Required for SMTP checks (blocked by most cloud providers)

### Setup

1. **Provision a VPS** with port 25 open (Hetzner, OVH, DigitalOcean recommended)

2. **Run Reacher backend:**
   ```bash
   docker run -d -p 8080:8080 reacherhq/backend:latest
   ```

3. **Configure the library:**
   ```typescript
   import { configure, validateEmail } from '@juztuz/burner-email-validator';

   configure({
     reacherUrl: 'http://your-vps-ip:8080',
   });

   const result = await validateEmail('someone@gmail.com', { deep: true });
   ```

### SMTP Result Details

When using deep mode, the `smtp` field contains:

```typescript
{
  is_reachable: 'safe' | 'risky' | 'invalid' | 'unknown';
  can_connect: boolean;    // Could connect to SMTP server
  is_deliverable: boolean; // Mailbox accepts mail
  is_catch_all: boolean;   // Domain accepts all addresses
}
```

**Reachability statuses:**
- `safe` — Email exists and is deliverable
- `risky` — Email exists but might bounce (catch-all, full mailbox)
- `invalid` — Email does not exist
- `unknown` — Could not determine (timeout, blocked, etc.)

## Caching

Results are cached to avoid redundant verification:

| Status | Default TTL | Reason |
|--------|-------------|--------|
| `safe` | 7 days | Valid emails rarely change |
| `invalid` | 30 days | Invalid emails almost never become valid |
| `risky` | 1 day | Status may change |
| `unknown` | 0 (no cache) | Retry on next request |

### Custom Cache Store

Use Redis for persistent caching across restarts:

```typescript
import { configure, RedisCache } from '@juztuz/burner-email-validator';
import Redis from 'ioredis';

const redis = new Redis('redis://localhost:6379');

configure({
  reacherUrl: 'http://your-vps:8080',
  cache: {
    store: new RedisCache(redis),
  },
});
```

Or implement your own:

```typescript
import { configure, CacheStore } from '@juztuz/burner-email-validator';

class MyCache implements CacheStore {
  async get(key: string): Promise<string | null> { /* ... */ }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> { /* ... */ }
  async delete?(key: string): Promise<void> { /* ... */ }
}

configure({
  cache: { store: new MyCache() },
});
```

## Validation Pipeline

```
Email Input
    │
    ▼
┌─────────────────────────────────┐
│  1. Syntax Validation           │  ← Regex check
│     fail → invalid_syntax       │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  2. Disposable Domain Check     │  ← Local blocklists
│     fail → disposable           │     (GitHub, scraped, discovered)
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  3. node-email-verifier         │  ← MX check + more disposable detection
│     no MX → no_mx_records       │
│     disposable → disposable     │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  4. DeBounce API                │  ← Real-time disposable check
│     disposable → disposable     │
└─────────────────────────────────┘
    │
    ▼
    │ (if deep: false, stop here with valid: true)
    │
    ▼
┌─────────────────────────────────┐
│  5. Cache Check                 │  ← Return cached result if available
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  6. Reacher SMTP Verification   │  ← Connect to mail server
│     → mailbox_not_found         │
│     → mailbox_full              │
│     → mailbox_disabled          │
│     → catch_all                 │
│     → smtp_error                │
│     → valid: true               │
└─────────────────────────────────┘
    │
    ▼
  Result (cached for future requests)
```

## Error Handling

```typescript
import {
  validateEmail,
  ReacherNotConfiguredError,
  ReacherError
} from '@juztuz/burner-email-validator';

try {
  const result = await validateEmail('test@example.com', { deep: true });
} catch (error) {
  if (error instanceof ReacherNotConfiguredError) {
    // Reacher URL not set - call configure() first
    console.error('Configure reacherUrl before using deep mode');
  } else if (error instanceof ReacherError) {
    // Reacher backend error (timeout, connection failed, etc.)
    console.error('Reacher error:', error.message);
  }
}
```

## Usage Examples

### Signup Form Validation

```typescript
import { validateEmail } from '@juztuz/burner-email-validator';

async function validateSignupEmail(email: string): Promise<string | null> {
  const result = await validateEmail(email);

  if (!result.valid) {
    switch (result.reason) {
      case 'invalid_syntax':
        return 'Please enter a valid email address';
      case 'disposable':
        return 'Disposable email addresses are not allowed';
      case 'no_mx_records':
        return 'This email domain does not exist';
      default:
        return 'Please enter a valid email address';
    }
  }

  return null; // Valid
}
```

### Deep Verification for Critical Flows

```typescript
import { configure, validateEmail } from '@juztuz/burner-email-validator';

// Configure once at app startup
configure({
  reacherUrl: process.env.REACHER_URL,
});

async function verifyEmailForInvoice(email: string): Promise<boolean> {
  const result = await validateEmail(email, { deep: true });

  if (!result.valid) {
    console.log(`Email ${email} failed: ${result.reason}`);
    return false;
  }

  // Extra check for risky emails
  if (result.smtp?.is_reachable === 'risky') {
    console.log(`Warning: ${email} is risky (catch-all or full inbox)`);
  }

  return true;
}
```

### Bulk Email List Cleaning

```typescript
import { configure, validateEmails } from '@juztuz/burner-email-validator';

configure({ reacherUrl: process.env.REACHER_URL });

async function cleanEmailList(emails: string[]): Promise<string[]> {
  const { results } = await validateEmails(emails, {
    deep: true,
    concurrency: 10,
  });

  return results
    .filter(r => r.valid && r.smtp?.is_reachable === 'safe')
    .map(r => r.email);
}
```

## Advanced: Source Modules

Access individual detection sources for custom logic:

```typescript
import {
  isInGitHubBlocklist,
  isInScrapedBlocklist,
  isDiscoveredDomain,
  checkDeBounceAPI,
} from '@juztuz/burner-email-validator';

// Check specific sources
const domain = 'tempmail.com';

if (isInGitHubBlocklist(domain)) {
  console.log('Blocked by GitHub list');
}

if (isInScrapedBlocklist(domain)) {
  console.log('Blocked by scraped domains');
}

if (isDiscoveredDomain(domain)) {
  console.log('Blocked by live-discovered domains');
}

// Async DeBounce check
if (await checkDeBounceAPI('user@domain.com')) {
  console.log('Blocked by DeBounce API');
}
```

## License

UNLICENSED - Private package
