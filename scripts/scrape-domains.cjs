/**
 * Domain Scraper Script
 *
 * Scrapes disposable email domains from various temp mail services.
 * Run by GitHub Action daily to keep the blocklist updated.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const DISCOVERED_DOMAINS_FILE = path.join(__dirname, '../src/data/discovered-domains.json');
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;

// Allowlist - legitimate privacy services that should never be blocked
const ALLOWLIST = new Set([
  'simplelogin.com',
  'simplelogin.co',
  'aleeas.com',
  'anonaddy.me',
  'anonaddy.com',
  'addy.io',
  'duckduckgo.com',
  'duck.com',
  'privaterelay.appleid.com',
  'icloud.com',
  'me.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'tutanota.com',
  'tuta.io',
  'fastmail.com',
  'fastmail.fm',
]);

// API endpoints for various temp mail services
const TEMP_MAIL_APIS = [
  {
    name: 'mail.tm',
    url: 'https://api.mail.tm/domains',
    method: 'GET',
    parser: (data) => {
      if (data['hydra:member']) {
        return data['hydra:member'].map((d) => d.domain?.toLowerCase()).filter(Boolean);
      }
      return [];
    },
  },
  {
    name: 'guerrillamail',
    url: 'https://api.guerrillamail.com/ajax.php?f=get_email_address',
    method: 'GET',
    parser: (data) => {
      if (data.email_addr) {
        const domain = data.email_addr.split('@')[1];
        return domain ? [domain.toLowerCase()] : [];
      }
      return [];
    },
  },
  {
    name: 'dropmail.me',
    url: 'https://dropmail.me/api/graphql/web-test-wgq0e4',
    method: 'POST',
    body: JSON.stringify({ query: '{ domains { name } }' }),
    contentType: 'application/json',
    parser: (data) => {
      if (data?.data?.domains) {
        return data.data.domains.map((d) => d.name?.toLowerCase()).filter(Boolean);
      }
      return [];
    },
  },
];

// Known temp mail domains (hardcoded for reliability)
const KNOWN_TEMP_DOMAINS = [
  // Guerrillamail
  'guerrillamail.com',
  'guerrillamail.org',
  'guerrillamail.net',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamailblock.com',
  'pokemail.net',
  'spam4.me',
  'grr.la',
  'sharklasers.com',
  // 1secmail
  '1secmail.com',
  '1secmail.org',
  '1secmail.net',
  'wwjmp.com',
  'esiix.com',
  'xojxe.com',
  'yoggm.com',
  // tempmail.lol
  'tempmail.lol',
  'smashmail.de',
  'dropmail.me',
  // Other common temp mail domains
  'temp-mail.org',
  'tempmail.com',
  'throwaway.email',
  'throwawaymail.com',
  'mailinator.com',
  'maildrop.cc',
  'getnada.com',
  'mohmal.com',
  'tempail.com',
  'fakeinbox.com',
  'mintemail.com',
  'yopmail.com',
  'yopmail.fr',
  'dispostable.com',
  'mailnesia.com',
  'trashmail.com',
  'getairmail.com',
  '10minutemail.com',
  '10minutemail.net',
  'tempr.email',
  'discard.email',
  'spamgourmet.com',
  'mytrashmail.com',
  'mt2015.com',
  'thankyou2010.com',
];

// Track scraping results
const results = {
  apis: {},
  tempMailOrg: { success: false, domain: null },
  errors: [],
};

async function fetchFromAPI(api) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
    };

    if (api.contentType) {
      headers['Content-Type'] = api.contentType;
    }

    const response = await fetch(api.url, {
      method: api.method,
      signal: controller.signal,
      headers,
      body: api.body,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const domains = api.parser(data);
    console.log(`[${api.name}] Found ${domains.length} domains`);
    results.apis[api.name] = { success: true, count: domains.length };
    return domains;
  } catch (error) {
    console.error(`[${api.name}] Error:`, error.message);
    results.apis[api.name] = { success: false, error: error.message };
    results.errors.push(`${api.name}: ${error.message}`);
    return [];
  }
}

async function scrapeTempMailOrg() {
  let browser;
  try {
    console.log('[temp-mail.org] Launching Puppeteer...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    await page.setViewport({ width: 1920, height: 1080 });

    console.log('[temp-mail.org] Navigating to page...');
    await page.goto('https://temp-mail.org/en/', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    console.log('[temp-mail.org] Waiting for email to appear...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await page.waitForFunction(
      `(() => {
        const text = document.body.innerText;
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);
        return emailMatch !== null;
      })()`,
      { timeout: 45000 }
    );

    const email = await page.evaluate(() => {
      const text = document.body.innerText;
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      return emailMatch ? emailMatch[0] : null;
    });

    if (email && email.includes('@')) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (domain) {
        console.log('[temp-mail.org] Found domain: ' + domain);
        results.tempMailOrg = { success: true, domain };
        return [domain];
      }
    }
    results.tempMailOrg = { success: false, error: 'Could not extract domain' };
    results.errors.push('temp-mail.org: Could not extract domain');
    return [];
  } catch (error) {
    console.error('[temp-mail.org] Error:', error.message);
    results.tempMailOrg = { success: false, error: error.message };
    results.errors.push('temp-mail.org: ' + error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  // Load existing domains
  let existingDomains = [];
  try {
    const data = JSON.parse(fs.readFileSync(DISCOVERED_DOMAINS_FILE, 'utf-8'));
    existingDomains = data.domains || [];
    console.log(`Loaded ${existingDomains.length} existing domains`);
  } catch (e) {
    console.log('No existing domains file, starting fresh');
  }

  const allDomains = new Set(existingDomains);
  const previousCount = allDomains.size;

  // Add known domains
  for (const domain of KNOWN_TEMP_DOMAINS) {
    if (!ALLOWLIST.has(domain)) {
      allDomains.add(domain);
    }
  }

  // Fetch from APIs
  const apiResults = await Promise.all(TEMP_MAIL_APIS.map(fetchFromAPI));
  for (const domains of apiResults) {
    for (const domain of domains) {
      if (!ALLOWLIST.has(domain)) {
        allDomains.add(domain);
      }
    }
  }

  // Scrape temp-mail.org
  const tempMailDomains = await scrapeTempMailOrg();
  for (const domain of tempMailDomains) {
    if (!ALLOWLIST.has(domain)) {
      allDomains.add(domain);
    }
  }

  const newCount = allDomains.size;
  const newDomainsAdded = newCount - previousCount;
  console.log(`Total domains: ${newCount} (was ${previousCount}, +${newDomainsAdded} new)`);

  // Save to file
  const output = {
    _comment:
      'AUTO-GENERATED FILE - DO NOT EDIT MANUALLY. Updated daily by GitHub Action.',
    domains: Array.from(allDomains).sort(),
    lastScrape: Date.now(),
    count: allDomains.size,
  };
  fs.writeFileSync(DISCOVERED_DOMAINS_FILE, JSON.stringify(output, null, 2));
  console.log('Saved domains to file');

  // Write outputs for GitHub Actions
  if (GITHUB_OUTPUT) {
    fs.appendFileSync(GITHUB_OUTPUT, `total_domains=${newCount}\n`);
    fs.appendFileSync(GITHUB_OUTPUT, `new_domains=${newDomainsAdded}\n`);
    fs.appendFileSync(GITHUB_OUTPUT, `errors=${results.errors.length}\n`);
    fs.appendFileSync(GITHUB_OUTPUT, `error_list=${results.errors.join('; ')}\n`);
  }

  // Print summary
  console.log('\n=== SCRAPE SUMMARY ===');
  console.log(`Total domains: ${newCount}`);
  console.log(`New domains added: ${newDomainsAdded}`);
  console.log(`Errors: ${results.errors.length}`);
  if (results.errors.length > 0) {
    console.log('Error details:');
    results.errors.forEach((e) => console.log(`  - ${e}`));
  }

  // Exit with error if all scrapers failed
  const successfulScrapers =
    Object.values(results.apis).filter((r) => r.success).length +
    (results.tempMailOrg.success ? 1 : 0);
  if (successfulScrapers === 0) {
    console.error('\nCRITICAL: All scrapers failed!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
