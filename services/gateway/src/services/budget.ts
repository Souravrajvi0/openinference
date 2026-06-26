import { query } from '../db/client';
import { writeAudit } from './audit';
import { getRedis } from './redis';

export interface BudgetStatus {
  monthly_budget_usd: number;
  spent_usd: number;
  remaining_usd: number;
  pct_used: number;
  alert_threshold_pct: number;
  exceeded: boolean;
  near_limit: boolean;
}

type BudgetRow = {
  monthly_budget_usd: string;
  alert_threshold_pct: number;
  alert_webhook_url: string | null;
  spent_usd: string;
};

async function buildBudgetStatus(row: BudgetRow, tenantId: string, notify: boolean): Promise<BudgetStatus> {
  const budget = parseFloat(row.monthly_budget_usd);
  const spent = parseFloat(row.spent_usd);
  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const exceeded = spent >= budget;
  const near_limit = !exceeded && pct >= row.alert_threshold_pct;

  if (notify && (near_limit || exceeded) && row.alert_webhook_url) {
    const event = exceeded ? 'budget.exceeded' : 'budget.alert';
    const monthKey = new Date().toISOString().slice(0, 7);
    const dedupeKey = `budget:notify:${tenantId}:${event}:${monthKey}`;
    const shouldNotify = await getRedis().set(dedupeKey, '1', 'EX', 3600, 'NX');
    if (shouldNotify === 'OK') {
      fetch(row.alert_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, tenant_id: tenantId, spent_usd: spent, budget_usd: budget, pct_used: pct }),
      }).catch(() => {});
      writeAudit({
        tenant_id: tenantId,
        actor_type: 'system',
        action: exceeded ? 'budget.exceeded' : 'budget.alert',
        details: { spent_usd: spent, budget_usd: budget, pct_used: pct },
      });
    }
  }

  return {
    monthly_budget_usd: budget,
    spent_usd: spent,
    remaining_usd: Math.max(0, budget - spent),
    pct_used: pct,
    alert_threshold_pct: row.alert_threshold_pct,
    exceeded,
    near_limit,
  };
}

export async function checkBudget(tenantId: string): Promise<BudgetStatus | null> {
  const result = await query<BudgetRow>(
    `SELECT b.monthly_budget_usd, b.alert_threshold_pct, b.alert_webhook_url,
            COALESCE(SUM(r.cost_usd), 0) AS spent_usd
     FROM tenant_budgets b
     LEFT JOIN llm_requests r
       ON r.tenant_id = b.tenant_id
      AND r.created_at >= date_trunc('month', NOW())
      AND r.status = 'success'
     WHERE b.tenant_id = $1
     GROUP BY b.monthly_budget_usd, b.alert_threshold_pct, b.alert_webhook_url`,
    [tenantId]
  );

  if (result.rows.length === 0) return null;
  return buildBudgetStatus(result.rows[0]!, tenantId, true);
}

export async function checkKeyBudget(apiKeyId: string): Promise<BudgetStatus | null> {
  const result = await query<BudgetRow & { tenant_id: string }>(
    `SELECT kb.monthly_budget_usd, kb.alert_threshold_pct, kb.alert_webhook_url,
            kb.tenant_id,
            COALESCE(SUM(r.cost_usd), 0) AS spent_usd
     FROM key_budgets kb
     LEFT JOIN llm_requests r
       ON r.api_key_id = kb.api_key_id
      AND r.created_at >= date_trunc('month', NOW())
      AND r.status = 'success'
     WHERE kb.api_key_id = $1
     GROUP BY kb.monthly_budget_usd, kb.alert_threshold_pct, kb.alert_webhook_url, kb.tenant_id`,
    [apiKeyId]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0]!;
  // Key-budget webhooks audit under the owning tenant.
  return await buildBudgetStatus(row, row.tenant_id, true);
}

export type SpendLimitFailure = { level: 'tenant' | 'key'; status: BudgetStatus };

/** Enforce tenant budget, then per-API-key budget when a key is present. */
export async function checkSpendLimits(
  tenantId: string,
  apiKeyId?: string | null,
): Promise<{ ok: true } | ({ ok: false } & SpendLimitFailure)> {
  const tenant = await checkBudget(tenantId);
  if (tenant?.exceeded) {
    return { ok: false, level: 'tenant', status: tenant };
  }

  if (apiKeyId) {
    const key = await checkKeyBudget(apiKeyId);
    if (key?.exceeded) {
      return { ok: false, level: 'key', status: key };
    }
  }

  return { ok: true };
}
