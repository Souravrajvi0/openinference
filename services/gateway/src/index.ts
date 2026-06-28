import { buildApp } from './app';
import { config } from './config';
import { pool } from './db/client';
import { closeRedis } from './services/redis';
import { reencryptPlaintextMcpSecrets } from './services/mcpSecretsMaintenance';

async function main() {
  const app = await buildApp();

  reencryptPlaintextMcpSecrets()
    .then((n) => { if (n > 0) app.log.info({ count: n }, 'Encrypted legacy MCP secrets'); })
    .catch((err) => app.log.warn({ err }, 'MCP secret re-encryption skipped'));

  try {
    await app.listen({ port: config.GATEWAY_PORT, host: config.GATEWAY_HOST });
    app.log.info(`Gateway running on ${config.GATEWAY_HOST}:${config.GATEWAY_PORT}`);
    app.log.info(`API docs at http://localhost:${config.GATEWAY_PORT}/api-docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await closeRedis();
  await pool.end();
  process.exit(0);
});

main();
