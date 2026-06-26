import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockIncr = vi.fn();
const mockExpire = vi.fn();
const mockDel = vi.fn();

vi.mock('../redis', () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    incr: mockIncr,
    expire: mockExpire,
    del: mockDel,
  }),
}));

import {
  assertCircuitClosed,
  recordProviderFailure,
  recordProviderSuccess,
  CircuitOpenError,
} from '../circuitBreaker';

describe('circuitBreaker', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockIncr.mockReset();
    mockExpire.mockReset();
    mockDel.mockReset();
  });

  it('throws when circuit is open', async () => {
    mockGet.mockResolvedValueOnce('1');
    await expect(assertCircuitClosed('groq')).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('opens circuit after repeated failures', async () => {
    mockIncr.mockResolvedValue(5);
    await recordProviderFailure('groq');
    expect(mockSet).toHaveBeenCalledWith('circuit:groq:open', '1', 'EX', 30);
  });

  it('clears failure counter on success', async () => {
    await recordProviderSuccess('groq');
    expect(mockDel).toHaveBeenCalledWith('circuit:groq:failures');
  });
});
