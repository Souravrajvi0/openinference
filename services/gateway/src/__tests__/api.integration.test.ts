import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    quit: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  })),
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
});
