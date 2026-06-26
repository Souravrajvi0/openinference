#!/usr/bin/env node
// Migration runner — run with: node migrate.js
// Reads all .sql files from ./migrations/, applies any not yet recorded in schema_migrations.

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  // Ensure tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id        SERIAL PRIMARY KEY,
      filename  VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  const applied = new Set(rows.map((r) => r.filename));

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations/ directory — nothing to do.');
    await pool.end();
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').trim();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
      if (sql) await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  apply ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  FAIL  ${file}: ${err.message}`);
      await pool.end();
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(count === 0 ? 'Already up to date.' : `\n${count} migration(s) applied.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
