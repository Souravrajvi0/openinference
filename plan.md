# Plan: Team / Org Workspaces (Multi-Seat)

> Status: proposed — awaiting approval. Target: turn SentinelAI into a multi-seat SaaS
> where multiple users share one workspace (org), with per-org roles and org-level billing.

## The Core Idea

`tenants` stays as the org/workspace boundary (it already has `name`, `slug`, `plan`,
`settings`, and everything is RLS-scoped by `tenant_id`). We add **many-to-many
membership** so multiple users can share one workspace, and we **separate three
concepts that are currently tangled together**:

| Concept | Should live on | Gates | Today |
|---|---|---|---|
| **Plan / tier** (free / pro / enterprise) | `tenants.plan` | features (`isPro`) | ❌ wrongly derived from JWT scopes |
| **Org role** (owner / admin / member) | `memberships.role` | management (keys, billing, invites, members) | ❌ does not exist |
| **Platform admin** (instance owner) | `ADMIN_EMAILS` allow-list | the whole instance | ✅ already exists |

### Current state (verified in code)
- `users` has a hard 1:1 `tenant_id` FK; the schema comment literally says *"Each user owns one tenant"* (`infra/postgres/init.sql:35`).
- Both signup paths create a **brand-new tenant per user** (`services/gateway/src/routes/auth.ts:87` email, `:260` Google). Two people at the same company get two isolated workspaces.
- `is_pro` / `is_admin` are derived from **JWT scopes** in `/v1/auth/me` (`auth.ts:~138`), not from the org plan — this is the main thing to untangle.
- RLS scopes all data by `app.tenant_id` (migration `005_row_level_security.sql`).

## Recommended Defaults (veto any before build)

1. **Users can belong to multiple orgs** with an org switcher (proper SaaS; the
   membership table supports it even if most users start with one org).
2. **Plan becomes org-level** — upgrading to Pro upgrades the *workspace*, billed to
   the org. This re-points the "Upgrade to Pro" button already shipped on the Account page.
3. **Org roles: owner / admin / member.** Owner = billing + delete org + manage
   everyone; admin = manage keys/docs/members/invites; member = use
   playground/inference, read traces, no management.
4. **Invites via copy-link** for now (no email infra yet) — owner/admin copies an
   invite link and sends it manually. Email delivery is a later add-on.

## Build Order

### Phase A — Data + Auth Core
- **Migration `006_orgs_membership.sql`:**
  - `memberships(user_id, tenant_id, role, created_at, PRIMARY KEY(user_id, tenant_id))`, role ∈ `owner|admin|member`.
  - `invitations(id, tenant_id, email, role, token_hash, invited_by, expires_at, accepted_at, created_at)`.
  - `users.active_tenant_id UUID` (nullable FK → tenants).
  - **Backfill:** one `owner` membership per existing user; `active_tenant_id = tenant_id`. No orphans.
  - Keep `users.tenant_id` for now as backfill source / fallback; stop treating it as the single source of truth.
- **Auth resolves membership role + org plan per request** (replaces scope-based
  `isPro`/`isAdmin`). Resolving per-request avoids stale-JWT problems on role/plan change.
- **Security-critical:** verify the user is actually a member of the active org
  **before** setting `app.tenant_id` for RLS, so a forged/stale active-org id can't
  reach another workspace. RLS is the backstop; the `app.tenant_id` value itself must be authorized.
- `GET /v1/auth/me` returns: `user`, `memberships[]` (org id, name, slug, plan, my role),
  active org, derived `is_pro` (from active org plan), `is_platform_admin` (ADMIN_EMAILS).
- `POST /v1/orgs/switch { tenant_id }` — verify membership, re-issue JWT with new `activeTenantId`.

### Phase B — Members & Invites Backend (`services/gateway/src/routes/orgs.ts`)
- `GET /v1/orgs` — my memberships.
- `POST /v1/orgs` — create a new org (caller becomes owner), switch to it.
- `GET /v1/orgs/:id/members` — list (owner/admin).
- `PATCH /v1/orgs/:id/members/:userId` — change role (owner).
- `DELETE /v1/orgs/:id/members/:userId` — remove (owner/admin), with **last-owner protection**.
- `POST /v1/orgs/:id/invites` — create invite (owner/admin) → returns accept link/token.
- `GET /v1/orgs/:id/invites` — pending invites.
- `DELETE /v1/orgs/:id/invites/:inviteId` — revoke.
- `POST /v1/invites/accept { token }` — accept (authenticated): create membership, mark accepted.
- `GET /v1/invites/:token` — public preview (org name, invited email) for the accept screen.
- **Signup honors a pending invite** for that email (auto-join the inviting org).
- `requireOrgRole(request, role)` helper (owner ⊇ admin ⊇ member) gating management
  routes (keys, budgets, experiments, document writes, members, invites). Platform admin bypasses.

### Phase C — Frontend
- **Org switcher** dropdown in `Nav` (active org name; lists memberships; "Create org").
- **Members page** (list members + roles; invite by email + role; change/remove) — owner/admin only.
- **Invite-accept page** (`/invite?token=…`): shows org, accept button (login/signup if needed).
- **Account page**: show active org name, your org role, and plan; "Create / switch org".
- **`useAuth`**: add `memberships`, `activeOrg`, `orgRole`, `canManage` (owner/admin);
  derive `isPro` from the active org's plan instead of JWT scopes.

### Phase D — Polish
- Audit-log membership and invite events (`audit_logs`).
- Last-owner guards (can't remove/demote the final owner; can't leave as sole owner).
- Tests: cross-org isolation (RLS proves user A can't read org B), role gating on management routes, backfill correctness.

## Risks

- **Cross-org data leakage** — the membership-before-RLS check is the linchpin; add an
  integration test proving user A cannot read org B's data.
- **Stale JWTs** on role/plan change — mitigated by resolving role/plan per request
  rather than trusting the token.
- **Backfill correctness** — every existing user must end up `owner` of their current
  tenant with no orphaned users or tenants.

## Scope Estimate
~2 migrations + ~4 backend files (auth/tenantContext changes, `routes/orgs.ts`,
signup changes, role helper) + ~4 frontend files (Nav switcher, Members page, invite
page, `useAuth`/Account). Each phase (A→D) is independently deployable.

## Files Touched (anticipated)
- `services/gateway/migrations/006_orgs_membership.sql` (new)
- `services/gateway/src/plugins/auth.ts`, `plugins/tenantContext.ts`
- `services/gateway/src/routes/auth.ts` (me, signup, oauth)
- `services/gateway/src/routes/orgs.ts` (new)
- `services/gateway/src/services/plans.ts` (org-plan-driven tier)
- `web/src/lib/auth.ts`, `web/src/components/Nav.tsx`, `web/src/routes/admin.tsx`,
  `web/src/routes/members.tsx` (new), `web/src/routes/invite.tsx` (new), `web/src/router.tsx`

## Open Decisions (confirm with defaults above, or change)
1. Multi-org per user (switcher) vs single-org for v1 — **default: multi-org**.
2. Plan moves to org-level billing — **default: yes**.
3. Org roles owner/admin/member vs just owner/member — **default: owner/admin/member**.
4. Invite delivery copy-link vs email — **default: copy-link now, email later**.
