import { Pool, PoolClient, QueryResultRow } from 'pg';
import { config } from '../config';
import { tenantStore } from './tenantContext';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  min: config.DATABASE_POOL_MIN,
  max: config.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected postgres client error', err);
});

async function runInTransaction<T extends QueryResultRow>(
  configs: Record<string, string>,
  sql: string,
  params?: unknown[],
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(configs)) {
      await client.query(`SELECT set_config($1, $2, true)`, [key, value]);
    }
    const result = await client.query<T>(sql, params as unknown[]);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Trusted operations without tenant scope (auth lookup, migrations, maintenance). */
export async function queryAsSystem<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
) {
  return runInTransaction<T>({ 'app.bypass_rls': 'on' }, sql, params);
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
) {
  const tenantId = tenantStore.getStore();
  if (!tenantId) {
    return pool.query<T>(sql, params as unknown[]);
  }
  return runInTransaction<T>({ 'app.tenant_id': tenantId }, sql, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const tenantId = tenantStore.getStore();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
