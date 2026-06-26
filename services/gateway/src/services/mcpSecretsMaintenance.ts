import { queryAsSystem } from '../db/client';
import { encryptSecret } from './secrets';

const ENC_PREFIX = 'enc:v1:';

/** One-time idempotent migration: encrypt any legacy plaintext MCP auth_value rows. */
export async function reencryptPlaintextMcpSecrets(): Promise<number> {
  const result = await queryAsSystem<{ id: string; auth_value: string }>(
    `SELECT id, auth_value FROM mcp_servers
     WHERE auth_value IS NOT NULL
       AND auth_value <> ''
       AND auth_value NOT LIKE $1`,
    [`${ENC_PREFIX}%`]
  );

  let updated = 0;
  for (const row of result.rows) {
    const encrypted = encryptSecret(row.auth_value);
    if (!encrypted || encrypted === row.auth_value) continue;
    await queryAsSystem(`UPDATE mcp_servers SET auth_value = $2, updated_at = NOW() WHERE id = $1`, [
      row.id,
      encrypted,
    ]);
    updated++;
  }
  return updated;
}
