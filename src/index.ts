/**
 * @juztuz/burner-email-validator v2
 *
 * Email validation library that detects disposable/burner email addresses
 * and optionally verifies mailbox existence via SMTP.
 */

// Main validation functions
export {
  validateEmail,
  isDisposableDomain,
  getValidatorStats,
  addDiscoveredDomain,
  reloadDiscoveredDomains,
} from './validator';

// Batch validation
export { validateEmails } from './batch';

// Configuration
export { configure } from './config';

// Types
export type {
  ValidationResult,
  ValidationOptions,
  BatchValidationOptions,
  BatchValidationResult,
  SmtpResult,
  ValidationReason,
  ReachableStatus,
  SniffmailConfig,
  CacheStore,
  CacheTtlConfig,
} from './types';

// Cache utilities (for advanced usage)
export { MemoryCache, RedisCache } from './cache';

// Reacher client errors (for error handling)
export { ReacherNotConfiguredError, ReacherError } from './reacher/client';

// Re-export individual source modules for advanced usage
export {
  isInGitHubBlocklist,
  fetchGitHubBlocklist,
  getGitHubBlocklistStats,
} from './sources/github-blocklist';

export {
  checkDeBounceAPI,
  getDebounceCacheStats,
} from './sources/debounce-api';

export {
  isInScrapedBlocklist,
  fetchScrapedDomains,
  getScrapedDomainsStats,
} from './sources/scraped-domains';

export {
  isDiscoveredDomain,
  getDiscoveredDomains,
  getDiscoveredDomainsStats,
} from './sources/discovered-domains';
