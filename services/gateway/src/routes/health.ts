import { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/client';
import { getRedis, verifyRedisWritable } from '../services/redis';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', { logLevel: 'warn' }, async (_req, reply) => {
    let dbOk = false;
    let redisOk = false;

    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch {}

    try {
      await verifyRedisWritable(getRedis());
      redisOk = true;
    } catch {}

    const ok = dbOk && redisOk;
    reply.status(dbOk ? 200 : 503).send({
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? 'ok' : 'error',
        redis: redisOk ? 'ok' : 'error',
      },
    });
  });
};

export default healthRoute;
