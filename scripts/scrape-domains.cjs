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

// File extensions and patterns that are NOT valid email domains
const INVALID_DOMAIN_PATTERNS = [
  /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json|xml|html|htm|php|asp|aspx)$/i,
  /^(www|api|cdn|static|assets|images|img|fonts|scripts|styles)\./i,
];

// Known non-email domains to filter out
const NON_EMAIL_DOMAINS = new Set([
  'temp-mail.org', 'google.com', 'cloudflare.com', 'jsdelivr.net', 'github.com',
  'googleapis.com', 'gstatic.com', 'facebook.com', 'twitter.com', 'cloudflare.net',
  'favicon.ico', 'w3.org', 'schema.org', 'jquery.com', 'bootstrapcdn.com',
  'fontawesome.com', 'unpkg.com', 'npmjs.com', 'cdnjs.cloudflare.com',
]);

/**
 * Validates if a string looks like a legitimate email domain
 */
function isValidEmailDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;

  const d = domain.toLowerCase().trim();

  // Must have at least one dot
  if (!d.includes('.')) return false;

  // Check against invalid patterns
  for (const pattern of INVALID_DOMAIN_PATTERNS) {
    if (pattern.test(d)) return false;
  }

  // Check against known non-email domains
  if (NON_EMAIL_DOMAINS.has(d)) return false;

  // Must match basic domain format (alphanumeric, hyphens, dots)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d)) {
    return false;
  }

  // TLD must be at least 2 chars and not look like a file extension
  const tld = d.split('.').pop();
  if (tld.length < 2 || ['ico', 'js', 'css', 'png', 'jpg', 'gif', 'svg'].includes(tld)) {
    return false;
  }

  return true;
}

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
  tempMailOrg: { success: false, domains: [], count: 0 },
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
    console.log('[temp-mail.org] Launching Puppeteer (non-headless for web2 mailbox)...');
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode for better compatibility
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // Additional anti-detection
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    await page.setViewport({ width: 1920, height: 1080 });

    // Intercept network requests to capture domain info from API calls
    const capturedDomains = new Set();
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      request.continue();
    });

    page.on('response', async (response) => {
      const url = response.url();
      // Capture any API responses that might contain domain info
      if (url.includes('api') || url.includes('domain') || url.includes('mail')) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const text = await response.text();
            // Look for domain patterns in JSON responses
            const domainMatches = text.match(/[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/g);
            if (domainMatches) {
              domainMatches.forEach((d) => {
                const domain = d.toLowerCase();
                if (isValidEmailDomain(domain)) {
                  capturedDomains.add(domain);
                }
              });
            }
          }
        } catch (e) {
          // Ignore response parsing errors
        }
      }
    });

    console.log('[temp-mail.org] Navigating to web2 mailbox...');
    await page.goto('https://web2.temp-mail.org/mailbox', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    console.log('[temp-mail.org] Waiting for page to load...');
    await new Promise((resolve) => setTimeout(resolve, 8000));

    // Try to find email address displayed on the page
    const pageData = await page.evaluate(() => {
      const text = document.body.innerText || '';

      // Look for email patterns
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

      // Also look in input fields
      const inputs = document.querySelectorAll('input');
      let inputEmail = null;
      inputs.forEach((input) => {
        const val = input.value || '';
        if (val.includes('@')) {
          inputEmail = val;
        }
      });

      // Look for domain in select dropdowns or domain lists
      const selects = document.querySelectorAll('select');
      const selectDomains = [];
      selects.forEach((select) => {
        const options = select.querySelectorAll('option');
        options.forEach((opt) => {
          const val = opt.value || opt.textContent || '';
          if (val.includes('.') && !val.includes(' ')) {
            selectDomains.push(val);
          }
        });
      });

      // Look for domains in any element with domain-related class/id
      const domainElements = document.querySelectorAll('[class*="domain"], [id*="domain"], [data-domain]');
      const elementDomains = [];
      domainElements.forEach((el) => {
        const text = el.textContent || el.getAttribute('data-domain') || '';
        if (text.includes('.')) {
          elementDomains.push(text.trim());
        }
      });

      return {
        email: emailMatch ? emailMatch[0] : inputEmail,
        selectDomains,
        elementDomains,
        pageText: text.substring(0, 5000), // First 5000 chars for debugging
      };
    });

    console.log('[temp-mail.org] Page data extracted');

    const foundDomains = new Set();

    // Add captured domains from network requests
    capturedDomains.forEach((d) => foundDomains.add(d));

    // Extract domain from email if found
    if (pageData.email && pageData.email.includes('@')) {
      const domain = pageData.email.split('@')[1]?.toLowerCase();
      if (domain) {
        console.log('[temp-mail.org] Found email domain: ' + domain);
        foundDomains.add(domain);
      }
    }

    // Add domains from select dropdowns
    pageData.selectDomains.forEach((d) => {
      const domain = d.toLowerCase().replace('@', '');
      if (isValidEmailDomain(domain)) {
        foundDomains.add(domain);
      }
    });

    // Add domains from elements
    pageData.elementDomains.forEach((d) => {
      const domain = d.toLowerCase().replace('@', '');
      if (isValidEmailDomain(domain)) {
        foundDomains.add(domain);
      }
    });

    // Also extract any domains from page text
    const textDomains = pageData.pageText.match(/[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/g);
    if (textDomains) {
      textDomains.forEach((d) => {
        const domain = d.toLowerCase();
        if (isValidEmailDomain(domain)) {
          foundDomains.add(domain);
        }
      });
    }

    if (foundDomains.size > 0) {
      const domainsArray = Array.from(foundDomains);
      console.log('[temp-mail.org] Found domains: ' + domainsArray.join(', '));
      results.tempMailOrg = { success: true, domains: domainsArray, count: domainsArray.length };
      return domainsArray;
    }

    // Fallback: take a screenshot for debugging (only in CI)
    if (process.env.CI) {
      const screenshotPath = '/tmp/temp-mail-debug.png';
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('[temp-mail.org] Debug screenshot saved to: ' + screenshotPath);
    }

    results.tempMailOrg = { success: false, error: 'Could not extract domains from web2 mailbox' };
    results.errors.push('temp-mail.org: Could not extract domains from web2 mailbox');
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
