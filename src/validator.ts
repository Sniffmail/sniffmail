/**
 * Email Validation Service
 *
 * Validates emails to detect disposable/burner addresses.
 * Combines multiple sources for maximum coverage:
 *
 * 1. node-email-verifier - npm package with format validation, MX check, and disposable detection
 * 2. GitHub blocklist - 26,000+ disposable domains (strict mode)
 * 3. DeBounce API - Free unlimited API for real-time detection
 * 4. deviceandbrowserinfo.com scraped domains - Multiple disposable email providers
 * 5. Live API scraper - Fetches domains from temp mail service APIs
 */

import emailValidator from 'node-email-verifier';
import { isInGitHubBlocklist, getGitHubBlocklistStats } from './sources/github-blocklist';
import { checkDeBounceAPI, getDebounceCacheStats } from './sources/debounce-api';
import { isInScrapedBlocklist, getScrapedDomainsStats } from './sources/scraped-domains';
import {
  isDiscoveredDomain,
  getDiscoveredDomainsStats,
  addDiscoveredDomain,
  reloadDiscoveredDomains,
} from './sources/discovered-domains';

export interface EmailValidationResult {
  valid: boolean;
  reason?: 'invalid_format' | 'disposable_domain' | 'no_mx_record' | 'dns_error';
  message?: string;
  source?: string;
}

export interface ValidationOptions {
  /** Check MX records (default: true) */
  checkMx?: boolean;
  /** Use DeBounce API as final check (default: true) */
  useDeBounce?: boolean;
  /** Timeout for DNS lookups in seconds (default: 5) */
  timeout?: number;
}

interface DetailedValidationResult {
  valid: boolean;
  email: string;
  format: { valid: boolean; reason?: string };
  mx?: { valid: boolean; reason?: string };
  disposable?: { valid: boolean; provider?: string; reason?: string };
}

/**
 * Validate an email address
 */
export async function validateEmail(
  email: string,
  options: ValidationOptions = {}
): Promise<EmailValidationResult> {
  const { checkMx = true, useDeBounce = true, timeout = 5 } = options;

  try {
    // Quick format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        valid: false,
        reason: 'invalid_format',
        message: 'Invalid email format',
      };
    }

    const domain = email.split('@')[1]!.toLowerCase();

    // Check discovered domains (from live API scraping)
    if (isDiscoveredDomain(domain)) {
      console.log(`[Email Validation] Blocked by discovered domains: ${domain}`);
      return {
        valid: false,
        reason: 'disposable_domain',
        message: "We couldn't verify this email address. Please try a different email.",
        source: 'discovered_domains',
      };
    }

    // Check scraped domains (from deviceandbrowserinfo.com)
    if (isInScrapedBlocklist(domain)) {
      console.log(`[Email Validation] Blocked by scraped blocklist: ${domain}`);
      return {
        valid: false,
        reason: 'disposable_domain',
        message: "We couldn't verify this email address. Please try a different email.",
        source: 'scraped_blocklist',
      };
    }

    // Check GitHub blocklist
    if (isInGitHubBlocklist(domain)) {
      console.log(`[Email Validation] Blocked by GitHub blocklist: ${domain}`);
      return {
        valid: false,
        reason: 'disposable_domain',
        message: "We couldn't verify this email address. Please try a different email.",
        source: 'github_blocklist',
      };
    }

    // Use node-email-verifier for MX check and its own disposable list
    const result = (await emailValidator(email, {
      checkMx,
      checkDisposable: true,
      detailed: true,
      timeout: `${timeout}s`,
      cache: {
        enabled: true,
        defaultTtl: 3600000,
        maxSize: 1000,
      },
    })) as DetailedValidationResult;

    if (!result.format.valid) {
      console.log(`[Email Validation] Invalid format: ${email}`);
      return {
        valid: false,
        reason: 'invalid_format',
        message: 'Invalid email format',
      };
    }

    if (result.disposable && !result.disposable.valid) {
      const provider = result.disposable.provider ? ` (${result.disposable.provider})` : '';
      console.log(`[Email Validation] Blocked by npm package: ${email}${provider}`);
      return {
        valid: false,
        reason: 'disposable_domain',
        message: "We couldn't verify this email address. Please try a different email.",
        source: 'node_email_verifier',
      };
    }

    if (checkMx && result.mx && !result.mx.valid) {
      console.log(`[Email Validation] No MX record: ${email}`);
      return {
        valid: false,
        reason: 'no_mx_record',
        message: "We couldn't verify this email address. Please check the spelling or try a different email.",
      };
    }

    // Final check: DeBounce API
    if (useDeBounce) {
      const isDisposable = await checkDeBounceAPI(email);
      if (isDisposable) {
        console.log(`[Email Validation] Blocked by DeBounce API: ${domain}`);
        return {
          valid: false,
          reason: 'disposable_domain',
          message: "We couldn't verify this email address. Please try a different email.",
          source: 'debounce_api',
        };
      }
    }

    return { valid: true };
  } catch (error: any) {
    console.error(`[Email Validation] Error validating ${email}:`, error.message);
    return { valid: true }; // Fail open on errors
  }
}

/**
 * Quick check if a domain is disposable (no MX or DeBounce check)
 */
export function isDisposableDomain(domain: string): boolean {
  const normalizedDomain = domain.toLowerCase();
  return (
    isDiscoveredDomain(normalizedDomain) ||
    isInScrapedBlocklist(normalizedDomain) ||
    isInGitHubBlocklist(normalizedDomain)
  );
}

/**
 * Get stats about all blocklists
 */
export function getValidatorStats(): {
  githubBlocklist: ReturnType<typeof getGitHubBlocklistStats>;
  scrapedDomains: ReturnType<typeof getScrapedDomainsStats>;
  discoveredDomains: ReturnType<typeof getDiscoveredDomainsStats>;
  debounceCache: ReturnType<typeof getDebounceCacheStats>;
} {
  return {
    githubBlocklist: getGitHubBlocklistStats(),
    scrapedDomains: getScrapedDomainsStats(),
    discoveredDomains: getDiscoveredDomainsStats(),
    debounceCache: getDebounceCacheStats(),
  };
}

// Re-export utility functions
export { addDiscoveredDomain, reloadDiscoveredDomains };
