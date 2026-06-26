import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDel = vi.fn();

vi.mock('../redis', () => ({
  getRedis: () => ({
    set: mockSet,
    get: mockGet,
    del: mockDel,
  }),
}));

vi.mock('../../config', () => ({
  config: { REDIS_URL: 'redis://localhost:6379' },
}));

import { storeOAuthCode, exchangeOAuthCode } from '../oauthCodes';

describe('oauthCodes', () => {
  beforeEach(() => {
    mockSet.mockReset();
    mockGet.mockReset();
    mockDel.mockReset();
  });

  it('stores a JWT and returns a one-time code', async () => {
    mockSet.mockResolvedValueOnce('OK');
    const code = await storeOAuthCode('jwt-token');
    expect(code.length).toBeGreaterThan(10);
    expect(mockSet).toHaveBeenCalledWith(
      expect.stringMatching(/^oauth:code:/),
      'jwt-token',
      'EX',
      60,
      'NX',
    );
  });

  it('exchanges a valid code for its JWT and deletes it', async () => {
    mockGet.mockResolvedValueOnce('jwt-token');
    mockDel.mockResolvedValueOnce(1);
    const jwt = await exchangeOAuthCode('abc123');
    expect(jwt).toBe('jwt-token');
    expect(mockDel).toHaveBeenCalledWith('oauth:code:abc123');
  });

  it('returns null for unknown or expired codes', async () => {
    mockGet.mockResolvedValueOnce(null);
    expect(await exchangeOAuthCode('missing')).toBeNull();
    expect(mockDel).not.toHaveBeenCalled();
  });
});
