/**
 * @juztuz/burner-email-validator
 *
 * Email validation library that detects disposable/burner email addresses.
 */

export {
  validateEmail,
  isDisposableDomain,
  getValidatorStats,
  addDiscoveredDomain,
  reloadDiscoveredDomains,
  type EmailValidationResult,
  type ValidationOptions,
} from './validator';

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
