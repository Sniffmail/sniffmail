/**
 * GitHub Disposable Email Blocklist
 *
 * Fetches and caches the community-maintained list of disposable email domains.
 * @see https://github.com/disposable/disposable-email-domains
 */

const GITHUB_BLOCKLIST_URL =
  'https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains_strict.txt';

let githubBlocklist: Set<string> = new Set();
let blocklistLoaded = false;
let blocklistLastFetch = 0;
const BLOCKLIST_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch the disposable email blocklist from GitHub
 */
export async function fetchGitHubBlocklist(): Promise<void> {
  try {
    console.log('[GitHub Blocklist] Fetching disposable email blocklist...');
    const response = await fetch(GITHUB_BLOCKLIST_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const domains = text
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith('#'));

    githubBlocklist = new Set(domains);
    blocklistLoaded = true;
    blocklistLastFetch = Date.now();

    console.log(`[GitHub Blocklist] Loaded ${githubBlocklist.size} disposable domains`);
  } catch (error: any) {
    console.error('[GitHub Blocklist] Failed to fetch:', error.message);
  }
}

/**
 * Check if domain is in the GitHub blocklist
 */
export function isInGitHubBlocklist(domain: string): boolean {
  // Refresh blocklist if stale
  if (blocklistLoaded && Date.now() - blocklistLastFetch > BLOCKLIST_REFRESH_INTERVAL) {
    fetchGitHubBlocklist();
  }

  const normalizedDomain = domain.toLowerCase();

  // Check exact match
  if (githubBlocklist.has(normalizedDomain)) {
    return true;
  }

  // Check subdomains (e.g., mail.tempmail.com -> tempmail.com)
  const parts = normalizedDomain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parentDomain = parts.slice(i).join('.');
    if (githubBlocklist.has(parentDomain)) {
      return true;
    }
  }

  return false;
}

/**
 * Get blocklist stats
 */
export function getGitHubBlocklistStats(): {
  count: number;
  loaded: boolean;
  lastFetch: number;
} {
  return {
    count: githubBlocklist.size,
    loaded: blocklistLoaded,
    lastFetch: blocklistLastFetch,
  };
}

// Initialize on module load
fetchGitHubBlocklist();
