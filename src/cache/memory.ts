import type { CacheStore } from '../types';

interface CacheEntry {
  value: string;
  expires: number;
}

export class MemoryCache implements CacheStore {
  private store = new Map<string, CacheEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }

    this.store.set(key, {
      value,
      expires: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
