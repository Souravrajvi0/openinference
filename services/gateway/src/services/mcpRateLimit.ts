import { getRedis } from './redis';

/** Per-server per-minute rate limit backed by Redis (safe across gateway replicas). */
export async function checkMcpRateLimit(serverId: string, limit: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `mcp:rl:${serverId}:${bucket}`;
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 120);
  return count <= limit;
}
