import { randomBytes } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/client';
import { writeAudit } from '../services/audit';
import { config } from '../config';

// Scopes every web user gets over their own tenant. Admins additionally get
// 'admin', which unlocks key management, budgets, traces, registry, etc.
const BASE_SCOPES = ['chat', 'retrieve', 'agent'];
const ADMIN_EMAILS = config.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

// Role assigned at account creation, based on the email allow-list.
function roleFor(email: string): 'admin' | 'user' {
  return isAdminEmail(email) ? 'admin' : 'user';
}

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
  // Scopes are derived from the email allow-list at token time, so they stay
  // correct even if a stored role row is stale.
  const scopes = isAdminEmail(user.email) ? [...BASE_SCOPES, 'admin'] : BASE_SCOPES;
  return fastify.jwt.sign(
    { sub: user.id, tenantId: user.tenant_id, email: user.email, scopes },
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
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, password_hash, tenant_id, role`,
      [email, passwordHash, tenantId, roleFor(email)],
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

  // GET /v1/auth/google — redirect to Google OAuth consent screen
  fastify.get('/google', async (request, reply) => {
    if (!config.GOOGLE_CLIENT_ID) {
      return reply.status(501).send({ error: 'Google OAuth not configured' });
    }
    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: `${config.APP_URL}/v1/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // GET /v1/auth/google/callback — exchange code, find/create user, redirect with JWT
  fastify.get('/google/callback', async (request, reply) => {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
      return reply.status(501).send({ error: 'Google OAuth not configured' });
    }

    const { code, error } = request.query as { code?: string; error?: string };
    if (error || !code) {
      return reply.redirect(`${config.APP_URL}/admin?error=google_denied`);
    }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.GOOGLE_CLIENT_ID,
          client_secret: config.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${config.APP_URL}/v1/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokens.access_token) throw new Error('No access token from Google');

      // Fetch user profile
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json() as { sub: string; email: string; name?: string };
      if (!profile.email) throw new Error('No email from Google');

      const email = profile.email.toLowerCase().trim();

      // Find existing user by google_id or email, or create new one
      let userRow: UserRow | undefined;

      const byGoogle = await query<UserRow>(
        `SELECT id, email, password_hash, tenant_id, role FROM users WHERE google_id = $1`,
        [profile.sub],
      );
      userRow = byGoogle.rows[0];

      if (!userRow) {
        const byEmail = await query<UserRow>(
          `SELECT id, email, password_hash, tenant_id, role FROM users WHERE email = $1`,
          [email],
        );
        userRow = byEmail.rows[0];
        // Link google_id to existing email account
        if (userRow) {
          await query(`UPDATE users SET google_id = $1 WHERE id = $2`, [profile.sub, userRow.id]);
        }
      }

      if (!userRow) {
        // Create new user + tenant
        const tenant = await query<{ id: string }>(
          `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, 'free') RETURNING id`,
          [email, makeSlug(email)],
        );
        const tenantId = tenant.rows[0]!.id;
        const created = await query<UserRow>(
          `INSERT INTO users (email, google_id, tenant_id, role)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, password_hash, tenant_id, role`,
          [email, profile.sub, tenantId, roleFor(email)],
        );
        userRow = created.rows[0]!;
        writeAudit({ tenant_id: tenantId, actor_type: 'system', actor_id: userRow.id, action: 'user.signup', resource_type: 'user', resource_id: userRow.id, details: { email, via: 'google' } });
      }

      const token = sign(fastify, userRow);
      return reply.redirect(`${config.APP_URL}/admin?token=${token}`);
    } catch (err) {
      fastify.log.error(err, 'Google OAuth callback error');
      return reply.redirect(`${config.APP_URL}/admin?error=google_failed`);
    }
  });
};

export default authRoute;
