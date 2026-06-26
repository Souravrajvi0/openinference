import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config', () => ({
  config: { JWT_SECRET: 'test-secret-key-with-32-chars-min!!' },
}));

import { encryptSecret, decryptSecret } from '../secrets';

describe('secrets', () => {
  it('round-trips encrypt and decrypt', () => {
    const plain = 'sk-live-mcp-token-12345';
    const enc = encryptSecret(plain)!;
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('returns legacy plaintext unchanged', () => {
    expect(decryptSecret('raw-plaintext-key')).toBe('raw-plaintext-key');
  });

  it('handles null/empty', () => {
    expect(encryptSecret(null)).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });
});
