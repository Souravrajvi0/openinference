import { randomBytes } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/client';
import { writeAudit } from '../services/audit';

// Scopes granted to a web user over their own tenant.
const USER_SCOPES = ['chat', 'retrieve', 'agent', 'admin'];

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  tenant_id: string;
  role: string;
}

function makeSlug(email: string): string {
  const base = email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'user';
  return `${base}-${randomBytes(4).toString('hex')}`;
}

function sign(fastify: Parameters<FastifyPluginAsync>[0], user: UserRow) {
  return fastify.jwt.sign(
    { sub: user.id, tenantId: user.tenant_id, email: user.email, scopes: USER_SCOPES },
    { expiresIn: '7d' },
  );
}

const authRoute: FastifyPluginAsync = async (fastify) => {
  // POST /v1/auth/signup — create a user + their own tenant
  fastify.post('/signup', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8).max(200),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const email = body.data.email.toLowerCase().trim();

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'An account with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10);

    // Each signup gets its own tenant (free plan) and admin role over it.
    const tenant = await query<{ id: string }>(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, 'free') RETURNING id`,
      [email, makeSlug(email)],
    );
    const tenantId = tenant.rows[0]!.id;

    const user = await query<UserRow>(
      `INSERT INTO users (email, password_hash, tenant_id, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, email, password_hash, tenant_id, role`,
      [email, passwordHash, tenantId],
    );

    writeAudit({ tenant_id: tenantId, actor_type: 'system', actor_id: user.rows[0]!.id, action: 'user.signup', resource_type: 'user', resource_id: user.rows[0]!.id, details: { email } });

    const token = sign(fastify, user.rows[0]!);
    return reply.status(201).send({ token, user: { email, tenant_id: tenantId } });
  });

  // POST /v1/auth/login — email + password → JWT
  fastify.post('/login', async (request, reply) => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const email = body.data.email.toLowerCase().trim();
    const result = await query<UserRow>(
      `SELECT id, email, password_hash, tenant_id, role FROM users WHERE email = $1`,
      [email],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(body.data.password, user.password_hash))) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const token = sign(fastify, user);
    return reply.send({ token, user: { email: user.email, tenant_id: user.tenant_id } });
  });

  // GET /v1/auth/me — current user from the bearer token
  fastify.get('/me', async (request, reply) => {
    try {
      const payload = await request.jwtVerify<{ sub: string; email: string; tenantId: string }>();
      return reply.send({ user: { id: payload.sub, email: payload.email, tenant_id: payload.tenantId } });
    } catch {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
  });
};

export default authRoute;
