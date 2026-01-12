/**
 * DeBounce API Integration
 *
 * Free unlimited API for real-time disposable email detection.
 * @see https://debounce.com/free-disposable-check-api/
 */

const DEBOUNCE_API_URL = 'https://disposable.debounce.io/';

// Cache for DeBounce API results
const debounceCache = new Map<string, { disposable: boolean; expiresAt: number }>();
const DEBOUNCE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check domain against DeBounce free API
 */
export async function checkDeBounceAPI(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;

  // Check cache first
  const cached = debounceCache.get(domain);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.disposable;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${DEBOUNCE_API_URL}?email=${encodeURIComponent(email)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { disposable: string };
    const isDisposable = data.disposable === 'true';

    // Cache result
    debounceCache.set(domain, {
      disposable: isDisposable,
      expiresAt: Date.now() + DEBOUNCE_CACHE_TTL,
    });

    return isDisposable;
  } catch (error: any) {
    // On timeout or error, fail open
    console.error(`[DeBounce API] Error for ${domain}:`, error.message);
    return false;
  }
}

/**
 * Get cache stats
 */
export function getDebounceCacheStats(): {
  size: number;
} {
  return {
    size: debounceCache.size,
  };
}
