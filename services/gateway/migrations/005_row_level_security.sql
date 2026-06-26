-- Row-level security: defense-in-depth tenant isolation.
-- Gateway sets app.tenant_id per request; auth/bootstrap uses app.bypass_rls=on.

CREATE OR REPLACE FUNCTION app_tenant_visible(row_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    current_setting('app.bypass_rls', true) = 'on'
    OR row_tenant_id::text = current_setting('app.tenant_id', true)
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'api_keys', 'llm_requests', 'documents', 'document_chunks',
    'conversation_sessions', 'agents', 'agent_runs', 'agent_approvals',
    'approval_policies', 'mcp_servers', 'mcp_policies', 'mcp_call_logs',
    'trace_spans', 'semantic_cache', 'guardrail_policies',
    'tenant_budgets', 'key_budgets', 'ab_experiments', 'eval_results'
  ]
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
