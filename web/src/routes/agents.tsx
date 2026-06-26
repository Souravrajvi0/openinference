import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtTime, fmtNum, cn } from "@/lib/utils";
import { AuthScreen } from "@/components/AuthScreen";
import { PageHeader } from "@/components/marketing/shared";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui/primitives";

// ── Types ──────────────────────────────────────────────────────────────────────

type AgentRow = {
  id: string;
  name: string;
  description: string | null;
  allowed_tools: string[];
  allowed_models: string[];
  max_steps: number;
  monthly_budget_usd: string | null;
  system_prompt: string | null;
  is_active: boolean;
  total_runs: number;
  last_run_at: string | null;
  avg_cost_usd: string | null;
  avg_steps: string | null;
  spend_this_month: string | null;
};

type AgentStats = {
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  avg_steps: string | null;
  avg_cost_usd: string | null;
  spend_this_month: string | null;
  spend_total: string | null;
};

type RunRow = {
  id: string;
  goal: string;
  status: string;
  steps_used: number;
  total_tokens: number | null;
  cost_usd: string | null;
  started_at: string;
  completed_at: string | null;
};

const AVAILABLE_TOOLS = ["retrieve_documents", "calculate"];

const STATUS_COLOR: Record<string, string> = {
  completed: "text-good",
  failed: "text-bad",
};

const usd = (v: string | null | undefined) =>
  v ? "$" + parseFloat(v).toFixed(6) : "—";

const pct = (a: number, b: number) =>
  b === 0 ? "—" : Math.round((a / b) * 100) + "%";

// ── Page ───────────────────────────────────────────────────────────────────────

export function Agents() {
  const { user, loading, setUser } = useAuth();

  if (loading) return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>;
  if (!user)   return <AuthScreen onAuthed={(u) => setUser(u)} />;

  return <AgentsPage />;
}

function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selected = agents?.find((a) => a.id === selectedId) ?? null;

  const load = () =>
    api<{ data: AgentRow[] }>("/v1/admin/agents")
      .then((r) => setAgents(r.data))
      .catch((e) => toast.error(e.message));

  useEffect(() => { load(); }, []);

  async function toggleAgent(a: AgentRow) {
    try {
      await api(`/v1/admin/agents/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !a.is_active }),
      });
      setAgents((prev) => prev?.map((x) => x.id === a.id ? { ...x, is_active: !x.is_active } : x) ?? null);
    } catch (e: any) { toast.error(e.message); }
  }

  async function deleteAgent(a: AgentRow) {
    if (!window.confirm(`Deactivate agent "${a.name}"?`)) return;
    try {
      await api(`/v1/admin/agents/${a.id}`, { method: "DELETE" });
      setAgents((prev) => prev?.map((x) => x.id === a.id ? { ...x, is_active: false } : x) ?? null);
      toast.success("Agent deactivated");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Governance"
        title="Agent registry"
        description="Register named agents with a governed identity — dedicated tool allowlists, budget caps, custom system prompts, and a full run history."
      />

      {/* Split layout */}
      <div className="flex flex-col lg:flex-row" style={{ minHeight: "calc(100vh - 280px)" }}>
        {/* List */}
        <div className="flex flex-col border-b border-border lg:w-[38%] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {agents ? `${agents.length} agent${agents.length !== 1 ? "s" : ""}` : "Loading…"}
            </span>
            <Button onClick={() => { setSelectedId(null); setShowCreate(true); }}>+ New</Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!agents ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : agents.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">No agents yet</div>
                <p className="max-w-xs text-sm text-muted-foreground">Create an agent to give it a governed identity with tool restrictions and a budget.</p>
              </div>
            ) : (
              agents.map((a) => {
                const active = selectedId === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => { setSelectedId(a.id); setShowCreate(false); }}
                    className={cn(
                      "w-full cursor-pointer border-b border-border px-4 py-3 text-left transition",
                      active ? "bg-ink text-cream" : "hover:bg-surface",
                      !a.is_active && "opacity-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      <span className={`shrink-0 text-[10px] ${active ? "text-cream/50" : "text-muted-foreground"}`}>
                        {a.total_runs} run{a.total_runs !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {a.allowed_tools.length === 0 ? (
                        <span className={`text-[9px] uppercase tracking-[0.1em] ${active ? "text-cream/40" : "text-muted-foreground"}`}>all tools</span>
                      ) : a.allowed_tools.map((t) => (
                        <span key={t} className={`font-mono text-[9px] ${active ? "text-cream/60" : "text-muted-foreground"}`}>{t}</span>
                      ))}
                    </div>
                    {a.monthly_budget_usd && (
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1 flex-1 bg-border overflow-hidden">
                          <div
                            className="h-full bg-good transition-all"
                            style={{ width: `${Math.min(100, (parseFloat(a.spend_this_month ?? "0") / parseFloat(a.monthly_budget_usd)) * 100)}%` }}
                          />
                        </div>
                        <span className={`shrink-0 text-[9px] ${active ? "text-cream/40" : "text-muted-foreground"}`}>
                          {usd(a.spend_this_month)} / ${parseFloat(a.monthly_budget_usd).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          {showCreate ? (
            <CreateForm
              onCreated={(a) => {
                const row: AgentRow = {
                  ...a,
                  total_runs: 0,
                  last_run_at: null,
                  avg_cost_usd: null,
                  avg_steps: null,
                  spend_this_month: null,
                };
                setAgents((prev) => (prev ? [row, ...prev] : [row]));
                setShowCreate(false);
                setSelectedId(a.id);
              }}
              onCancel={() => setShowCreate(false)}
            />
          ) : selected ? (
            <AgentDetail
              agent={selected}
              onToggle={() => toggleAgent(selected)}
              onDelete={() => { deleteAgent(selected); }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">No agent selected</div>
              <p className="max-w-xs text-sm text-muted-foreground">
                Select an agent to view its stats and run history, or create a new one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Agent detail ───────────────────────────────────────────────────────────────

function AgentDetail({ agent, onToggle, onDelete }: { agent: AgentRow; onToggle: () => void; onDelete: () => void }) {
  const [tab, setTab] = useState<"stats" | "runs">("stats");
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);

  useEffect(() => {
    setStats(null);
    setRuns(null);
    api<AgentStats>(`/v1/admin/agents/${agent.id}/stats`)
      .then(setStats)
      .catch((e) => toast.error(e.message));
    api<{ data: RunRow[] }>(`/v1/admin/agents/${agent.id}/runs?limit=50`)
      .then((r) => setRuns(r.data))
      .catch((e) => toast.error(e.message));
  }, [agent.id]);

  return (
    <div>
      {/* Name + controls */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">{agent.name}</h2>
          {agent.description && (
            <p className="mt-1 text-sm text-muted-foreground">{agent.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onToggle}
            title={agent.is_active ? "Disable" : "Enable"}
            className={cn(
              "h-5 w-9 cursor-pointer rounded-full transition",
              agent.is_active ? "bg-good" : "bg-border"
            )}
          >
            <span className={cn("block h-4 w-4 rounded-full bg-cream shadow transition", agent.is_active ? "translate-x-[18px]" : "translate-x-0.5")} />
          </button>
          <Button variant="danger" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>

      {/* Config strip */}
      <div className="mb-6 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {[
          { label: "Max steps", value: String(agent.max_steps) },
          { label: "Budget / mo", value: agent.monthly_budget_usd ? `$${parseFloat(agent.monthly_budget_usd).toFixed(2)}` : "Unlimited" },
          { label: "Tools", value: agent.allowed_tools.length === 0 ? "All" : agent.allowed_tools.join(", ") },
          { label: "Status", value: agent.is_active ? "Active" : "Inactive" },
        ].map((s) => (
          <div key={s.label} className="bg-surface p-4">
            <div className="truncate text-sm font-medium">{s.value}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {agent.system_prompt && (
        <div className="mb-6">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">System prompt</div>
          <Card className="p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{agent.system_prompt}</p>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex border-b border-border">
        {(["stats", "runs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-xs uppercase tracking-[0.15em] transition cursor-pointer",
              tab === t ? "border-b-2 border-ink font-medium text-ink" : "text-muted-foreground hover:text-ink"
            )}
          >
            {t === "stats" ? "Stats" : "Run history"}
          </button>
        ))}
      </div>

      {tab === "stats" && <StatsPane stats={stats} agent={agent} />}
      {tab === "runs" && <RunsPane runs={runs} />}
    </div>
  );
}

function StatsPane({ stats, agent }: { stats: AgentStats | null; agent: AgentRow }) {
  if (!stats) return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;

  const successRate = pct(stats.completed_runs, stats.total_runs);
  const budgetPct = agent.monthly_budget_usd && stats.spend_this_month
    ? Math.min(100, (parseFloat(stats.spend_this_month) / parseFloat(agent.monthly_budget_usd)) * 100)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        {[
          { label: "Total runs",    value: String(stats.total_runs) },
          { label: "Success rate",  value: successRate },
          { label: "Avg steps",     value: stats.avg_steps ? parseFloat(stats.avg_steps).toFixed(1) : "—" },
          { label: "Avg cost",      value: usd(stats.avg_cost_usd) },
          { label: "Spend this mo", value: usd(stats.spend_this_month) },
          { label: "Spend total",   value: usd(stats.spend_total) },
        ].map((s) => (
          <div key={s.label} className="bg-surface p-4">
            <div className="text-sm font-medium">{s.value}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {budgetPct !== null && (
        <div>
          <div className="mb-2 flex justify-between text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <span>Monthly budget</span>
            <span>{budgetPct.toFixed(1)}% used</span>
          </div>
          <div className="h-2 w-full bg-border">
            <div
              className={cn("h-full transition-all", budgetPct >= 90 ? "bg-bad" : budgetPct >= 70 ? "bg-flame-red" : "bg-good")}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RunsPane({ runs }: { runs: RunRow[] | null }) {
  if (!runs) return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (runs.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">No runs yet.</div>;

  return (
    <div className="flex flex-col gap-px bg-border">
      {runs.map((r) => (
        <RunRow key={r.id} run={r} />
      ))}
    </div>
  );
}

function RunRow({ run }: { run: RunRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-cream">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-surface transition"
      >
        <span className={`shrink-0 text-xs font-medium ${STATUS_COLOR[run.status] ?? "text-muted-foreground"}`}>
          {run.status}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">{run.goal}</span>
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{run.steps_used} steps</span>
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{usd(run.cost_usd)}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(run.started_at)}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-border bg-surface px-4 py-3">
          <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Goal</div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{run.goal}</p>
          <div className="mt-3 flex gap-6 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {run.total_tokens != null && <span>{fmtNum(run.total_tokens)} tokens</span>}
            {run.cost_usd && <span>{usd(run.cost_usd)}</span>}
            <span>{run.steps_used} step{run.steps_used !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create form ────────────────────────────────────────────────────────────────

const EMPTY = {
  name: "",
  description: "",
  allowed_tools: [] as string[],
  allowed_models: "",
  max_steps: 5,
  monthly_budget_usd: "",
  system_prompt: "",
};

type CreateResponse = {
  id: string;
  name: string;
  description: string | null;
  allowed_tools: string[];
  allowed_models: string[];
  max_steps: number;
  monthly_budget_usd: string | null;
  system_prompt: string | null;
  is_active: boolean;
};

function CreateForm({ onCreated, onCancel }: { onCreated: (a: CreateResponse) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY, val: unknown) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  function toggleTool(tool: string) {
    setForm((prev) => ({
      ...prev,
      allowed_tools: prev.allowed_tools.includes(tool)
        ? prev.allowed_tools.filter((t) => t !== tool)
        : [...prev.allowed_tools, tool],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        allowed_tools: form.allowed_tools,
        allowed_models: form.allowed_models.split(",").map((s) => s.trim()).filter(Boolean),
        max_steps: form.max_steps,
        monthly_budget_usd: form.monthly_budget_usd ? parseFloat(form.monthly_budget_usd) : null,
        system_prompt: form.system_prompt.trim() || null,
      };
      const agent = await api<CreateResponse>("/v1/admin/agents", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success("Agent created");
      onCreated(agent);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-medium">New agent</h2>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Support bot" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Handles customer support queries" />
          </div>
        </div>

        <div>
          <Label>Allowed tools</Label>
          <p className="mb-2 text-[11px] text-muted-foreground">Empty = all tools allowed</p>
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_TOOLS.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.allowed_tools.includes(t)}
                  onChange={() => toggleTool(t)}
                  className="rounded"
                />
                <span className="font-mono">{t}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>Max steps</Label>
            <Select value={form.max_steps} onChange={(e) => set("max_steps", Number(e.target.value))} className="w-full">
              {[1, 2, 3, 5, 7, 10, 15, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Monthly budget (USD)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.monthly_budget_usd}
              onChange={(e) => set("monthly_budget_usd", e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div>
            <Label>Allowed models (comma-separated)</Label>
            <Input
              value={form.allowed_models}
              onChange={(e) => set("allowed_models", e.target.value)}
              placeholder="Empty = any model"
            />
          </div>
        </div>

        <div>
          <Label>System prompt</Label>
          <p className="mb-1 text-[11px] text-muted-foreground">Overrides the default "You are a helpful AI agent…" prompt</p>
          <Textarea
            value={form.system_prompt}
            onChange={(e) => set("system_prompt", e.target.value)}
            rows={5}
            placeholder="You are a customer support agent for Acme Corp. You only answer questions about our products…"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create agent"}</Button>
        </div>
      </form>
    </div>
  );
}
