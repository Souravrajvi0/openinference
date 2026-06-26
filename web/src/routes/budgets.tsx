import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { PageHeader } from "@/components/marketing/shared";
import { Badge, Button, Card, Input, Label } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type TenantBudget = {
  monthly_budget_usd: number;
  spent_usd: number;
  remaining_usd: number;
  pct_used: number;
  alert_threshold_pct: number;
  exceeded: boolean;
  near_limit: boolean;
} | null;

type KeySpend = {
  api_key_id: string;
  key_name: string;
  spent_usd: number;
  monthly_budget_usd: number | null;
  pct_used: number | null;
};

type AgentSpend = {
  agent_id: string;
  agent_name: string;
  spent_usd: number;
  monthly_budget_usd: number | null;
  pct_used: number | null;
};

type Summary = {
  tenant: TenantBudget;
  by_key: KeySpend[];
  by_agent: AgentSpend[];
};

type ApiKey = { id: string; name: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function SpendBar({ pct, exceeded }: { pct: number; exceeded?: boolean }) {
  const clamped = Math.min(pct, 100);
  const color = exceeded ? "bg-bad" : pct >= 80 ? "bg-flame-red" : "bg-good";
  return (
    <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
      <div className={cn("h-full transition-all", color)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function usd(n: number) {
  return `$${n.toFixed(4)}`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function Budgets() {
  const { user, loading, setUser } = useAuth();
  if (loading) return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>;
  if (!user)   return <AuthScreen onAuthed={(u) => setUser(u)} />;
  return <BudgetsPage />;
}

function BudgetsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<"overview" | "keys" | "agents">("overview");

  const load = () =>
    api<Summary>("/v1/admin/budget/summary")
      .then(setSummary)
      .catch((e) => toast.error(e.message));

  useEffect(() => { load(); }, []);

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Cost Control"
        title="Hierarchical budgets"
        description="Set monthly spend caps at the tenant, API-key, and agent levels. Requests are blocked when any limit is exceeded."
      />

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["overview", "keys", "agents"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "cursor-pointer px-6 py-3 text-xs uppercase tracking-[0.15em] transition",
              tab === t ? "border-b-2 border-ink font-medium text-ink" : "text-muted-foreground hover:text-ink"
            )}
          >
            {t === "keys" ? "API Keys" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab summary={summary} onRefresh={load} />}
      {tab === "keys"     && <KeysTab    summary={summary} onRefresh={load} />}
      {tab === "agents"   && <AgentsTab  summary={summary} />}
    </div>
  );
}

// ── Overview tab ───────────────────────────────────────────────────────────────

function OverviewTab({ summary, onRefresh }: { summary: Summary | null; onRefresh: () => void }) {
  const [limit, setLimit] = useState("");
  const [threshold, setThreshold] = useState("80");
  const [webhook, setWebhook] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!limit) return toast.error("Enter a budget amount");
    setSaving(true);
    try {
      await api("/v1/admin/budget", {
        method: "POST",
        body: JSON.stringify({
          monthly_budget_usd: parseFloat(limit),
          alert_threshold_pct: parseInt(threshold),
          alert_webhook_url: webhook.trim() || null,
        }),
      });
      toast.success("Tenant budget saved");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Remove tenant budget limit?")) return;
    try {
      await api("/v1/admin/budget", { method: "DELETE" });
      toast.success("Budget removed");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const tb = summary?.tenant;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      {/* Current status */}
      {tb ? (
        <Card className="mb-8 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Tenant monthly budget</div>
            <div className="flex items-center gap-2">
              {tb.exceeded && <Badge tone="bad">Exceeded</Badge>}
              {tb.near_limit && !tb.exceeded && <Badge tone="flame">Near limit</Badge>}
              <button onClick={remove} className="cursor-pointer text-muted-foreground hover:text-bad transition">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mb-3 flex items-end justify-between">
            <span className="text-3xl font-medium tabular-nums">{usd(tb.spent_usd)}</span>
            <span className="text-sm text-muted-foreground">of {usd(tb.monthly_budget_usd)} · {tb.pct_used}%</span>
          </div>
          <SpendBar pct={tb.pct_used} exceeded={tb.exceeded} />

          <div className="mt-3 flex gap-6 text-xs text-muted-foreground">
            <span>Remaining: <span className="text-ink">{usd(tb.remaining_usd)}</span></span>
            <span>Alert at: <span className="text-ink">{tb.alert_threshold_pct}%</span></span>
          </div>
        </Card>
      ) : (
        <div className="mb-6 rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No tenant-level budget set. All spend is uncapped.
        </div>
      )}

      {/* Set / update form */}
      <Card className="p-6">
        <div className="mb-4 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {tb ? "Update tenant budget" : "Set tenant budget"}
        </div>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Monthly limit (USD)</Label>
              <Input
                type="number" step="0.01" min="0.01"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder={tb ? String(tb.monthly_budget_usd) : "e.g. 50.00"}
              />
            </div>
            <div>
              <Label>Alert threshold (%)</Label>
              <Input
                type="number" min="1" max="100"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="80"
              />
            </div>
          </div>
          <div>
            <Label>Alert webhook URL (optional)</Label>
            <Input
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://hooks.example.com/budget-alert"
            />
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save budget"}</Button>
        </form>
      </Card>

      {/* Month summary across all keys/agents */}
      {summary && (
        <div className="mt-8 grid grid-cols-2 gap-4">
          <StatCard label="Total keys with spend" value={summary.by_key.filter((k) => k.spent_usd > 0).length} />
          <StatCard label="Total agents with spend" value={summary.by_agent.filter((a) => a.spent_usd > 0).length} />
          <StatCard
            label="Top key spend"
            value={summary.by_key.length > 0 ? usd(summary.by_key[0]!.spent_usd) : "—"}
          />
          <StatCard
            label="Top agent spend"
            value={summary.by_agent.length > 0 ? usd(summary.by_agent[0]!.spent_usd) : "—"}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="text-xl font-medium tabular-nums">{value}</div>
    </Card>
  );
}

// ── Keys tab ───────────────────────────────────────────────────────────────────

function KeysTab({ summary, onRefresh }: { summary: Summary | null; onRefresh: () => void }) {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [limit, setLimit] = useState("");
  const [threshold, setThreshold] = useState("80");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ data: ApiKey[] }>("/v1/admin/keys")
      .then((r) => setKeys(r.data))
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedKey || !limit) return toast.error("Select a key and enter a limit");
    setSaving(true);
    try {
      await api("/v1/admin/key-budgets", {
        method: "POST",
        body: JSON.stringify({
          api_key_id: selectedKey,
          monthly_budget_usd: parseFloat(limit),
          alert_threshold_pct: parseInt(threshold),
        }),
      });
      toast.success("Key budget saved");
      setSelectedKey(""); setLimit(""); setThreshold("80");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeBudget(keyId: string) {
    try {
      await api(`/v1/admin/key-budgets/${keyId}`, { method: "DELETE" });
      toast.success("Budget removed");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const rows = summary?.by_key ?? [];

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      {/* Table */}
      <div className="mb-8">
        <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">This month — by API key</div>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No API key spend this month.</div>
        ) : (
          <div className="flex flex-col gap-px bg-border">
            {rows.map((k) => (
              <div key={k.api_key_id} className="bg-cream px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{k.key_name}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm tabular-nums">{usd(k.spent_usd)}</span>
                    {k.monthly_budget_usd && (
                      <>
                        <span className="text-xs text-muted-foreground">/ {usd(k.monthly_budget_usd)}</span>
                        <button onClick={() => removeBudget(k.api_key_id)} className="cursor-pointer text-muted-foreground hover:text-bad transition">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {k.monthly_budget_usd && k.pct_used !== null && (
                  <SpendBar pct={k.pct_used} exceeded={k.pct_used >= 100} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Set budget form */}
      <Card className="p-6">
        <div className="mb-4 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Set per-key budget</div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>API key</Label>
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="w-full bg-surface border border-border-strong px-3 py-2 text-sm outline-none transition focus:border-flame-red cursor-pointer"
            >
              <option value="">— Select a key —</option>
              {(keys ?? []).map((k) => (
                <option key={k.id} value={k.id}>{k.name || k.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Monthly limit (USD)</Label>
              <Input type="number" step="0.01" min="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="10.00" />
            </div>
            <div>
              <Label>Alert threshold (%)</Label>
              <Input type="number" min="1" max="100" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Set budget"}</Button>
        </form>
      </Card>
    </div>
  );
}

// ── Agents tab ─────────────────────────────────────────────────────────────────

function AgentsTab({ summary }: { summary: Summary | null }) {
  const rows = summary?.by_agent ?? [];

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      <p className="mb-6 text-sm text-muted-foreground">
        Agent monthly budgets are configured in the <Link to="/agents" className="underline">Agents</Link> page when creating or editing an agent.
      </p>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No agent spend this month.</div>
      ) : (
        <div className="flex flex-col gap-px bg-border">
          {rows.map((a) => (
            <div key={a.agent_id} className="bg-cream px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{a.agent_name}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm tabular-nums">{usd(a.spent_usd)}</span>
                  {a.monthly_budget_usd && (
                    <span className="text-xs text-muted-foreground">/ {usd(a.monthly_budget_usd)}</span>
                  )}
                </div>
              </div>
              {a.monthly_budget_usd && a.pct_used !== null && (
                <>
                  <SpendBar pct={a.pct_used} exceeded={a.pct_used >= 100} />
                  <div className="mt-1 text-[10px] text-muted-foreground">{a.pct_used}% used</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
