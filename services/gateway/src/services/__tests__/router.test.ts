import { describe, it, expect, vi } from 'vitest';

// Mock DB and config
vi.mock('../../db/client', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));
vi.mock('../../config', () => ({
  config: {
    DEFAULT_PROVIDER: 'groq',
    DEFAULT_MODEL: 'llama-3.3-70b-versatile',
    FALLBACK_PROVIDER: undefined,
    FALLBACK_MODEL: undefined,
  },
}));

import { routeRequest, getFallbackRoute } from '../router';

describe('routeRequest', () => {
  it('honours explicit provider + model', () => {
    const r = routeRequest({ requested_provider: 'openai', requested_model: 'gpt-4o', estimated_tokens: 100 });
    expect(r.provider).toBe('openai');
    expect(r.model).toBe('gpt-4o');
    expect(r.is_fallback).toBe(false);
  });

  it('routes long context to the 70B model', () => {
    const r = routeRequest({ estimated_tokens: 9000 });
    expect(r.model).toBe('llama-3.3-70b-versatile');
  });

  it('routes low-priority to the fast small model', () => {
    const r = routeRequest({ estimated_tokens: 500, priority: 'low' });
    expect(r.model).toBe('llama-3.1-8b-instant');
  });

  it('falls back to default model for normal requests', () => {
    const r = routeRequest({ estimated_tokens: 500 });
    expect(r.provider).toBe('groq');
    expect(r.model).toBe('llama-3.3-70b-versatile');
  });
});

describe('getFallbackRoute', () => {
  it('returns null when no fallback configured', () => {
    expect(getFallbackRoute()).toBeNull();
  });
});
