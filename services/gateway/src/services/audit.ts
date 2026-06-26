import { queryAsSystem } from '../db/client';

export type AuditAction =
  | 'request.created' | 'request.filtered' | 'request.error'
  | 'key.created' | 'key.revoked'
  | 'doc.indexed' | 'doc.deleted'
  | 'cache.hit' | 'budget.alert' | 'budget.exceeded'
  | 'experiment.created' | 'experiment.stopped'
  | 'user.signup'
  | 'guardrail_policy.created' | 'guardrail_policy.deleted'
  | 'agent.created' | 'agent.deactivated'
  | 'approval.approved' | 'approval.rejected'
  | 'approval_policy.created'
  | 'key_budget.set'
  | 'mcp_server.created'
  | 'test_suite.created' | 'test_run.completed'
  | 'org.created' | 'org.switched'
  | 'member.role_changed' | 'member.removed'
  | 'invite.created' | 'invite.revoked' | 'invite.accepted';

export interface AuditEntry {
  tenant_id: string;
  actor_type: 'api_key' | 'system' | 'admin' | 'user';
  actor_id?: string | null;
  action: AuditAction;
  resource_type?: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, unknown>;
}

export function writeAudit(entry: AuditEntry): void {
  queryAsSystem(
    `INSERT INTO audit_logs
       (tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        ip_address, user_agent, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      entry.tenant_id, entry.actor_type, entry.actor_id ?? null,
      entry.action, entry.resource_type ?? null, entry.resource_id ?? null,
      entry.ip_address ?? null, entry.user_agent ?? null,
      JSON.stringify(entry.details ?? {}),
    ]
  ).catch(() => {});
}
