import Redis from 'ioredis';
import { config } from '../config';

/** BullMQ requires maxRetriesPerRequest: null on ioredis. */
export function createRedisClient(url = config.REDIS_URL): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
}

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) client = createRedisClient();
  return client;
}

/** Throws if this Redis node rejects writes (e.g. read-only replica). */
export async function verifyRedisWritable(redis: Redis): Promise<void> {
  if (redis.status === 'wait') await redis.connect();
  const key = `oi:redis:probe:${Date.now()}`;
  await redis.set(key, '1', 'EX', 15);
  await redis.del(key);
}

export async function connectRedis(): Promise<{ redis: Redis; writable: boolean }> {
  const redis = getRedis();
  try {
    await verifyRedisWritable(redis);
    return { redis, writable: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/READONLY|read only replica/i.test(msg)) {
      return { redis, writable: false };
    }
    throw err;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => client?.disconnect());
    client = null;
  }
}

export function redisUrlLooksLikeReplica(url: string): boolean {
  return /replica|readonly|read-only|-ro\b/i.test(url);
}
