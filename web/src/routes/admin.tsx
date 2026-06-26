import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2, Check, Crown, ArrowRight } from "lucide-react";
import {
  api,
  type AuditRow,
  type BudgetStatus,
  type CacheStats,
  type Experiment,
  type KeyRow,
  type MetricsResponse,
  type RequestRow,
} from "@/lib/api";
import { logout, useAuth, type ActiveOrg, type Membership, type OrgRole, switchOrg, createOrg } from "@/lib/auth";
import { fmtDate, fmtNum, fmtTime } from "@/lib/utils";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { AuthScreen } from "@/components/AuthScreen";

const usd = (v: unknown) => "$" + Number(v || 0).toFixed(4);
const TABS = ["Metrics", "Keys", "Budget", "Experiments", "Cache", "Evals", "Documents", "Requests", "Audit"] as const;
type Tab = (typeof TABS)[number];

export function Admin() {
  const { user, loading, isPlatformAdmin, canManage, isPro, activeOrg, orgRole, memberships, refresh, setUser } = useAuth();
  const [tab, setTab] = useState<Tab>("Metrics");

  if (loading) {
    return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>;
  }

  if (!user) {
    return <AuthScreen onAuthed={() => refresh()} />;
  }

  if (!isPlatformAdmin && !canManage) {
    return (
      <Account
        email={user.email}
        isPro={isPro}
        activeOrg={activeOrg}
        orgRole={orgRole}
        memberships={memberships}
        onSignOut={() => { logout(); setUser(null); }}
        onOrgChange={refresh}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center bg-ink text-cream">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-medium">Admin Console</div>
          <div className="text-[11px] text-muted-foreground">{user.email}</div>
        </div>
        <Button variant="outline" className="ml-auto" onClick={() => { logout(); setUser(null); }}>Sign out</Button>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "px-4 py-2 text-xs uppercase tracking-[0.12em] transition cursor-pointer " +
                (tab === t ? "border-b-2 border-flame-red text-ink" : "text-muted-foreground hover:text-ink")
              }
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Metrics" && <MetricsPanel />}
        {tab === "Keys" && <KeysPanel />}
        {tab === "Budget" && <BudgetPanel />}
        {tab === "Experiments" && <ExperimentsPanel />}
        {tab === "Cache" && <CachePanel />}
        {tab === "Evals" && <EvalsPanel />}
        {tab === "Documents" && <DocumentsPanel />}
        {tab === "Requests" && <RequestsPanel />}
        {tab === "Audit" && <AuditPanel />}
      </div>
    </div>
  );
}

/* ───────────── Account (free / pro users) ───────────── */
const FREE_FEATURES = [
  "Interactive Playground",
  "Browse Inference & Models",
  "API & integration docs",
];
const PRO_FEATURES = [
  "Everything in Free",
  "Traces & session monitoring",
  "Agent runner & registry",
  "Guardrails, budgets & MCP governance",
  "Regression testing",
];
const QUICK_LINKS = [
  { to: "/playground", label: "Playground", desc: "Chat with the gateway" },
  { to: "/inference", label: "Inference", desc: "Run a single request" },
  { to: "/models", label: "Models", desc: "Browse available models" },
  { to: "/docs", label: "Docs", desc: "API reference & guides" },
];

function Account({
  email,
  isPro,
  activeOrg,
  orgRole,
  memberships,
  onSignOut,
  onOrgChange,
}: {
  email: string;
  isPro: boolean;
  activeOrg: ActiveOrg | null;
  orgRole: OrgRole | null;
  memberships: Membership[];
  onSignOut: () => void;
  onOrgChange: () => void;
}) {
  const plan = isPro ? "Pro" : (activeOrg?.plan === "enterprise" ? "Enterprise" : "Free");
  const [creating, setCreating] = useState(false);
  const [orgName, setOrgName] = useState("");

  async function handleSwitch(tenantId: string) {
    try {
      await switchOrg(tenantId);
      onOrgChange();
      toast.success("Workspace switched");
      window.location.reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to switch");
    }
  }

  async function handleCreate() {
    if (!orgName.trim()) return toast.error("Name required");
    try {
      await createOrg(orgName.trim());
      setCreating(false);
      setOrgName("");
      onOrgChange();
      toast.success("Workspace created");
      window.location.reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center bg-ink text-cream">
          <span className="text-sm font-semibold">{email.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            Account <Badge tone={isPro ? "good" : "default"}>{plan} plan</Badge>
          </div>
          <div className="text-[11px] text-muted-foreground">{email}</div>
          {activeOrg && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {activeOrg.name} · {orgRole ?? "member"}
            </div>
          )}
        </div>
        <Button variant="outline" className="ml-auto" onClick={onSignOut}>Sign out</Button>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {memberships.length > 0 && (
          <Card className="mb-6 p-5">
            <h3 className="mb-3 text-sm font-medium">Your workspaces</h3>
            <ul className="space-y-2 text-sm">
              {memberships.map((m) => (
                <li key={m.tenant_id} className="flex items-center justify-between border border-border p-3">
                  <span>
                    {m.name} <Badge className="ml-2">{m.role}</Badge>
                    {m.tenant_id === activeOrg?.id && <Badge tone="good" className="ml-1">active</Badge>}
                  </span>
                  {m.tenant_id !== activeOrg?.id && (
                    <Button variant="outline" onClick={() => handleSwitch(m.tenant_id)}>Switch</Button>
                  )}
                </li>
              ))}
            </ul>
            {creating ? (
              <div className="mt-3 flex gap-2">
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Workspace name" />
                <Button onClick={handleCreate}>Create</Button>
                <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="outline" className="mt-3" onClick={() => setCreating(true)}>Create workspace</Button>
            )}
          </Card>
        )}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Current (Free) */}
          <Card className={"p-6 " + (!isPro ? "border-flame-red" : "")}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-medium">Free</h3>
              {!isPro && <Badge tone="good">Current</Badge>}
            </div>
            <div className="mb-4 text-2xl font-medium tracking-tight">$0<span className="text-sm text-muted-foreground">/mo</span></div>
            <ul className="space-y-2 text-[13px]">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" /> {f}
                </li>
              ))}
            </ul>
          </Card>

          {/* Pro */}
          <Card className={"p-6 " + (isPro ? "border-flame-red" : "")}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-medium"><Crown className="h-3.5 w-3.5 text-flame-red" /> Pro</h3>
              {isPro && <Badge tone="good">Current</Badge>}
            </div>
            <div className="mb-4 text-2xl font-medium tracking-tight">$29<span className="text-sm text-muted-foreground">/mo</span></div>
            <ul className="mb-5 space-y-2 text-[13px]">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flame-red" /> {f}
                </li>
              ))}
            </ul>
            {isPro ? (
              <div className="text-center text-xs text-muted-foreground">You’re on Pro — thanks for the support.</div>
            ) : (
              <Button
                className="w-full"
                onClick={() => toast("Pro upgrade is coming soon — hang tight!")}
              >
                <Crown className="h-3 w-3" /> Upgrade to Pro
              </Button>
            )}
          </Card>
        </div>

        {/* Quick links */}
        <h3 className="mb-3 mt-8 text-sm font-medium">Start using the gateway</h3>
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
          {QUICK_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="group flex items-center justify-between bg-surface p-4 transition hover:bg-muted"
            >
              <div>
                <div className="text-sm font-medium">{l.label}</div>
                <div className="text-[11px] text-muted-foreground">{l.desc}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-flame-red" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Metrics ───────────── */
function MetricsPanel() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<MetricsResponse | null>(null);
  useEffect(() => {
    api<MetricsResponse>(`/v1/metrics?days=${days}`).then(setData).catch((e) => toast.error(e.message));
  }, [days]);
  if (!data) return <Loading />;

  const totals = data.daily.reduce(
    (a, d) => ({
      req: a.req + Number(d.total_requests),
      ok: a.ok + Number(d.successful),
      cost: a.cost + Number(d.total_cost_usd || 0),
      tok: a.tok + Number(d.total_tokens || 0),
    }),
    { req: 0, ok: 0, cost: 0, tok: 0 },
  );
  const successRate = totals.req ? Math.round((totals.ok / totals.req) * 100) : 0;
  const maxReq = Math.max(...data.daily.map((d) => Number(d.total_requests)), 1);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-sm font-medium">Overview · last {days}d</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={"border px-3 py-1 text-[11px] uppercase tracking-[0.1em] cursor-pointer " + (days === d ? "border-flame-red text-flame-red" : "border-border text-muted-foreground hover:text-ink")}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {[
          { n: fmtNum(totals.req), l: "Requests" },
          { n: successRate + "%", l: "Success rate" },
          { n: fmtNum(totals.tok), l: "Tokens" },
          { n: usd(totals.cost), l: "Spend" },
        ].map((s) => (
          <div key={s.l} className="bg-surface p-5">
            <div className="text-2xl font-medium tracking-tight">{s.n}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{s.l}</div>
          </div>
        ))}
      </div>

      <Card className="mb-5 p-5">
        <h4 className="mb-4 text-sm font-medium">Daily requests</h4>
        {data.daily.length === 0 ? <Empty /> : (
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {[...data.daily].reverse().map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center justify-end" title={`${fmtDate(d.day)}: ${d.total_requests}`}>
                <div className="w-full bg-flame-red" style={{ height: `${(Number(d.total_requests) / maxReq) * 100}%`, minHeight: 2 }} />
                <div className="mt-1 text-[8px] text-muted-foreground">{new Date(d.day).getDate()}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h4 className="mb-3 text-sm font-medium">Top models</h4>
          {data.top_models.length === 0 ? <Empty /> : (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 font-normal">Model</th><th className="py-2 font-normal">Provider</th><th className="py-2 font-normal">Reqs</th><th className="py-2 font-normal">Cost</th></tr></thead>
              <tbody>
                {data.top_models.map((m, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2">{m.routed_model}</td><td className="py-2 text-muted-foreground">{m.routed_provider}</td>
                    <td className="py-2">{fmtNum(m.requests)}</td><td className="py-2">{usd(m.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="p-5">
          <h4 className="mb-3 text-sm font-medium">Guardrail events</h4>
          {data.guardrails.length === 0 ? <div className="py-4 text-center text-xs text-good">No guardrail triggers 🎉</div> : (
            <ul className="space-y-2 text-xs">
              {data.guardrails.map((g, i) => (
                <li key={i} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                  <span><Badge tone="bad">{g.guardrail_action}</Badge> <span className="text-muted-foreground">{(g.guardrail_reasons || []).join(", ")}</span></span>
                  <span>{fmtNum(g.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ───────────── Keys ───────────── */
const SCOPES = ["chat", "retrieve", "agent", "admin"] as const;
function KeysPanel() {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["chat"]);
  const [rpm, setRpm] = useState(60);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = () => api<{ data: KeyRow[] }>("/v1/admin/keys").then((r) => setKeys(r.data)).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return toast.error("Name required");
    if (!scopes.length) return toast.error("Pick at least one scope");
    try {
      const r = await api<{ key: string }>("/v1/admin/keys", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), scopes, rate_limit_rpm: rpm }),
      });
      setNewKey(r.key);
      setCreating(false);
      setName(""); setScopes(["chat"]); setRpm(60);
      load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function revoke(id: string) {
    if (!window.confirm("Revoke this key? Calls using it fail immediately.")) return;
    try { await api(`/v1/admin/keys/${id}`, { method: "DELETE" }); toast.success("Key revoked"); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">API keys</h3>
        <Button onClick={() => setCreating(true)}><Plus className="h-3 w-3" /> New key</Button>
      </div>
      {newKey && (
        <div className="mb-4 border border-flame-red/40 bg-flame-red/5 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-flame-red">New key — copy it now, it won't be shown again</div>
          <div className="flex items-center gap-2">
            <code className="mono min-w-0 flex-1 break-all border border-flame-red/30 bg-surface px-2 py-1 text-xs">{newKey}</code>
            <Button onClick={() => { navigator.clipboard?.writeText(newKey); toast.success("Copied"); }}>Copy</Button>
          </div>
        </div>
      )}
      <Card className="p-5">
        {!keys ? <Loading /> : keys.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Name</th><th className="py-2 pr-3 font-normal">Scopes</th><th className="py-2 pr-3 font-normal">RPM</th>
                <th className="py-2 pr-3 font-normal">Status</th><th className="py-2 pr-3 font-normal">Last used</th><th className="py-2 font-normal"></th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{k.name}</td>
                    <td className="py-2 pr-3"><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</div></td>
                    <td className="py-2 pr-3">{k.rate_limit_rpm}</td>
                    <td className="py-2 pr-3"><Badge tone={k.is_active ? "good" : "bad"}>{k.is_active ? "active" : "revoked"}</Badge></td>
                    <td className="py-2 pr-3 text-muted-foreground">{k.last_used_at ? fmtDate(k.last_used_at) : "never"}</td>
                    <td className="py-2 text-right">{k.is_active && <Button variant="danger" onClick={() => revoke(k.id)}>Revoke</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New API key">
        <div className="mb-3"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production key" /></div>
        <div className="mb-3">
          <Label>Scopes</Label>
          <div className="flex flex-wrap gap-3">
            {SCOPES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={scopes.includes(s)}
                  onChange={(e) => setScopes((cur) => e.target.checked ? [...cur, s] : cur.filter((x) => x !== s))} />
                {s}
              </label>
            ))}
          </div>
        </div>
        <div className="mb-5"><Label>Rate limit (RPM)</Label><Input type="number" value={rpm} onChange={(e) => setRpm(Number(e.target.value))} /></div>
        <Button className="w-full" onClick={create}>Create key</Button>
      </Modal>
    </div>
  );
}

/* ───────────── Budget ───────────── */
function BudgetPanel() {
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [none, setNone] = useState(false);
  const [budget, setBudget] = useState(50);
  const [threshold, setThreshold] = useState(80);
  const [webhook, setWebhook] = useState("");

  const load = () => api<BudgetStatus>("/v1/admin/budget")
    .then((s) => { setStatus(s); setNone(false); if (s.monthly_budget_usd) setBudget(s.monthly_budget_usd); })
    .catch(() => setNone(true));
  useEffect(() => { load(); }, []);

  async function save() {
    try {
      const s = await api<BudgetStatus>("/v1/admin/budget", {
        method: "POST",
        body: JSON.stringify({ monthly_budget_usd: budget, alert_threshold_pct: threshold, alert_webhook_url: webhook.trim() || null }),
      });
      setStatus(s); setNone(false); toast.success("Budget saved");
    } catch (e: any) { toast.error(e.message); }
  }

  const pct = status ? Math.min(100, Math.round((status.spent_usd / (status.monthly_budget_usd || 1)) * 100)) : 0;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-medium">Current month</h3>
        {none ? <Empty text="No budget configured." /> : !status ? <Loading /> : (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-2xl font-medium">{usd(status.spent_usd)}</span>
              <span className="text-sm text-muted-foreground">of {usd(status.monthly_budget_usd)}</span>
            </div>
            <div className="h-2 w-full bg-muted">
              <div className={"h-2 " + (status.exceeded ? "bg-bad" : "bg-flame-red")} style={{ width: pct + "%" }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{pct}% used</span>
              <span>{usd(status.remaining_usd)} left</span>
            </div>
            {status.exceeded && <div className="mt-3"><Badge tone="bad">budget exceeded</Badge></div>}
          </>
        )}
      </Card>
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-medium">Set budget</h3>
        <div className="mb-3"><Label>Monthly budget (USD)</Label><Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></div>
        <div className="mb-3"><Label>Alert threshold (%)</Label><Input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></div>
        <div className="mb-5"><Label>Alert webhook (optional)</Label><Input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://…" /></div>
        <Button className="w-full" onClick={save}>Save budget</Button>
      </Card>
    </div>
  );
}

/* ───────────── Experiments ───────────── */
const EXP_PROVIDERS = ["openai", "anthropic", "groq", "mistral", "cerebras"];
function ExperimentsPanel() {
  const [exps, setExps] = useState<Experiment[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", traffic_split: 50, control_provider: "groq", control_model: "llama-3.1-8b-instant", variant_provider: "groq", variant_model: "llama-3.3-70b-versatile" });

  const load = () => api<{ data: Experiment[] }>("/v1/admin/experiments").then((r) => setExps(r.data)).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.name.trim()) return toast.error("Name required");
    try { await api("/v1/admin/experiments", { method: "POST", body: JSON.stringify(form) }); setCreating(false); toast.success("Experiment created"); load(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function toggle(e: Experiment) {
    try { await api(`/v1/admin/experiments/${e.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !e.is_active }) }); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">A/B experiments</h3>
        <Button onClick={() => setCreating(true)}><Plus className="h-3 w-3" /> New experiment</Button>
      </div>
      <Card className="p-5">
        {!exps ? <Loading /> : exps.length === 0 ? <Empty /> : (
          <div className="space-y-3">
            {exps.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">{e.name} <Badge tone={e.is_active ? "good" : "default"}>{e.is_active ? "active" : "stopped"}</Badge></div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {e.control_provider}/{e.control_model} <span className="text-flame-red">↔ {e.traffic_split}%</span> {e.variant_provider}/{e.variant_model}
                  </div>
                </div>
                <Button variant="outline" onClick={() => toggle(e)}>{e.is_active ? "Stop" : "Resume"}</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New A/B experiment">
        <div className="mb-3"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="sonnet-vs-llama" /></div>
        <div className="mb-3"><Label>Traffic to variant (%)</Label><Input type="number" value={form.traffic_split} onChange={(e) => setForm({ ...form, traffic_split: Number(e.target.value) })} /></div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div><Label>Control provider</Label><Select className="w-full" value={form.control_provider} onChange={(e) => setForm({ ...form, control_provider: e.target.value })}>{EXP_PROVIDERS.map((p) => <option key={p}>{p}</option>)}</Select></div>
          <div><Label>Control model</Label><Input value={form.control_model} onChange={(e) => setForm({ ...form, control_model: e.target.value })} /></div>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-2">
          <div><Label>Variant provider</Label><Select className="w-full" value={form.variant_provider} onChange={(e) => setForm({ ...form, variant_provider: e.target.value })}>{EXP_PROVIDERS.map((p) => <option key={p}>{p}</option>)}</Select></div>
          <div><Label>Variant model</Label><Input value={form.variant_model} onChange={(e) => setForm({ ...form, variant_model: e.target.value })} /></div>
        </div>
        <Button className="w-full" onClick={create}>Create experiment</Button>
      </Modal>
    </div>
  );
}

/* ───────────── Cache ───────────── */
function CachePanel() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const load = () => api<CacheStats>("/v1/admin/cache/stats").then(setStats).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);
  async function clear() {
    if (!window.confirm("Clear all cached entries for this tenant?")) return;
    try { const r = await api<{ deleted: number }>("/v1/admin/cache", { method: "DELETE" }); toast.success(`Cleared ${r.deleted} entries`); load(); }
    catch (e: any) { toast.error(e.message); }
  }
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">Semantic cache</h3>
        <Button variant="danger" onClick={clear}><Trash2 className="h-3 w-3" /> Clear cache</Button>
      </div>
      {!stats ? <Loading /> : (
        <div className="grid grid-cols-3 gap-px bg-border">
          {[{ n: fmtNum(stats.total), l: "Entries" }, { n: fmtNum(stats.hits), l: "Hits" }, { n: fmtNum(stats.expired), l: "Expired" }].map((s) => (
            <div key={s.l} className="bg-surface p-5">
              <div className="text-2xl font-medium">{s.n}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ───────────── Requests ───────────── */
function RequestsPanel() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const q = status ? `&status=${status}` : "";
    api<{ data: RequestRow[] }>(`/v1/requests?limit=50${q}`).then((r) => setRows(r.data)).catch((e) => toast.error(e.message));
  }, [status]);
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">Recent requests</h3>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">all</option><option value="success">success</option><option value="error">error</option><option value="filtered">filtered</option>
        </Select>
      </div>
      {!rows ? <Loading /> : rows.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="border-b border-border text-left uppercase tracking-[0.1em] text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Time</th><th className="py-2 pr-3 font-normal">Model</th><th className="py-2 pr-3 font-normal">Status</th>
              <th className="py-2 pr-3 font-normal">Tokens</th><th className="py-2 pr-3 font-normal">Cost</th><th className="py-2 pr-3 font-normal">Latency</th><th className="py-2 font-normal">Guard</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">{fmtTime(r.created_at)}</td>
                  <td className="py-2 pr-3">{r.routed_provider}/{r.routed_model}</td>
                  <td className={"py-2 pr-3 " + (r.status === "success" ? "text-good" : r.status === "filtered" ? "text-flame-red" : "text-bad")}>{r.status}</td>
                  <td className="py-2 pr-3">{fmtNum(r.total_tokens)}</td>
                  <td className="py-2 pr-3">{usd(r.cost_usd)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.latency_ms != null ? r.latency_ms + "ms" : "—"}</td>
                  <td className="py-2">{r.guardrail_triggered ? <Badge tone="bad">⚠</Badge> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ───────────── Audit ───────────── */
function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => { api<{ data: AuditRow[] }>("/v1/audit-logs?limit=100").then((r) => setRows(r.data)).catch((e) => toast.error(e.message)); }, []);
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-medium">Audit log</h3>
      {!rows ? <Loading /> : rows.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="border-b border-border text-left uppercase tracking-[0.1em] text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Time</th><th className="py-2 pr-3 font-normal">Actor</th><th className="py-2 pr-3 font-normal">Action</th><th className="py-2 font-normal">Resource</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">{fmtTime(r.created_at)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.actor_type}</td>
                  <td className="py-2 pr-3">{r.action}</td>
                  <td className="py-2 text-muted-foreground">{r.resource_type ?? ""} {r.resource_id ? r.resource_id.slice(0, 8) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ───────────── Evals ───────────── */
type EvalRow = { id: string; request_id: string; faithfulness_score: number | null; relevance_score: number | null; coherence_score: number | null; hallucination_detected: boolean; regression_detected: boolean; eval_model: string | null; eval_latency_ms: number | null; created_at: string; routed_model: string; routed_provider: string };
type EvalSummary = { avg_faithfulness: string | null; avg_relevance: string | null; avg_coherence: string | null; hallucinations: string; total: string };

function EvalsPanel() {
  const [rows, setRows] = useState<EvalRow[] | null>(null);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  useEffect(() => {
    api<{ data: EvalRow[]; summary: EvalSummary }>("/v1/admin/evals")
      .then((r) => { setRows(r.data); setSummary(r.summary); })
      .catch((e) => toast.error(e.message));
  }, []);

  const score = (v: number | null | string) => v == null ? "—" : Number(v).toFixed(2);

  return (
    <div>
      {summary && Number(summary.total) > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            { n: score(summary.avg_faithfulness), l: "Avg faithfulness" },
            { n: score(summary.avg_relevance), l: "Avg relevance" },
            { n: score(summary.avg_coherence), l: "Avg coherence" },
            { n: summary.hallucinations + " / " + summary.total, l: "Hallucinations" },
          ].map((s) => (
            <div key={s.l} className="bg-surface p-5">
              <div className="text-2xl font-medium tracking-tight">{s.n}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      )}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-medium">Recent eval results</h3>
        {!rows ? <Loading /> : rows.length === 0 ? <Empty text="No eval results yet — evals run async after each chat request." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="border-b border-border text-left uppercase tracking-[0.1em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Time</th>
                <th className="py-2 pr-3 font-normal">Model</th>
                <th className="py-2 pr-3 font-normal">Faith.</th>
                <th className="py-2 pr-3 font-normal">Relev.</th>
                <th className="py-2 pr-3 font-normal">Coher.</th>
                <th className="py-2 pr-3 font-normal">Halluc.</th>
                <th className="py-2 font-normal">Regress.</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{fmtTime(r.created_at)}</td>
                    <td className="py-2 pr-3">{r.routed_provider}/{r.routed_model}</td>
                    <td className="py-2 pr-3">{score(r.faithfulness_score)}</td>
                    <td className="py-2 pr-3">{score(r.relevance_score)}</td>
                    <td className="py-2 pr-3">{score(r.coherence_score)}</td>
                    <td className="py-2 pr-3">{r.hallucination_detected ? <Badge tone="bad">yes</Badge> : <Badge tone="good">no</Badge>}</td>
                    <td className="py-2">{r.regression_detected ? <Badge tone="bad">yes</Badge> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ───────────── Documents ───────────── */
type DocRow = { id: string; title: string; source_type: string; status: string; chunk_count: number | null; error_message: string | null; created_at: string; indexed_at: string | null };

function DocumentsPanel() {
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");

  const load = () => api<{ data: DocRow[] }>("/v1/documents").then((r) => setDocs(r.data)).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  async function upload() {
    if (!title.trim()) return toast.error("Title required");
    if (!content.trim()) return toast.error("Content required");
    try {
      await api("/v1/documents", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), content: content.trim(), source_url: url.trim() || undefined }),
      });
      toast.success("Document queued for ingestion");
      setUploading(false); setTitle(""); setContent(""); setUrl("");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function del(id: string) {
    if (!window.confirm("Delete this document and all its chunks?")) return;
    try { await api(`/v1/documents/${id}`, { method: "DELETE" }); toast.success("Deleted"); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  const statusColor = (s: string) => s === "indexed" ? "good" : s === "failed" ? "bad" : "default";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">Documents</h3>
        <Button onClick={() => setUploading(true)}><Plus className="h-3 w-3" /> Upload</Button>
      </div>
      <Card className="p-5">
        {!docs ? <Loading /> : docs.length === 0 ? <Empty text="No documents yet. Upload text to enable RAG retrieval." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Title</th>
                <th className="py-2 pr-3 font-normal">Status</th>
                <th className="py-2 pr-3 font-normal">Chunks</th>
                <th className="py-2 pr-3 font-normal">Indexed</th>
                <th className="py-2 font-normal"></th>
              </tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 max-w-xs truncate">{d.title}</td>
                    <td className="py-2 pr-3"><Badge tone={statusColor(d.status)}>{d.status}</Badge></td>
                    <td className="py-2 pr-3">{d.chunk_count ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{d.indexed_at ? fmtDate(d.indexed_at) : "—"}</td>
                    <td className="py-2 text-right"><Button variant="danger" onClick={() => del(d.id)}>Delete</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={uploading} onClose={() => setUploading(false)} title="Upload document">
        <div className="mb-3"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Company handbook" /></div>
        <div className="mb-3"><Label>Source URL (optional)</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></div>
        <div className="mb-5">
          <Label>Content</Label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="Paste document text here…"
            className="w-full border border-border bg-surface px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-flame-red"
          />
        </div>
        <Button className="w-full" onClick={upload}>Upload &amp; ingest</Button>
      </Modal>
    </div>
  );
}

/* ───────────── shared ───────────── */
function Loading() { return <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>; }
function Empty({ text = "Nothing here yet." }: { text?: string }) { return <div className="py-6 text-center text-sm text-muted-foreground">{text}</div>; }
