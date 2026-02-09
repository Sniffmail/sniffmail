# sniffmail

A comprehensive email validation library that detects disposable/burner email addresses and verifies mailbox existence via SMTP.

## Features

- **Syntax Validation** — Validates email format
- **Disposable Email Detection** — Blocks burner/temporary email addresses using multiple sources:
  - GitHub disposable email blocklist (26,000+ domains)
  - Scraped domains from temp mail providers
  - Live-discovered domains from temp mail APIs
  - DeBounce API real-time detection
- **MX Record Lookup** — Verifies the domain has mail servers
- **Deep SMTP Verification** — Verifies the mailbox actually exists (powered by Sniffmail API)
- **Caching** — In-memory or Redis caching to avoid redundant checks
- **Batch Processing** — Validate multiple emails with concurrency control

## Installation

```bash
npm install sniffmail
```

## Quick Start

```typescript
import { validateEmail } from 'sniffmail';

// Basic validation (syntax + disposable + MX check) — FREE, no API key needed
const result = await validateEmail('someone@gmail.com');

if (!result.valid) {
  console.log(`Invalid: ${result.reason}`);
  // Possible reasons: 'invalid_syntax', 'disposable', 'no_mx_records'
}
```

## Deep Mode (SMTP Verification)

Verify that a mailbox actually exists — catches fake emails like `fakeperson123@gmail.com`.

```typescript
import { configure, validateEmail } from 'sniffmail';

// Get your free API key at https://sniffmail.io
configure({
  apiKey: process.env.SNIFFMAIL_API_KEY,
});

const result = await validateEmail('someone@gmail.com', { deep: true });

if (result.smtp?.is_reachable === 'invalid') {
  console.log('Mailbox does not exist!');
}
```

### Pricing

| Tier | Verifications | Price |
|------|---------------|-------|
| Free | 100/month | $0 |
| Starter | 2,500/month | $12 |
| Pro | 10,000/month | $39 |
| Business | 50,000/month | $149 |

Get your API key at [https://sniffmail.io](https://sniffmail.io)

## API Reference

### `validateEmail(email, options?)`

Validates a single email address.

```typescript
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
  reason: ValidationReason | null;  // Why it's invalid
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
import { validateEmails } from 'sniffmail';

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

Configure global settings.

```typescript
import { configure } from 'sniffmail';

configure({
  apiKey: 'sniff_xxx',  // Your Sniffmail API key
  cache: {
    enabled: true,
    ttl: {
      safe: 604800,     // 7 days
      invalid: 2592000, // 30 days
      risky: 86400,     // 1 day
      unknown: 0,       // Don't cache
    },
  },
});
```

### `isDisposableDomain(domain)`

Quick synchronous check if a domain is disposable (no network calls, no API key needed).

```typescript
import { isDisposableDomain } from 'sniffmail';

if (isDisposableDomain('tempmail.com')) {
  console.log('Blocked!');
}
```

## Environment Variables

```bash
# Your Sniffmail API key (required for deep mode)
SNIFFMAIL_API_KEY=sniff_xxxxx
```

## SMTP Result Details

When using `deep: true`, the `smtp` field contains:

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

## Usage Examples

### Signup Form Validation

```typescript
import { validateEmail } from 'sniffmail';

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
import { configure, validateEmail } from 'sniffmail';

// Configure once at app startup
configure({
  apiKey: process.env.SNIFFMAIL_API_KEY,
});

async function verifyEmailForInvoice(email: string): Promise<boolean> {
  const result = await validateEmail(email, { deep: true });

  if (!result.valid) {
    console.log(`Email ${email} failed: ${result.reason}`);
    return false;
  }

  if (result.smtp?.is_reachable === 'risky') {
    console.log(`Warning: ${email} is risky (catch-all or full inbox)`);
  }

  return true;
}
```

### Bulk Email List Cleaning

```typescript
import { configure, validateEmails } from 'sniffmail';

configure({ apiKey: process.env.SNIFFMAIL_API_KEY });

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

## Error Handling

```typescript
import {
  validateEmail,
  ApiKeyNotConfiguredError,
  SniffmailError
} from 'sniffmail';

try {
  const result = await validateEmail('test@example.com', { deep: true });
} catch (error) {
  if (error instanceof ApiKeyNotConfiguredError) {
    console.error('API key not set. Get one at https://sniffmail.io');
  } else if (error instanceof SniffmailError) {
    if (error.statusCode === 403) {
      console.error('Usage limit exceeded. Upgrade at https://sniffmail.io');
    } else if (error.statusCode === 429) {
      console.error('Rate limited. Slow down requests.');
    }
  }
}
```

## Caching

Results are cached to avoid redundant verification:

| Status | Default TTL | Reason |
|--------|-------------|--------|
| `safe` | 7 days | Valid emails rarely change |
| `invalid` | 30 days | Invalid emails almost never become valid |
| `risky` | 1 day | Status may change |
| `unknown` | 0 (no cache) | Retry on next request |

### Redis Cache

```typescript
import { configure, RedisCache } from 'sniffmail';
import Redis from 'ioredis';

const redis = new Redis('redis://localhost:6379');

configure({
  apiKey: process.env.SNIFFMAIL_API_KEY,
  cache: {
    store: new RedisCache(redis),
  },
});
```

## License

MIT
