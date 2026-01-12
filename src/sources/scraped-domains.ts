/**
 * Scraped Domains from deviceandbrowserinfo.com
 *
 * Fetches disposable email domains from multiple providers.
 * @see https://deviceandbrowserinfo.com/data/emails/providers
 */

// Providers to scrape
const SCRAPED_PROVIDERS = [
  { name: 'temp-mail.org', slug: 'temp-mail-org' },
  { name: 'tinyhost.shop', slug: 'tinyhost-shop' },
  { name: 'email-fake.com', slug: 'email-fake-com' },
  { name: 'emailfake', slug: 'emailfake' },
  { name: 'tempm.com', slug: 'tempm' },
  { name: 'yopmail.com', slug: 'yopmail-com' },
];

// Fallback static list
const FALLBACK_TEMP_MAIL_DOMAINS = [
  'akixpres.com', 'eubonus.com', 'feanzier.com', 'atinjo.com', 'ixospace.com',
  'imfaya.com', 'jparksky.com', 'gopicta.com', 'markuto.com', 'emaxasp.com',
  'icousd.com', '24faw.com', 'gavrom.com', 'cucadas.com', 'hudisk.com',
  'cameltok.com', 'dubokutv.com', 'fftube.com', 'roratu.com', 'arugy.com',
  'nctime.com', 'mucate.com', 'mekuron.com', 'm3player.com', 'gamintor.com',
  'tvtmall.com', 'sofreak.com', 'senione.com', 'sanszero.com', 'sesedm.com',
  'tazines.com', 'alexida.com', 'naqulu.com', 'discounp.com', 'lawior.com',
  'crsay.com', 'kudimi.com', 'roastic.com', 'asurad.com', 'zaxcal.com',
  'besaies.com', 'skateru.com', 'vipsalut.com', 'tieal.com', 'xanwich.com',
  'ncien.com', 'inupup.com', 'safetoca.com', 'mirarmax.com', 'cspaus.com',
  'certve.com', 'pouxing.com', 'dextrago.com', 'paovod.com', 'salexup.com',
  'knilok.com', 'solca1.com', 'dpwev.com', 'taketik.com', 'vidwobox.com',
  'ishense.com', 'merumart.com', 'wmxgroup.com', 'poesd.com', 'fanwn.com',
  'kwifa.com', 'ekuali.com', 'upmusk.com', 'reifide.com', 'obirah.com',
  'tosvot.com', 'vnziu.com', 'walakato.com', 'taynit.com', 'harkonin.com',
  'cerisun.com', 'cnguopin.com', 'dotxan.com', 'bitfami.com', 'mangatoo.com',
  'frestle.com', 'artvara.com', 'exiond.com', 'anysilo.com', 'camjoint.com',
  'dawhe.com', 'jshiba.com', 'nariapp.com', 'avastu.com', 'exoular.com',
  'doulas.org', 'cindalle.com', 'nestvia.com', 'kenfern.com', 'jontra.com',
  'seondes.com', 'adrais.com', 'ecstor.com', 'lero3.com', 'comsb.com',
  'dni8.com', 'moranfx.com', 'ndiety.com', 'sablecc.com', 'phamay.com',
  'avtolev.com', 'w3heroes.com', 'beltng.com', 'miwacle.com', 'ingitel.com',
  'yyxxi.com',
];

let scrapedDomains: Set<string> = new Set();
let scrapedDomainsLoaded = false;
let scrapedDomainsLastFetch = 0;
const BLOCKLIST_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

const FALLBACK_DOMAINS_SET = new Set(FALLBACK_TEMP_MAIL_DOMAINS);

/**
 * Scrape domains from a single provider page
 */
async function scrapeProviderDomains(slug: string, providerName: string): Promise<string[]> {
  const url = `https://deviceandbrowserinfo.com/data/emails/providers/details/${slug}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BurnerEmailValidator/1.0)',
    },
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${providerName}`);
  }

  const html = await response.text();

  // Extract domains from HTML
  const domainPattern = /\b([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}\b/gi;
  const matches = html.match(domainPattern) || [];

  const excluded = new Set([
    'deviceandbrowserinfo.com',
    'google.com',
    'facebook.com',
    'twitter.com',
    'github.com',
    'cloudflare.com',
    'jsdelivr.net',
    'w3.org',
    'schema.org',
    'temp-mail.org',
    'tinyhost.shop',
    'email-fake.com',
    'tempm.com',
    'yopmail.com',
  ]);

  return matches
    .map((d) => d.toLowerCase().replace(/^www\./, '').replace(/^webmail\./, ''))
    .filter((d) =>
      !excluded.has(d) &&
      !d.endsWith('.js') &&
      !d.endsWith('.css') &&
      !d.endsWith('.png') &&
      !d.endsWith('.jpg') &&
      d.split('.').length >= 2
    );
}

/**
 * Fetch disposable email domains from multiple providers
 */
export async function fetchScrapedDomains(): Promise<void> {
  console.log('[Scraped Domains] Fetching from deviceandbrowserinfo.com...');

  const allDomains: string[] = [];
  const results: { provider: string; count: number }[] = [];

  const fetchPromises = SCRAPED_PROVIDERS.map(async ({ name, slug }) => {
    try {
      const domains = await scrapeProviderDomains(slug, name);
      return { provider: name, domains, error: null };
    } catch (error: any) {
      return { provider: name, domains: [], error: error.message };
    }
  });

  const providerResults = await Promise.all(fetchPromises);

  for (const result of providerResults) {
    if (result.error) {
      console.warn(`[Scraped Domains] Failed to fetch ${result.provider}: ${result.error}`);
    } else {
      allDomains.push(...result.domains);
      results.push({ provider: result.provider, count: result.domains.length });
    }
  }

  const uniqueDomains = [...new Set(allDomains)];

  if (uniqueDomains.length > 100) {
    scrapedDomains = new Set(uniqueDomains);
    scrapedDomainsLoaded = true;
    scrapedDomainsLastFetch = Date.now();
    console.log(
      `[Scraped Domains] Loaded ${scrapedDomains.size} domains:`,
      results.map((r) => `${r.provider}(${r.count})`).join(', ')
    );
  } else {
    console.warn(`[Scraped Domains] Only found ${uniqueDomains.length}, using fallback`);
    scrapedDomains = new Set(FALLBACK_TEMP_MAIL_DOMAINS);
    scrapedDomainsLoaded = true;
    scrapedDomainsLastFetch = Date.now();
    console.log(`[Scraped Domains] Using fallback with ${scrapedDomains.size} domains`);
  }
}

/**
 * Check if domain is in the scraped blocklist
 */
export function isInScrapedBlocklist(domain: string): boolean {
  if (scrapedDomainsLoaded && Date.now() - scrapedDomainsLastFetch > BLOCKLIST_REFRESH_INTERVAL) {
    fetchScrapedDomains();
  }

  const normalizedDomain = domain.toLowerCase();
  return scrapedDomains.has(normalizedDomain) || FALLBACK_DOMAINS_SET.has(normalizedDomain);
}

/**
 * Get scraped domains stats
 */
export function getScrapedDomainsStats(): {
  count: number;
  loaded: boolean;
  lastFetch: number;
} {
  return {
    count: scrapedDomains.size,
    loaded: scrapedDomainsLoaded,
    lastFetch: scrapedDomainsLastFetch,
  };
}

// Initialize on module load
fetchScrapedDomains();
