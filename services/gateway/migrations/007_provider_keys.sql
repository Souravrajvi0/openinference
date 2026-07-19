-- Provider API keys managed from the dashboard (platform admins only).
-- Values are encrypted at the application layer (AES-256-GCM via secrets.ts).
-- Global (gateway-wide) like the env vars they override — no tenant_id, no RLS.

CREATE TABLE IF NOT EXISTS provider_keys (
  provider TEXT PRIMARY KEY,
  key_encrypted TEXT NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
