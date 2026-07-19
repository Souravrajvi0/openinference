-- Allow orgs to opt into using the platform/gateway default key for a provider
-- instead of pasting their own (checkbox in Admin → Org Providers).

ALTER TABLE tenant_providers
  ADD COLUMN IF NOT EXISTS use_platform_key BOOLEAN NOT NULL DEFAULT FALSE;
