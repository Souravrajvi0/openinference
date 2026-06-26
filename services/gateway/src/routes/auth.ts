import { randomBytes } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryAsSystem } from '../db/client';
import { writeAudit } from '../services/audit';
import { config } from '../config';
import { storeOAuthCode, exchangeOAuthCode } from '../services/oauthCodes';
import {
  hashInviteToken,
  isPlatformAdminEmail,
  resolveSession,
  type OrgRole,
} from '../services/orgAuth';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  tenant_id: string;
  role: string;
  active_tenant_id?: string | null;
}

function makeSlug(email: string): string {
  const base = email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'user';
  return `${base}-${randomBytes(4).toString('hex')}`;
}

async function findPendingInvite(email: string) {
  const result = await queryAsSystem<{
    id: string;
    tenant_id: string;
    role: OrgRole;
  }>(
    `SELECT id, tenant_id, role
     FROM invitations
     WHERE LOWER(email) = LOWER($1)
       AND accepted_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [email],
  );
  return result.rows[0] ?? null;
}

async function acceptInvite(inviteId: string, userId: string) {
  const invite = await queryAsSystem<{ tenant_id: string; role: OrgRole }>(
    `UPDATE invitations SET accepted_at = NOW()
     WHERE id = $1 AND accepted_at IS NULL
     RETURNING tenant_id, role`,
    [inviteId],
  );
  const row = invite.rows[0];
  if (!row) return null;

  await queryAsSystem(
    `INSERT INTO memberships (user_id, tenant_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role`,
    [userId, row.tenant_id, row.role],
  );
  await queryAsSystem(
    `UPDATE users SET active_tenant_id = $1, tenant_id = $1 WHERE id = $2`,
    [row.tenant_id, userId],
  );
  return row.tenant_id;
}

async function createUserWithOrg(
  email: string,
  passwordHash: string | null,
  googleId: string | null,
  tenantName: string,
): Promise<UserRow> {
  const tenant = await queryAsSystem<{ id: string }>(
    `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, 'free') RETURNING id`,
    [tenantName, makeSlug(email)],
  );
  const tenantId = tenant.rows[0]!.id;

  const user = await queryAsSystem<UserRow>(
    googleId
      ? `INSERT INTO users (email, google_id, tenant_id, active_tenant_id, role)
         VALUES ($1, $2, $3, $3, 'free')
         RETURNING id, email, password_hash, tenant_id, role, active_tenant_id`
      : `INSERT INTO users (email, password_hash, tenant_id, active_tenant_id, role)
         VALUES ($1, $2, $3, $3, 'free')
         RETURNING id, email, password_hash, tenant_id, role, active_tenant_id`,
    googleId
      ? [email, googleId, tenantId]
      : [email, passwordHash, tenantId],
  );
  const userRow = user.rows[0]!;

  await queryAsSystem(
    `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')`,
    [userRow.id, tenantId],
  );

  return userRow;
}

function sign(
  fastify: Parameters<FastifyPluginAsync>[0],
  userId: string,
  email: string,
  activeTenantId: string,
) {
  return fastify.jwt.sign(
    { sub: userId, email, activeTenantId, tenantId: activeTenantId },
    { expiresIn: '7d' },
  );
}

function mePayload(session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>) {
  const active = session.memberships.find((m) => m.tenant_id === session.activeTenantId);
  return {
    user: {
      id: session.userId,
      email: session.email,
      tenant_id: session.activeTenantId,
      active_tenant_id: session.activeTenantId,
      org_role: session.orgRole,
      is_platform_admin: session.isPlatformAdmin,
      is_pro: session.isPro,
    },
    memberships: session.memberships.map((m) => ({
      tenant_id: m.tenant_id,
      name: m.name,
      slug: m.slug,
      plan: m.plan,
      role: m.role,
    })),
    active_org: active
      ? { id: active.tenant_id, name: active.name, slug: active.slug, plan: active.plan, role: active.role }
      : null,
    is_pro: session.isPro,
    is_platform_admin: session.isPlatformAdmin,
  };
}

const authRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/signup', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8).max(200),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const email = body.data.email.toLowerCase().trim();

    const existing = await queryAsSystem('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'An account with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10);
    const invite = await findPendingInvite(email);
    let userRow: UserRow;
    let tenantId: string;

    if (invite) {
      const created = await queryAsSystem<UserRow>(
        `INSERT INTO users (email, password_hash, tenant_id, active_tenant_id, role)
         VALUES ($1, $2, $3, $3, 'free')
         RETURNING id, email, password_hash, tenant_id, role, active_tenant_id`,
        [email, passwordHash, invite.tenant_id],
      );
      userRow = created.rows[0]!;
      const joined = await acceptInvite(invite.id, userRow.id);
      tenantId = joined ?? invite.tenant_id;
      writeAudit({
        tenant_id: tenantId,
        actor_type: 'user',
        actor_id: userRow.id,
        action: 'invite.accepted',
        resource_type: 'invitation',
        resource_id: invite.id,
        details: { email, via: 'signup' },
      });
    } else {
      userRow = await createUserWithOrg(email, passwordHash, null, email);
      tenantId = userRow.tenant_id;
      writeAudit({
        tenant_id: tenantId,
        actor_type: 'system',
        actor_id: userRow.id,
        action: 'user.signup',
        resource_type: 'user',
        resource_id: userRow.id,
        details: { email },
      });
    }

    const token = sign(fastify, userRow.id, email, tenantId);
    return reply.status(201).send({ token, user: { email, tenant_id: tenantId } });
  });

  fastify.post('/login', async (request, reply) => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const email = body.data.email.toLowerCase().trim();
    const result = await query<UserRow>(
      `SELECT id, email, password_hash, tenant_id, role, active_tenant_id FROM users WHERE email = $1`,
      [email],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(body.data.password, user.password_hash))) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const session = await resolveSession(user.id, user.email);
    if (!session) return reply.status(403).send({ error: 'No workspace membership found' });

    const token = sign(fastify, user.id, user.email, session.activeTenantId);
    return reply.send({ token, user: { email: user.email, tenant_id: session.activeTenantId } });
  });

  fastify.get('/me', async (request, reply) => {
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
      if (!session) return reply.status(403).send({ error: 'Not a member of the active workspace' });
      return reply.send(mePayload(session));
    } catch {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
  });

  fastify.post('/oauth/exchange', async (request, reply) => {
    const schema = z.object({ code: z.string().min(1) });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const jwt = await exchangeOAuthCode(body.data.code);
    if (!jwt) {
      return reply.status(401).send({ error: 'Invalid or expired OAuth code' });
    }

    try {
      const payload = fastify.jwt.verify<{
        sub: string;
        email: string;
        tenantId?: string;
        activeTenantId?: string;
      }>(jwt);
      const session = await resolveSession(
        payload.sub,
        payload.email,
        payload.activeTenantId ?? payload.tenantId,
      );
      if (!session) return reply.status(403).send({ error: 'Not a member of the active workspace' });
      return reply.send({ token: jwt, ...mePayload(session) });
    } catch {
      return reply.status(401).send({ error: 'Invalid OAuth session' });
    }
  });

  fastify.get('/google', async (_request, reply) => {
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

  fastify.get('/google/callback', async (request, reply) => {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
      return reply.status(501).send({ error: 'Google OAuth not configured' });
    }

    const { code, error } = request.query as { code?: string; error?: string };
    if (error || !code) {
      return reply.redirect(`${config.APP_URL}/admin?error=google_denied`);
    }

    try {
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

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json() as { sub: string; email: string; name?: string };
      if (!profile.email) throw new Error('No email from Google');

      const email = profile.email.toLowerCase().trim();
      let userRow: UserRow | undefined;

      const byGoogle = await query<UserRow>(
        `SELECT id, email, password_hash, tenant_id, role, active_tenant_id FROM users WHERE google_id = $1`,
        [profile.sub],
      );
      userRow = byGoogle.rows[0];

      if (!userRow) {
        const byEmail = await query<UserRow>(
          `SELECT id, email, password_hash, tenant_id, role, active_tenant_id FROM users WHERE email = $1`,
          [email],
        );
        userRow = byEmail.rows[0];
        if (userRow) {
          await query(`UPDATE users SET google_id = $1 WHERE id = $2`, [profile.sub, userRow.id]);
        }
      }

      if (!userRow) {
        const invite = await findPendingInvite(email);
        if (invite) {
          const created = await queryAsSystem<UserRow>(
            `INSERT INTO users (email, google_id, tenant_id, active_tenant_id, role)
             VALUES ($1, $2, $3, $3, 'free')
             RETURNING id, email, password_hash, tenant_id, role, active_tenant_id`,
            [email, profile.sub, invite.tenant_id],
          );
          userRow = created.rows[0]!;
          await acceptInvite(invite.id, userRow.id);
          writeAudit({
            tenant_id: invite.tenant_id,
            actor_type: 'user',
            actor_id: userRow.id,
            action: 'invite.accepted',
            resource_type: 'invitation',
            resource_id: invite.id,
            details: { email, via: 'google' },
          });
        } else {
          userRow = await createUserWithOrg(email, null, profile.sub, email);
          writeAudit({
            tenant_id: userRow.tenant_id,
            actor_type: 'system',
            actor_id: userRow.id,
            action: 'user.signup',
            resource_type: 'user',
            resource_id: userRow.id,
            details: { email, via: 'google' },
          });
        }
      }

      const session = await resolveSession(userRow.id, userRow.email);
      const activeTenantId = session?.activeTenantId ?? userRow.tenant_id;
      const token = sign(fastify, userRow.id, userRow.email, activeTenantId);
      const dest = isPlatformAdminEmail(userRow.email) ? '/admin' : '/playground';
      const oauthCode = await storeOAuthCode(token);
      return reply.redirect(`${config.APP_URL}${dest}?code=${oauthCode}`);
    } catch (err) {
      fastify.log.error(err, 'Google OAuth callback error');
      return reply.redirect(`${config.APP_URL}/admin?error=google_failed`);
    }
  });
};

export default authRoute;
