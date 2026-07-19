import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest } from 'fastify';

// orgAuth talks to Postgres via queryAsSystem; mock it so we can drive the
// membership-resolution logic that gates cross-org access (the check that runs
// BEFORE app.tenant_id / RLS is ever applied).
// vi.mock is hoisted above top-level consts, so the shared fn must come from
// vi.hoisted() to be initialized before the mock factory runs.
const { queryAsSystem } = vi.hoisted(() => ({ queryAsSystem: vi.fn() }));
vi.mock('../../db/client', () => ({
  queryAsSystem,
  query: vi.fn(),
}));

import { resolveSession, verifyMembership, requireOrgRole } from '../orgAuth';

const USER = 'user-a';
const ORG_A = 'org-a';
const ORG_B = 'org-b';

/**
 * Route mocked DB calls by SQL shape.
 * - `members`: { tenantId -> role } the user actually belongs to.
 * - `tenants`: row data returned by loadMemberships' JOIN.
 */
function setupDb(members: Record<string, string>) {
  const memberTenantIds = Object.keys(members);
  queryAsSystem.mockImplementation((sql: string, params: unknown[]) => {
    if (sql.includes('FROM users WHERE id')) {
      return Promise.resolve({ rows: [{ active_tenant_id: ORG_A, tenant_id: ORG_A }] });
    }
    // verifyMembership + the candidate-tenant check inside resolveActiveTenantId
    if (sql.includes('SELECT role FROM memberships') && sql.includes('AND tenant_id')) {
      const role = members[params[1] as string];
      return Promise.resolve({ rows: role ? [{ role }] : [] });
    }
    // fallback: first membership ordered by created_at
    if (sql.includes('SELECT tenant_id FROM memberships') && sql.includes('ORDER BY created_at')) {
      return Promise.resolve({ rows: memberTenantIds[0] ? [{ tenant_id: memberTenantIds[0] }] : [] });
    }
    // loadMemberships
    if (sql.includes('JOIN tenants t ON t.id = m.tenant_id')) {
      return Promise.resolve({
        rows: memberTenantIds.map((id) => ({
          tenant_id: id,
          role: members[id],
          name: `Org ${id}`,
          slug: id,
          plan: 'free',
        })),
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

function fakeRequest(over: Partial<FastifyRequest>): FastifyRequest {
  return {
    apiKeyId: null,
    isPlatformAdmin: false,
    orgRole: null,
    ...over,
  } as unknown as FastifyRequest;
}

describe('cross-org isolation', () => {
  // Braces matter: an implicit return hands the mock back to vitest, which
  // calls it as a no-arg teardown hook and crashes the SQL-routing mock.
  beforeEach(() => { queryAsSystem.mockReset(); });

  it('does NOT grant a forged active org the user is not a member of', async () => {
    setupDb({ [ORG_A]: 'owner' }); // user belongs only to A

    // JWT claims ORG_B as the active tenant — user is not a member.
    const session = await resolveSession(USER, 'a@example.com', ORG_B);

    expect(session).not.toBeNull();
    // Must fall back to a real membership, never the forged org.
    expect(session!.activeTenantId).toBe(ORG_A);
    expect(session!.activeTenantId).not.toBe(ORG_B);
    expect(session!.memberships.map((m) => m.tenant_id)).not.toContain(ORG_B);
  });

  it('verifyMembership rejects a non-member (so /orgs/switch 403s)', async () => {
    setupDb({ [ORG_A]: 'owner' });
    expect(await verifyMembership(USER, ORG_B)).toBeNull();
    expect(await verifyMembership(USER, ORG_A)).toBe('owner');
  });

  it('returns null when the user has no memberships at all', async () => {
    queryAsSystem.mockImplementation((sql: string) => {
      if (sql.includes('FROM users WHERE id')) {
        return Promise.resolve({ rows: [{ active_tenant_id: null, tenant_id: ORG_A }] });
      }
      return Promise.resolve({ rows: [] }); // no membership rows anywhere
    });
    expect(await resolveSession(USER, 'a@example.com')).toBeNull();
  });
});

describe('requireOrgRole', () => {
  const expect403 = (req: FastifyRequest, role: 'owner' | 'admin' | 'member') => {
    try {
      requireOrgRole(req, role);
      return false;
    } catch (e) {
      return (e as { statusCode?: number }).statusCode === 403;
    }
  };

  it('blocks a plain member from admin-only actions', () => {
    expect(expect403(fakeRequest({ orgRole: 'member' }), 'admin')).toBe(true);
  });

  it('blocks a non-member (no org role) entirely', () => {
    expect(expect403(fakeRequest({ orgRole: null }), 'member')).toBe(true);
  });

  it('allows admins and owners', () => {
    expect(() => requireOrgRole(fakeRequest({ orgRole: 'admin' }), 'admin')).not.toThrow();
    expect(() => requireOrgRole(fakeRequest({ orgRole: 'owner' }), 'admin')).not.toThrow();
  });

  it('lets platform admins and API keys through', () => {
    expect(() => requireOrgRole(fakeRequest({ isPlatformAdmin: true }), 'owner')).not.toThrow();
    expect(() => requireOrgRole(fakeRequest({ apiKeyId: 'key-1' }), 'owner')).not.toThrow();
  });
});
