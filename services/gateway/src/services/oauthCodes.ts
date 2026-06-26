import { randomBytes } from 'crypto';
import { getRedis } from './redis';

const PREFIX = 'oauth:code:';
const TTL_SEC = 60;

export async function storeOAuthCode(jwt: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomBytes(24).toString('base64url');
    const ok = await getRedis().set(PREFIX + code, jwt, 'EX', TTL_SEC, 'NX');
    if (ok === 'OK') return code;
  }
  throw new Error('Failed to allocate OAuth exchange code');
}

export async function exchangeOAuthCode(code: string): Promise<string | null> {
  const key = PREFIX + code;
  const jwt = await getRedis().get(key);
  if (!jwt) return null;
  await getRedis().del(key);
  return jwt;
}
