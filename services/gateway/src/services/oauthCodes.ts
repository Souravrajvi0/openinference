import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { config } from '../config';

const PREFIX = 'oauth:code:';
const TTL_SEC = 60;

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) redis = new Redis(config.REDIS_URL);
  return redis;
}

/** Store a JWT behind a one-time code (60s TTL). Used after Google OAuth callback. */
export async function storeOAuthCode(jwt: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomBytes(24).toString('base64url');
    const ok = await getRedis().set(PREFIX + code, jwt, 'EX', TTL_SEC, 'NX');
    if (ok === 'OK') return code;
  }
  throw new Error('Failed to allocate OAuth exchange code');
}

/** Atomically redeem a one-time code for its JWT. Returns null if missing/expired. */
export async function exchangeOAuthCode(code: string): Promise<string | null> {
  const key = PREFIX + code;
  const jwt = await getRedis().get(key);
  if (!jwt) return null;
  await getRedis().del(key);
  return jwt;
}
