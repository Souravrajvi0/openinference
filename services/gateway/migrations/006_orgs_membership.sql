-- Org workspaces: many-to-many membership, invitations, active org per user.

CREATE TABLE IF NOT EXISTS memberships (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);

CREATE TABLE IF NOT EXISTS invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  invited_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email_pending
  ON invitations(email) WHERE accepted_at IS NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_tenant_id UUID REFERENCES tenants(id);

-- Backfill: every existing user becomes owner of their current tenant.
INSERT INTO memberships (user_id, tenant_id, role, created_at)
SELECT u.id, u.tenant_id, 'owner', u.created_at
FROM users u
ON CONFLICT (user_id, tenant_id) DO NOTHING;

UPDATE users SET active_tenant_id = tenant_id WHERE active_tenant_id IS NULL;
