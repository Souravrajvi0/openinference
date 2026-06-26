import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from '../config';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function deriveKey(): Buffer {
  return createHash('sha256').update(`mcp-secrets:${config.JWT_SECRET}`).digest();
}

/** Encrypt a sensitive value for at-rest storage (e.g. MCP auth tokens). */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

/** Decrypt a stored secret; returns legacy plaintext values unchanged. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;

  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return stored;

  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, deriveKey(), Buffer.from(ivB64!, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
