/**
 * Email Validation Service v2
 *
 * Validates emails to detect disposable/burner addresses and verify mailbox existence.
 * Combines multiple sources for maximum coverage:
 *
 * 1. Syntax validation
 * 2. Disposable domain detection (GitHub blocklist, scraped domains, discovered domains)
 * 3. MX record lookup (via node-email-verifier)
 * 4. DeBounce API check
 * 5. Deep SMTP verification via Reacher backend (optional)
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
import { checkMailbox, ReacherNotConfiguredError } from './reacher/client';
import type { ReacherResponse } from './reacher/types';
import { getFromCache, setInCache } from './cache';
import { getCacheTtl, isCacheEnabled } from './config';
import type {
  ValidationResult,
  ValidationOptions,
  SmtpResult,
  ValidationReason,
  ReachableStatus,
} from './types';

// Legacy types for backwards compatibility
export interface EmailValidationResult {
  valid: boolean;
  reason?: 'invalid_format' | 'disposable_domain' | 'no_mx_record' | 'dns_error';
  message?: string;
  source?: string;
}

// Legacy options type (subset of new ValidationOptions)
export type { ValidationOptions };

interface DetailedValidationResult {
  valid: boolean;
  email: string;
  format: { valid: boolean; reason?: string };
  mx?: { valid: boolean; reason?: string };
  disposable?: { valid: boolean; provider?: string; reason?: string };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate an email address
 *
 * @param email - Email address to validate
 * @param options - Validation options
 * @returns Validation result with detailed information
 *
 * @example
 * // Quick mode (default) - syntax, disposable, and MX checks only
 * const result = await validateEmail('someone@temp-mail.org');
 *
 * @example
 * // Deep mode - includes SMTP mailbox verification via Reacher
 * const result = await validateEmail('fakeperson@google.com', { deep: true });
 */
export async function validateEmail(
  email: string,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const { deep = false, checkMx = true, useDeBounce = true, timeout = 5 } = options;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Step 1: Syntax check
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return createResult(normalizedEmail, {
        valid: false,
        reason: 'invalid_syntax',
        disposable: false,
        mx: false,
      });
    }

    const [, domain] = normalizedEmail.split('@') as [string, string];

    // Step 2: Disposable domain check
    if (isDisposableDomain(domain)) {
      return createResult(normalizedEmail, {
        valid: false,
        reason: 'disposable',
        disposable: true,
        mx: false,
      });
    }

    // Step 3: MX record and additional disposable checks via node-email-verifier
    const nodeResult = (await emailValidator(normalizedEmail, {
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

    if (!nodeResult.format.valid) {
      return createResult(normalizedEmail, {
        valid: false,
        reason: 'invalid_syntax',
        disposable: false,
        mx: false,
      });
    }

    if (nodeResult.disposable && !nodeResult.disposable.valid) {
      return createResult(normalizedEmail, {
        valid: false,
        reason: 'disposable',
        disposable: true,
        mx: nodeResult.mx?.valid ?? false,
      });
    }

    if (checkMx && nodeResult.mx && !nodeResult.mx.valid) {
      return createResult(normalizedEmail, {
        valid: false,
        reason: 'no_mx_records',
        disposable: false,
        mx: false,
      });
    }

    // DeBounce API check
    if (useDeBounce) {
      const isDisposable = await checkDeBounceAPI(normalizedEmail);
      if (isDisposable) {
        return createResult(normalizedEmail, {
          valid: false,
          reason: 'disposable',
          disposable: true,
          mx: true,
        });
      }
    }

    // If not deep mode, we're done
    if (!deep) {
      return createResult(normalizedEmail, {
        valid: true,
        reason: null,
        disposable: false,
        mx: true,
      });
    }

    // Step 4: Cache check (deep mode only)
    if (isCacheEnabled()) {
      const cached = await getFromCache(normalizedEmail);
      if (cached) {
        const cachedResult = JSON.parse(cached) as ValidationResult;
        return { ...cachedResult, cached: true };
      }
    }

    // Step 5: Deep SMTP verification via Reacher
    const reacherResponse = await checkMailbox(normalizedEmail);
    const result = transformReacherResponse(normalizedEmail, reacherResponse);

    // Cache based on result type
    if (isCacheEnabled()) {
      const ttl = getCacheTtl(reacherResponse.is_reachable);
      if (ttl > 0) {
        await setInCache(normalizedEmail, JSON.stringify(result), ttl);
      }
    }

    return result;
  } catch (error) {
    if (error instanceof ReacherNotConfiguredError) {
      throw error; // Let this propagate so users know to configure Reacher
    }

    console.error(`[Email Validation] Error validating ${email}:`, (error as Error).message);

    // Fail open on errors (except configuration errors)
    return createResult(normalizedEmail, {
      valid: true,
      reason: null,
      disposable: false,
      mx: true,
    });
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

// Helper functions

function createResult(
  email: string,
  opts: {
    valid: boolean;
    reason: ValidationReason;
    disposable: boolean;
    mx: boolean;
    smtp?: SmtpResult;
    cached?: boolean;
  }
): ValidationResult {
  return {
    email,
    valid: opts.valid,
    reason: opts.reason,
    disposable: opts.disposable,
    mx: opts.mx,
    smtp: opts.smtp ?? null,
    cached: opts.cached ?? false,
  };
}

function transformReacherResponse(email: string, response: ReacherResponse): ValidationResult {
  const isReachable = response.is_reachable as ReachableStatus;
  const isValid = isReachable === 'safe';

  let reason: ValidationReason = null;
  if (!isValid) {
    reason = mapReacherStatusToReason(response);
  }

  return {
    email,
    valid: isValid,
    reason,
    disposable: response.misc.is_disposable,
    mx: response.mx.accepts_mail,
    smtp: {
      is_reachable: isReachable,
      can_connect: response.smtp.can_connect_smtp,
      is_deliverable: response.smtp.is_deliverable,
      is_catch_all: response.smtp.is_catch_all,
    },
    cached: false,
  };
}

function mapReacherStatusToReason(response: ReacherResponse): ValidationReason {
  if (response.misc.is_disposable) {
    return 'disposable';
  }

  if (!response.mx.accepts_mail) {
    return 'no_mx_records';
  }

  if (!response.smtp.can_connect_smtp) {
    return 'smtp_error';
  }

  if (response.smtp.has_full_inbox) {
    return 'mailbox_full';
  }

  if (response.smtp.is_disabled) {
    return 'mailbox_disabled';
  }

  if (response.smtp.is_catch_all) {
    return 'catch_all';
  }

  if (!response.smtp.is_deliverable) {
    return 'mailbox_not_found';
  }

  return null;
}

// Re-export utility functions
export { addDiscoveredDomain, reloadDiscoveredDomains };
