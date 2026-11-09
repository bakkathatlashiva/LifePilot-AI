import { Redis } from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

// Parse connection URL (accepts valkey://, redis://, rediss://)
const rawUrl = env.VALKEY_URL || env.REDIS_URL || 'redis://127.0.0.1:6379';
const normalizedUrl = rawUrl.replace(/^valkey:\/\//i, 'redis://');
const isTls = normalizedUrl.startsWith('rediss://');

export const valkeyClient = new Redis(normalizedUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
  tls: isTls ? { rejectUnauthorized: false } : undefined,
  retryStrategy(times) {
    if (times > 20) {
      return 10000;
    }
    const delay = Math.min(times * 150, 3000);
    return delay;
  },
});

let isValkeyConnected = false;
let lastErrorLogTime = 0;

valkeyClient.on('connect', async () => {
  try {
    const info = await valkeyClient.info('server');
    const isValkey = info.toLowerCase().includes('valkey');
    const versionMatch = info.match(/(?:valkey_version|redis_version):([^\r\n]+)/);
    const version = versionMatch ? versionMatch[1].trim() : 'active';
    isValkeyConnected = true;
    logger.info(`✅ In-Memory Data Store connected: ${isValkey ? 'Valkey' : 'Redis'} (v${version})`);
  } catch {
    isValkeyConnected = true;
    logger.info('✅ In-Memory Data Store (Valkey/Redis) connected');
  }
});

valkeyClient.on('error', (err) => {
  isValkeyConnected = false;
  const now = Date.now();
  if (now - lastErrorLogTime > 30000) {
    lastErrorLogTime = now;
    logger.warn(`Valkey/Redis warning (non-fatal): ${err.message} (background retry active)`);
  }
});

export function getIsValkeyConnected(): boolean {
  return isValkeyConnected && valkeyClient.status === 'ready';
}

/**
 * High-performance Cache & Storage Service powered by Valkey
 */
export const valkeyCache = {
  client: valkeyClient,
  /**
   * Get cached JSON object or value
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!getIsValkeyConnected()) return null;
    try {
      const data = await valkeyClient.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },

  /**
   * Set cached value with optional TTL (in seconds)
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!getIsValkeyConnected()) return false;
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await valkeyClient.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await valkeyClient.set(key, serialized);
      }
      return true;
    } catch (err: any) {
      logger.warn(`[Valkey] Failed to set key ${key}: ${err.message}`);
      return false;
    }
  },

  /**
   * Delete one or more keys
   */
  async del(...keys: string[]): Promise<number> {
    if (!getIsValkeyConnected() || keys.length === 0) return 0;
    try {
      return await valkeyClient.del(...keys);
    } catch {
      return 0;
    }
  },

  /**
   * Delete all keys matching a pattern using non-blocking SCAN
   */
  async delPattern(pattern: string): Promise<number> {
    if (!getIsValkeyConnected()) return 0;
    try {
      let cursor = '0';
      let deletedCount = 0;
      do {
        const [nextCursor, keys] = await valkeyClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          deletedCount += await valkeyClient.del(...keys);
        }
      } while (cursor !== '0');
      return deletedCount;
    } catch {
      return 0;
    }
  },

  /**
   * Check if a JWT access token is blacklisted / revoked
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    if (!getIsValkeyConnected()) return false;
    try {
      const exists = await valkeyClient.exists(`valkey:bl:${token.slice(-32)}`);
      return exists === 1;
    } catch {
      return false;
    }
  },

  /**
   * Blacklist a JWT access token upon user logout until expiry
   */
  async blacklistToken(token: string, ttlSeconds: number = 900): Promise<void> {
    if (!getIsValkeyConnected()) return;
    try {
      await valkeyClient.set(`valkey:bl:${token.slice(-32)}`, '1', 'EX', ttlSeconds);
    } catch (err: any) {
      logger.warn(`[Valkey] Failed to blacklist token: ${err.message}`);
    }
  },

  /**
   * Health check for Valkey connection (Never hangs even if disconnected)
   */
  async isHealthy(): Promise<boolean> {
    if (!getIsValkeyConnected()) {
      return false;
    }
    try {
      const res = await Promise.race([
        valkeyClient.ping(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
      ]);
      return res === 'PONG';
    } catch {
      return false;
    }
  },
};

export default valkeyClient;

