/**
 * Discovered Domains from Live API Scraping
 *
 * Loads domains from a JSON file that is updated by a GitHub Action.
 * The GitHub Action runs daily and scrapes domains from temp mail service APIs.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File containing discovered domains
// When built, __dirname is 'dist/', so we need to look in 'src/data/' from package root
// When in dev, __dirname is 'src/sources/', so '../data/' works
const packageRoot = path.resolve(__dirname, __dirname.includes('dist') ? '..' : '../..');
const DISCOVERED_DOMAINS_FILE = path.join(packageRoot, 'src/data/discovered-domains.json');

let discoveredDomains: Set<string> = new Set();
let lastLoadTime = 0;
const RELOAD_INTERVAL = 60 * 60 * 1000; // Reload every hour

/**
 * Load discovered domains from disk
 */
async function loadDiscoveredDomains(): Promise<void> {
  try {
    const data = await fs.readFile(DISCOVERED_DOMAINS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed.domains)) {
      discoveredDomains = new Set(parsed.domains);
      lastLoadTime = Date.now();
      console.log(`[Discovered Domains] Loaded ${discoveredDomains.size} domains from disk`);
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error('[Discovered Domains] Error loading:', error.message);
    } else {
      console.log('[Discovered Domains] No discovered-domains.json file found');
    }
    discoveredDomains = new Set();
  }
}

/**
 * Check if a domain was discovered by the scraper
 */
export function isDiscoveredDomain(domain: string): boolean {
  if (Date.now() - lastLoadTime > RELOAD_INTERVAL) {
    loadDiscoveredDomains();
  }

  return discoveredDomains.has(domain.toLowerCase());
}

/**
 * Get all discovered domains
 */
export function getDiscoveredDomains(): Set<string> {
  return discoveredDomains;
}

/**
 * Manually add a domain
 */
export async function addDiscoveredDomain(domain: string): Promise<void> {
  const normalizedDomain = domain.toLowerCase();
  if (!discoveredDomains.has(normalizedDomain)) {
    discoveredDomains.add(normalizedDomain);

    try {
      const data = {
        domains: Array.from(discoveredDomains).sort(),
        lastScrape: Date.now(),
        count: discoveredDomains.size,
      };
      await fs.writeFile(DISCOVERED_DOMAINS_FILE, JSON.stringify(data, null, 2));
      console.log(`[Discovered Domains] Added: ${normalizedDomain}`);
    } catch (error: any) {
      console.error('[Discovered Domains] Error saving:', error.message);
    }
  }
}

/**
 * Trigger a reload from disk
 */
export async function reloadDiscoveredDomains(): Promise<string[]> {
  const previousCount = discoveredDomains.size;
  await loadDiscoveredDomains();
  const newCount = discoveredDomains.size;

  if (newCount > previousCount) {
    console.log(`[Discovered Domains] Loaded ${newCount - previousCount} new domains`);
  }

  return [];
}

/**
 * Get scraper stats
 */
export function getDiscoveredDomainsStats(): {
  totalDomains: number;
  lastLoad: number;
  healthy: boolean;
  healthWarnings: string[];
} {
  const warnings: string[] = [];

  if (discoveredDomains.size < 10) {
    warnings.push(
      `Suspiciously low domain count (${discoveredDomains.size}). File may be corrupted.`
    );
  }

  const TWO_DAYS = 48 * 60 * 60 * 1000;
  if (lastLoadTime > 0 && Date.now() - lastLoadTime > TWO_DAYS) {
    warnings.push(
      `Domain data is stale (${Math.round((Date.now() - lastLoadTime) / (60 * 60 * 1000))} hours old).`
    );
  }

  if (lastLoadTime === 0 && discoveredDomains.size === 0) {
    warnings.push('Domain file was never loaded.');
  }

  return {
    totalDomains: discoveredDomains.size,
    lastLoad: lastLoadTime,
    healthy: warnings.length === 0,
    healthWarnings: warnings,
  };
}

// Initialize on module load
loadDiscoveredDomains();
