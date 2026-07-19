import { randomBytes } from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query, queryAsSystem } from '../db/client';
import { writeAudit } from '../services/audit';
import { config } from '../config';
import {
  countOwners,
  hashInviteToken,
  loadMemberships,
  requireOrgRole,
  resolveSession,
  verifyMembership,
  type OrgRole,
} from '../services/orgAuth';

const orgRoleSchema = z.enum(['owner', 'admin', 'member']);

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

export const publicInvitesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { token: string } }>('/invites/:token', async (request, reply) => {
    const tokenHash = hashInviteToken(request.params.token);
    const result = await queryAsSystem<{
      email: string;
      role: OrgRole;
      expires_at: string;
      accepted_at: string | null;
      org_name: string;
      org_slug: string;
    }>(
      `SELECT i.email, i.role, i.expires_at, i.accepted_at, t.name AS org_name, t.slug AS org_slug
       FROM invitations i
       JOIN tenants t ON t.id = i.tenant_id
       WHERE i.token_hash = $1`,
      [tokenHash],
    );
    const invite = result.rows[0];
    if (!invite) return reply.status(404).send({ error: 'Invite not found' });
    if (invite.accepted_at) return reply.status(410).send({ error: 'Invite already accepted' });
    if (new Date(invite.expires_at) < new Date()) {
      return reply.status(410).send({ error: 'Invite expired' });
    }
    return reply.send({
      email: invite.email,
      role: invite.role,
      org: { name: invite.org_name, slug: invite.org_slug },
    });
  });
};

const orgsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/orgs', async (request, reply) => {
    if (!request.userId) return reply.status(401).send({ error: 'JWT required' });
    const memberships = await loadMemberships(request.userId);
    return reply.send({
      data: memberships.map((m) => ({
        tenant_id: m.tenant_id,
        name: m.name,
        slug: m.slug,
        plan: m.plan,
        role: m.role,
      })),
    });
  });

  fastify.post('/orgs', async (request, reply) => {
    if (!request.userId) return reply.status(401).send({ error: 'JWT required' });

    const schema = z.object({ name: z.string().min(1).max(255) });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const slugBase = body.data.name.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'org';
    const slug = `${slugBase}-${randomBytes(4).toString('hex')}`;

    const tenant = await queryAsSystem<{ id: string }>(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, 'free') RETURNING id`,
      [body.data.name.trim(), slug],
    );
    const tenantId = tenant.rows[0]!.id;

    await queryAsSystem(
      `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')`,
      [request.userId, tenantId],
    );
    await queryAsSystem(`UPDATE users SET active_tenant_id = $1 WHERE id = $2`, [tenantId, request.userId]);

    const { ensureOrgProviderDefaults } = await import('../services/providers');
    await ensureOrgProviderDefaults(tenantId);

    writeAudit({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: request.userId,
      action: 'org.created',
      resource_type: 'tenant',
      resource_id: tenantId,
      details: { name: body.data.name.trim() },
    });

    const emailResult = await queryAsSystem<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [request.userId],
    );
    const email = emailResult.rows[0]?.email ?? '';
    const jwt = sign(fastify, request.userId, email, tenantId);

    return reply.status(201).send({
      tenant_id: tenantId,
      name: body.data.name.trim(),
      slug,
      token: jwt,
    });
  });

  fastify.post('/orgs/switch', async (request, reply) => {
    if (!request.userId) return reply.status(401).send({ error: 'JWT required' });

    const schema = z.object({ tenant_id: z.string().uuid() });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const role = await verifyMembership(request.userId, body.data.tenant_id);
    if (!role) return reply.status(403).send({ error: 'Not a member of this workspace' });

    await queryAsSystem(`UPDATE users SET active_tenant_id = $1 WHERE id = $2`, [
      body.data.tenant_id,
      request.userId,
    ]);

    const emailResult = await queryAsSystem<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [request.userId],
    );
    const email = emailResult.rows[0]?.email ?? '';
    const token = sign(fastify, request.userId, email, body.data.tenant_id);
    const session = await resolveSession(request.userId, email, body.data.tenant_id);

    writeAudit({
      tenant_id: body.data.tenant_id,
      actor_type: 'user',
      actor_id: request.userId,
      action: 'org.switched',
      resource_type: 'tenant',
      resource_id: body.data.tenant_id,
    });

    return reply.send({
      token,
      active_org: session?.memberships.find((m) => m.tenant_id === body.data.tenant_id) ?? null,
    });
  });

  fastify.get<{ Params: { id: string } }>('/orgs/:id/members', async (request, reply) => {
    requireOrgRole(request, 'admin');
    if (request.tenantId !== request.params.id) {
      return reply.status(403).send({ error: 'Can only list members of the active workspace' });
    }

    const result = await query<{ id: string; email: string; role: OrgRole; created_at: string }>(
      `SELECT u.id, u.email, m.role, m.created_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = $1
       ORDER BY m.created_at`,
      [request.tenantId],
    );
    return reply.send({ data: result.rows });
  });

  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/orgs/:id/members/:userId',
    async (request, reply) => {
      requireOrgRole(request, 'owner');
      if (request.tenantId !== request.params.id) {
        return reply.status(403).send({ error: 'Can only manage members of the active workspace' });
      }

      const schema = z.object({ role: orgRoleSchema });
      const body = schema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

      const current = await query<{ role: OrgRole }>(
        `SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
        [request.tenantId, request.params.userId],
      );
      const member = current.rows[0];
      if (!member) return reply.status(404).send({ error: 'Member not found' });

      if (member.role === 'owner' && body.data.role !== 'owner') {
        const owners = await countOwners(request.tenantId);
        if (owners <= 1) {
          return reply.status(400).send({ error: 'Cannot demote the last owner' });
        }
      }

      await query(
        `UPDATE memberships SET role = $1 WHERE tenant_id = $2 AND user_id = $3`,
        [body.data.role, request.tenantId, request.params.userId],
      );

      writeAudit({
        tenant_id: request.tenantId,
        actor_type: 'user',
        actor_id: request.userId,
        action: 'member.role_changed',
        resource_type: 'user',
        resource_id: request.params.userId,
        details: { role: body.data.role },
      });

      return reply.send({ user_id: request.params.userId, role: body.data.role });
    },
  );

  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/orgs/:id/members/:userId',
    async (request, reply) => {
      requireOrgRole(request, 'admin');
      if (request.tenantId !== request.params.id) {
        return reply.status(403).send({ error: 'Can only manage members of the active workspace' });
      }

      const current = await query<{ role: OrgRole }>(
        `SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
        [request.tenantId, request.params.userId],
      );
      const member = current.rows[0];
      if (!member) return reply.status(404).send({ error: 'Member not found' });

      if (member.role === 'owner') {
        const owners = await countOwners(request.tenantId);
        if (owners <= 1) {
          return reply.status(400).send({ error: 'Cannot remove the last owner' });
        }
      }

      if (request.params.userId === request.userId && member.role === 'owner') {
        const owners = await countOwners(request.tenantId);
        if (owners <= 1) {
          return reply.status(400).send({ error: 'Cannot leave as the sole owner' });
        }
      }

      await query(
        `DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
        [request.tenantId, request.params.userId],
      );

      writeAudit({
        tenant_id: request.tenantId,
        actor_type: 'user',
        actor_id: request.userId,
        action: 'member.removed',
        resource_type: 'user',
        resource_id: request.params.userId,
      });

      return reply.status(204).send();
    },
  );

  fastify.post<{ Params: { id: string } }>('/orgs/:id/invites', async (request, reply) => {
    requireOrgRole(request, 'admin');
    if (request.tenantId !== request.params.id) {
      return reply.status(403).send({ error: 'Can only invite to the active workspace' });
    }

    const schema = z.object({
      email: z.string().email(),
      role: orgRoleSchema.default('member'),
    });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    if (body.data.role === 'owner') {
      requireOrgRole(request, 'owner');
    }

    const email = body.data.email.toLowerCase().trim();
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await query<{ id: string }>(
      `INSERT INTO invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [request.tenantId, email, body.data.role, tokenHash, request.userId, expiresAt.toISOString()],
    );

    writeAudit({
      tenant_id: request.tenantId,
      actor_type: 'user',
      actor_id: request.userId,
      action: 'invite.created',
      resource_type: 'invitation',
      resource_id: result.rows[0]!.id,
      details: { email, role: body.data.role },
    });

    const acceptUrl = `${config.APP_URL}/invite?token=${rawToken}`;
    return reply.status(201).send({
      id: result.rows[0]!.id,
      email,
      role: body.data.role,
      expires_at: expiresAt.toISOString(),
      accept_url: acceptUrl,
      token: rawToken,
    });
  });

  fastify.get<{ Params: { id: string } }>('/orgs/:id/invites', async (request, reply) => {
    requireOrgRole(request, 'admin');
    if (request.tenantId !== request.params.id) {
      return reply.status(403).send({ error: 'Can only list invites for the active workspace' });
    }

    const result = await query<{
      id: string;
      email: string;
      role: OrgRole;
      expires_at: string;
      created_at: string;
    }>(
      `SELECT id, email, role, expires_at, created_at
       FROM invitations
       WHERE tenant_id = $1 AND accepted_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [request.tenantId],
    );
    return reply.send({ data: result.rows });
  });

  fastify.delete<{ Params: { id: string; inviteId: string } }>(
    '/orgs/:id/invites/:inviteId',
    async (request, reply) => {
      requireOrgRole(request, 'admin');
      if (request.tenantId !== request.params.id) {
        return reply.status(403).send({ error: 'Can only revoke invites for the active workspace' });
      }

      const result = await query(
        `DELETE FROM invitations
         WHERE id = $1 AND tenant_id = $2 AND accepted_at IS NULL
         RETURNING id`,
        [request.params.inviteId, request.tenantId],
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Invite not found' });
      }

      writeAudit({
        tenant_id: request.tenantId,
        actor_type: 'user',
        actor_id: request.userId,
        action: 'invite.revoked',
        resource_type: 'invitation',
        resource_id: request.params.inviteId,
      });

      return reply.status(204).send();
    },
  );

  fastify.post('/invites/accept', async (request, reply) => {
    if (!request.userId) return reply.status(401).send({ error: 'JWT required' });

    const schema = z.object({ token: z.string().min(1) });
    const body = schema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const tokenHash = hashInviteToken(body.data.token);
    const invite = await queryAsSystem<{
      id: string;
      tenant_id: string;
      email: string;
      role: OrgRole;
      expires_at: string;
      accepted_at: string | null;
    }>(
      `SELECT id, tenant_id, email, role, expires_at, accepted_at
       FROM invitations WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = invite.rows[0];
    if (!row) return reply.status(404).send({ error: 'Invite not found' });
    if (row.accepted_at) return reply.status(410).send({ error: 'Invite already accepted' });
    if (new Date(row.expires_at) < new Date()) {
      return reply.status(410).send({ error: 'Invite expired' });
    }

    const userEmail = await queryAsSystem<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [request.userId],
    );
    if (userEmail.rows[0]?.email.toLowerCase() !== row.email.toLowerCase()) {
      return reply.status(403).send({ error: 'Invite email does not match your account' });
    }

    await queryAsSystem(
      `UPDATE invitations SET accepted_at = NOW() WHERE id = $1`,
      [row.id],
    );
    await queryAsSystem(
      `INSERT INTO memberships (user_id, tenant_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role`,
      [request.userId, row.tenant_id, row.role],
    );
    await queryAsSystem(
      `UPDATE users SET active_tenant_id = $1 WHERE id = $2`,
      [row.tenant_id, request.userId],
    );

    const email = userEmail.rows[0]!.email;
    const token = sign(fastify, request.userId, email, row.tenant_id);

    writeAudit({
      tenant_id: row.tenant_id,
      actor_type: 'user',
      actor_id: request.userId,
      action: 'invite.accepted',
      resource_type: 'invitation',
      resource_id: row.id,
    });

    return reply.send({ token, tenant_id: row.tenant_id, role: row.role });
  });
};

export default orgsRoute;
