import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../services/redis', () => ({
  connectRedis: vi.fn().mockResolvedValue({
    redis: {
      defineCommand: vi.fn(),
      rateLimit: vi.fn().mockResolvedValue([0, 60]),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK'),
    },
    writable: false,
  }),
  getRedis: vi.fn().mockReturnValue({
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    connect: vi.fn().mockResolvedValue(undefined),
    status: 'ready',
  }),
  verifyRedisWritable: vi.fn().mockResolvedValue(undefined),
  redisUrlLooksLikeReplica: vi.fn().mockReturnValue(false),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/client')>();
  return {
    ...actual,
    queryAsSystem: vi.fn().mockResolvedValue({ rows: [] }),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    pool: { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }), end: vi.fn() },
  };
});

import { buildApp } from '../app';
import { pool } from '../db/client';

describe('API auth integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('rejects /v1/chat without credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('exposes public health endpoint', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('rejects /v1/chat/completions without credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'hello' }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('treats an unknown Bearer token as an API key, not a broken session', async () => {
    // OpenAI SDKs send `Authorization: Bearer <gateway key>` — a bad key must
    // land in the API-key 401, not the JWT "invalid session" path.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { authorization: 'Bearer not-a-real-key' },
      payload: { model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'hello' }] },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/api key/i);
  });

  it('rejects /v1/models without credentials', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/models' });
    expect(res.statusCode).toBe(401);
  });
});
