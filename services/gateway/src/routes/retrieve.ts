import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../plugins/auth';
import { searchDocuments } from '../services/retrieval';
import { config } from '../config';

const bodySchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(20).default(5),
  score_threshold: z.number().min(0).max(1).default(0.7),
  hybrid: z.boolean().optional().default(true),
});

const retrieveRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/retrieve', async (request, reply) => {
    requireScope(request, 'retrieve');

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { query: queryText, top_k, score_threshold, hybrid } = body.data;
    const start = Date.now();

    if (!config.MISTRAL_API_KEY) {
      return reply.status(503).send({ error: 'MISTRAL_API_KEY not configured — embedding unavailable' });
    }

    const hits = await searchDocuments(request.tenantId, queryText, { top_k, score_threshold, hybrid });
    const matchType = hybrid ? 'hybrid' : 'vector';

    return reply.send({
      query: queryText,
      results: hits.map(({ citation }) => ({
        ...citation,
        match_type: matchType,
      })),
      latency_ms: Date.now() - start,
    });
  });
};

export default retrieveRoute;
