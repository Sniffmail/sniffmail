import type { SniffmailConfig, CacheTtlConfig } from './types';

const API_URL = 'https://api.sniffmail.io';

const DEFAULT_TTL: Required<CacheTtlConfig> = {
  safe: 604800, // 7 days
  invalid: 2592000, // 30 days
  risky: 86400, // 1 day
  unknown: 0, // don't cache
};

let globalConfig: SniffmailConfig = {};

export function configure(opts: SniffmailConfig): void {
  globalConfig = {
    ...globalConfig,
    ...opts,
    cache: {
      enabled: opts.cache?.enabled ?? globalConfig.cache?.enabled ?? true,
      store: opts.cache?.store ?? globalConfig.cache?.store,
      ttl: {
        ...DEFAULT_TTL,
        ...globalConfig.cache?.ttl,
        ...opts.cache?.ttl,
      },
    },
  };
}

export function getConfig(): SniffmailConfig {
  return globalConfig;
}

export function getApiUrl(): string {
  return API_URL;
}

export function getApiKey(): string | undefined {
  return globalConfig.apiKey || process.env.SNIFFMAIL_API_KEY;
}

export function getCacheTtl(status: 'safe' | 'invalid' | 'risky' | 'unknown'): number {
  return globalConfig.cache?.ttl?.[status] ?? DEFAULT_TTL[status];
}

export function isCacheEnabled(): boolean {
  return globalConfig.cache?.enabled ?? true;
}
