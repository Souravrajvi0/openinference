import { createHash } from 'crypto';
import { FastifyRequest } from 'fastify';
import { queryAsSystem } from '../db/client';
import { config } from '../config';
import { isProPlan } from './plans';

export type OrgRole = 'owner' | 'admin' | 'member';

const ROLE_RANK: Record<OrgRole, number> = { member: 0, admin: 1, owner: 2 };

const ADMIN_EMAILS = config.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export function isPlatformAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export const SCOPES_BY_PLAN: Record<string, string[]> = {
  free: ['chat', 'retrieve', 'inference'],
  pro: ['chat', 'retrieve', 'agent', 'inference', 'pro'],
  enterprise: ['chat', 'retrieve', 'agent', 'inference', 'pro'],
};

export function scopesForPlan(plan: string, orgRole: OrgRole | null, email: string): string[] {
  const base = [...(SCOPES_BY_PLAN[plan] ?? SCOPES_BY_PLAN.free!)];
  if (orgRole === 'owner' || orgRole === 'admin' || isPlatformAdminEmail(email)) {
    if (!base.includes('admin')) base.push('admin');
  }
  if (isPlatformAdminEmail(email) && !base.includes('pro')) {
    base.push('pro');
  }
  return base;
}

export interface MembershipRow {
  tenant_id: string;
  role: OrgRole;
  name: string;
  slug: string;
  plan: string;
}

export interface ResolvedSession {
  userId: string;
  email: string;
  activeTenantId: string;
  orgRole: OrgRole;
  plan: string;
  scopes: string[];
  isPlatformAdmin: boolean;
  isPro: boolean;
  memberships: MembershipRow[];
}

export async function loadMemberships(userId: string): Promise<MembershipRow[]> {
  const result = await queryAsSystem<MembershipRow>(
    `SELECT m.tenant_id, m.role, t.name, t.slug, t.plan
     FROM memberships m
     JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = $1
     ORDER BY t.name`,
    [userId],
  );
  return result.rows;
}

export async function resolveActiveTenantId(userId: string, jwtTenantId?: string): Promise<string | null> {
  const user = await queryAsSystem<{ active_tenant_id: string | null; tenant_id: string }>(
    `SELECT active_tenant_id, tenant_id FROM users WHERE id = $1`,
    [userId],
  );
  const row = user.rows[0];
  if (!row) return null;

  const candidate = jwtTenantId ?? row.active_tenant_id ?? row.tenant_id;
  const membership = await queryAsSystem<{ role: OrgRole }>(
    `SELECT role FROM memberships WHERE user_id = $1 AND tenant_id = $2`,
    [userId, candidate],
  );
  if (membership.rows[0]) return candidate;

  const fallback = await queryAsSystem<{ tenant_id: string }>(
    `SELECT tenant_id FROM memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1`,
    [userId],
  );
  return fallback.rows[0]?.tenant_id ?? null;
}

export async function resolveSession(
  userId: string,
  email: string,
  jwtTenantId?: string,
): Promise<ResolvedSession | null> {
  const activeTenantId = await resolveActiveTenantId(userId, jwtTenantId);
  if (!activeTenantId) return null;

  const memberships = await loadMemberships(userId);
  const active = memberships.find((m) => m.tenant_id === activeTenantId);
  if (!active) return null;

  const isPlatformAdmin = isPlatformAdminEmail(email);
  const scopes = scopesForPlan(active.plan, active.role, email);

  return {
    userId,
    email,
    activeTenantId,
    orgRole: active.role,
    plan: active.plan,
    scopes,
    isPlatformAdmin,
    isPro: isProPlan(active.plan),
    memberships,
  };
}

export async function verifyMembership(userId: string, tenantId: string): Promise<OrgRole | null> {
  const result = await queryAsSystem<{ role: OrgRole }>(
    `SELECT role FROM memberships WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  return result.rows[0]?.role ?? null;
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hasOrgRole(role: OrgRole | null, minimum: OrgRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function requireOrgRole(request: FastifyRequest, minimum: OrgRole): void {
  if (request.apiKeyId) return;
  if (request.isPlatformAdmin) return;
  if (!hasOrgRole(request.orgRole, minimum)) {
    const err = new Error(`Org role '${minimum}' or higher required`) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
}

export async function countOwners(tenantId: string): Promise<number> {
  const result = await queryAsSystem<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM memberships WHERE tenant_id = $1 AND role = 'owner'`,
    [tenantId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
