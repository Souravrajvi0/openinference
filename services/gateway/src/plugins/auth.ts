import { createHash } from 'crypto';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { queryAsSystem } from '../db/client';
import { resolveSession, type OrgRole } from '../services/orgAuth';

interface ApiKeyRow {
  id: string;
  tenant_id: string;
  scopes: string[];
  rate_limit_rpm: number;
  rate_limit_tpm: number;
  plan: string;
  allowed_models: string[] | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    apiKeyId: string | null;
    userId: string | null;
    scopes: string[];
    rateLimitRpm: number;
    rateLimitTpm: number;
    plan: string;
    orgRole: OrgRole | null;
    isPlatformAdmin: boolean;
    allowedModels: string[] | null;
  }
  interface FastifyInstance {
    verifyApiKey: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('verifyApiKey', async (request: FastifyRequest, reply: FastifyReply) => {
    const authz = request.headers['authorization'];
    let bearerApiKey: string | undefined;
    if (authz && authz.startsWith('Bearer ')) {
      try {
        const payload = await request.jwtVerify<{
          sub: string;
          email: string;
          tenantId?: string;
          activeTenantId?: string;
        }>();
        const session = await resolveSession(
          payload.sub,
          payload.email,
          payload.activeTenantId ?? payload.tenantId,
        );
        if (!session) {
          reply.status(403).send({ error: 'Not a member of the active workspace' });
          return;
        }

        request.tenantId = session.activeTenantId;
        request.apiKeyId = null;
        request.userId = session.userId;
        request.scopes = session.scopes;
        request.rateLimitRpm = 60;
        request.rateLimitTpm = 100_000;
        request.plan = session.plan;
        request.orgRole = session.orgRole;
        request.isPlatformAdmin = session.isPlatformAdmin;
        request.allowedModels = null;
        return;
      } catch {
        // Not a session JWT — OpenAI SDKs send gateway API keys as
        // `Authorization: Bearer <key>`, so fall through to the key lookup.
        bearerApiKey = authz.slice('Bearer '.length).trim();
      }
    }

    const header = bearerApiKey ?? (request.headers['x-api-key'] as string | undefined);
    if (!header) {
      reply.status(401).send({ error: 'Missing X-Api-Key header or Bearer token' });
      return;
    }

    const keyHash = createHash('sha256').update(header).digest('hex');

    const result = await queryAsSystem<ApiKeyRow>(
      `SELECT k.id, k.tenant_id, k.scopes, k.rate_limit_rpm, k.rate_limit_tpm, k.allowed_models, t.plan
       FROM api_keys k
       JOIN tenants t ON t.id = k.tenant_id
       WHERE k.key_hash = $1
         AND k.is_active = TRUE
         AND (k.expires_at IS NULL OR k.expires_at > NOW())`,
      [keyHash],
    );

    if (result.rows.length === 0) {
      reply.status(401).send({ error: 'Invalid or expired API key' });
      return;
    }

    const key = result.rows[0]!;
    request.tenantId = key.tenant_id;
    request.apiKeyId = key.id;
    request.userId = null;
    request.scopes = key.scopes;
    request.rateLimitRpm = key.rate_limit_rpm;
    request.rateLimitTpm = key.rate_limit_tpm;
    request.plan = key.plan;
    request.orgRole = null;
    request.isPlatformAdmin = false;
    request.allowedModels = key.allowed_models ?? null;

    queryAsSystem('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.id]).catch(() => {});
  });
};

export default fp(authPlugin, { name: 'auth' });

export function requireScope(request: FastifyRequest, scope: string): void {
  if (!request.scopes.includes(scope) && !request.scopes.includes('admin')) {
    const err = new Error(`Scope '${scope}' required`) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
}
