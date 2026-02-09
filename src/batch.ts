/**
 * Batch email validation
 */

import { validateEmail } from './validator';
import type {
  ValidationResult,
  BatchValidationOptions,
  BatchValidationResult,
} from './types';

const DEFAULT_CONCURRENCY = 5;

/**
 * Validate multiple email addresses
 *
 * @param emails - Array of email addresses to validate
 * @param options - Validation options including concurrency control
 * @returns Batch validation results with summary
 *
 * @example
 * const results = await validateEmails(
 *   ['a@gmail.com', 'b@temp-mail.org', 'c@company.com'],
 *   { deep: true, concurrency: 5 }
 * );
 */
export async function validateEmails(
  emails: string[],
  options: BatchValidationOptions = {}
): Promise<BatchValidationResult> {
  const { concurrency = DEFAULT_CONCURRENCY, ...validationOptions } = options;

  // Use dynamic import for p-limit to avoid bundling issues
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(concurrency);

  const results = await Promise.all(
    emails.map((email) => limit(() => validateEmail(email, validationOptions)))
  );

  const summary = calculateSummary(results);

  return { results, summary };
}

function calculateSummary(results: ValidationResult[]): BatchValidationResult['summary'] {
  return {
    total: results.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid && r.reason !== 'disposable').length,
    disposable: results.filter((r) => r.disposable).length,
    unknown: results.filter(
      (r) => r.smtp?.is_reachable === 'unknown'
    ).length,
  };
}
