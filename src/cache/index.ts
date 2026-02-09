import type { CacheStore } from '../types';
import { getConfig } from '../config';
import { MemoryCache } from './memory';

export type { CacheStore };
export { MemoryCache } from './memory';
export { RedisCache } from './redis';

const CACHE_PREFIX = 'sniffmail:';

let defaultCache: MemoryCache | null = null;

function getDefaultCache(): MemoryCache {
  if (!defaultCache) {
    defaultCache = new MemoryCache();
  }
  return defaultCache;
}

export function getCacheStore(): CacheStore {
  const config = getConfig();
  return config.cache?.store ?? getDefaultCache();
}

export function getCacheKey(email: string): string {
  return `${CACHE_PREFIX}${email.toLowerCase().trim()}`;
}

export async function getFromCache(email: string): Promise<string | null> {
  const store = getCacheStore();
  return store.get(getCacheKey(email));
}

export async function setInCache(
  email: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  if (ttlSeconds <= 0) {
    return;
  }
  const store = getCacheStore();
  await store.set(getCacheKey(email), value, ttlSeconds);
}

export async function deleteFromCache(email: string): Promise<void> {
  const store = getCacheStore();
  if (store.delete) {
    await store.delete(getCacheKey(email));
  }
}
