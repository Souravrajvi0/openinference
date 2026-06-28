import fs from 'node:fs';
import path from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import authPlugin from './plugins/auth';
import tenantContextPlugin from './plugins/tenantContext';
import { connectRedis, redisUrlLooksLikeReplica } from './services/redis';
import authRoute from './routes/auth';
import healthRoute from './routes/health';
import chatRoute from './routes/chat';
import retrieveRoute from './routes/retrieve';
import documentsRoute from './routes/documents';
import agentRoute from './routes/agent';
import tracesRoute from './routes/traces';
import metricsRoute from './routes/metrics';
import promMetricsRoute from './routes/promMetrics';
import adminRoute from './routes/admin';
import sessionsRoute from './routes/sessions';
import agentRegistryRoute from './routes/agentRegistry';
import approvalsRoute from './routes/approvals';
import regressionRoute from './routes/regression';
import budgetsRoute from './routes/budgets';
import mcpRoute from './routes/mcp';
import orgsRoute, { publicInvitesRoute } from './routes/orgs';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  });

  if (redisUrlLooksLikeReplica(config.REDIS_URL)) {
    app.log.warn(
      { redisUrl: config.REDIS_URL },
      'REDIS_URL looks like a read replica — use the primary Redis URL or redis://redis:6379 in Docker',
    );
  }

  const { redis, writable: redisWritable } = await connectRedis();

  if (!redisWritable) {
    app.log.error(
      { redisUrl: config.REDIS_URL },
      'Redis is read-only — rate limiting uses in-memory fallback; queues (chat eval, ingest) will fail until Redis is fixed',
    );
  } else {
    app.log.info({ redisUrl: config.REDIS_URL }, 'Redis connected (writable)');
  }

  await app.register(fastifyRateLimit, {
    global: true,
    max: config.DEFAULT_RATE_LIMIT_RPM,
    timeWindow: '1 minute',
    ...(redisWritable
      ? {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          redis: redis as any,
        }
      : {}),
    keyGenerator: (req) => {
      const r = req as typeof req & { tenantId?: string };
      return r.tenantId ?? req.ip;
    },
  });

  app.decorate('redisWritable', redisWritable);

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'OpenInference API', version: '1.0.0' },
      components: {
        securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } },
      },
      security: [{ ApiKey: [] }],
    },
  });

  // Swagger UI lives at /api-docs — the SPA owns the clean /docs route for its
  // user-facing documentation page (browser-history routing, no "#").
  await app.register(fastifySwaggerUi, { routePrefix: '/api-docs' });
  await app.register(fastifyJwt, { secret: config.JWT_SECRET });
  await app.register(authPlugin);

  // Public routes (no auth)
  await app.register(healthRoute);
  await app.register(promMetricsRoute);
  await app.register(authRoute, { prefix: '/v1/auth' });
  await app.register(publicInvitesRoute, { prefix: '/v1' });

  // Authenticated routes under /v1
  await app.register(
    async (api) => {
      api.addHook('preHandler', app.verifyApiKey);
      await api.register(tenantContextPlugin);
      await api.register(chatRoute);
      await api.register(retrieveRoute);
      await api.register(documentsRoute);
      await api.register(agentRoute);
      await api.register(tracesRoute);
      await api.register(metricsRoute);
      await api.register(adminRoute);
      await api.register(sessionsRoute);
      await api.register(agentRegistryRoute);
      await api.register(approvalsRoute);
      await api.register(regressionRoute);
      await api.register(budgetsRoute);
      await api.register(mcpRoute);
      await api.register(orgsRoute);
    },
    { prefix: '/v1' }
  );

  // Serve the built SPA (web/dist copied to ./web in the image) when present.
  // Browser-history routed: any unmatched HTML GET falls back to index.html below,
  // so deep links like /playground and /admin resolve to the SPA on hard refresh.
  const webDir = path.join(process.cwd(), 'web');
  if (fs.existsSync(path.join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not found' });
    });
  }

  return app;
}
