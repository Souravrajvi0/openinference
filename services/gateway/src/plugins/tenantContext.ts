import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { tenantStore } from '../db/tenantContext';

const tenantContextPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request) => {
    if (request.tenantId) {
      tenantStore.enterWith(request.tenantId);
    }
  });
};

export default fp(tenantContextPlugin, { name: 'tenant-context' });
