import type { CacheStore } from '../types';

type RedisClient = {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

export class RedisCache implements CacheStore {
  private client: RedisClient;

  constructor(client: RedisClient) {
    this.client = client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }
    await this.client.setex(key, ttlSeconds, value);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}
