-- Platform provider registry, per-org enablement + org-owned keys, platform monthly budget.

CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('openai_compat', 'anthropic', 'ollama')),
  base_url TEXT,
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_providers (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, provider_id)
);

CREATE TABLE IF NOT EXISTS tenant_provider_keys (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  key_encrypted TEXT NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, provider_id)
);

CREATE TABLE IF NOT EXISTS platform_budgets (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  monthly_budget_usd NUMERIC(12, 4) NOT NULL,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO providers (slug, name, kind, base_url, is_builtin, is_active) VALUES
  ('openai',    'OpenAI',    'openai_compat', 'https://api.openai.com/v1',                                    TRUE, TRUE),
  ('anthropic', 'Anthropic', 'anthropic',     NULL,                                                          TRUE, TRUE),
  ('groq',      'Groq',      'openai_compat', 'https://api.groq.com/openai/v1',                              TRUE, TRUE),
  ('mistral',   'Mistral',   'openai_compat', 'https://api.mistral.ai/v1',                                   TRUE, TRUE),
  ('cerebras',  'Cerebras',  'openai_compat', 'https://api.cerebras.ai/v1',                                  TRUE, TRUE),
  ('gemini',    'Gemini',    'openai_compat', 'https://generativelanguage.googleapis.com/v1beta/openai/',   TRUE, TRUE),
  ('ollama',    'Ollama',    'ollama',        NULL,                                                          TRUE, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- RLS for tenant-scoped tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['tenant_providers', 'tenant_provider_keys']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (app_tenant_visible(tenant_id))
         WITH CHECK (app_tenant_visible(tenant_id))',
      tbl
    );
  END LOOP;
END $$;
