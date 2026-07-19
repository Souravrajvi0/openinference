import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2, Check, Crown, ArrowRight } from "lucide-react";
import {
  api,
  apiUpload,
  MODEL_CATALOG,
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
const TABS = ["Metrics", "Keys", "Org Providers", "Providers", "Tenants", "Budget", "Experiments", "Cache", "Evals", "Documents", "Requests", "Audit"] as const;
const PLATFORM_ADMIN_TABS: readonly string[] = ["Providers", "Tenants"];
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
          {TABS.filter((t) => !PLATFORM_ADMIN_TABS.includes(t) || isPlatformAdmin).map((t) => (
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
        {tab === "Org Providers" && <OrgProvidersPanel />}
        {tab === "Providers" && isPlatformAdmin && <ProvidersPanel />}
        {tab === "Tenants" && isPlatformAdmin && <TenantsPanel />}
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
  { to: "/docs", label: "API access", desc: "SDK snippets, auth, endpoints" },
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

/* ───────────── Key usage snippets ───────────── */
// Shown once, right when a key is created — the moment the developer needs
// to know how to call the gateway. Works with any OpenAI SDK via base_url.
const SNIPPET_LANGS = ["Python", "JavaScript", "curl"] as const;
type SnippetLang = (typeof SNIPPET_LANGS)[number];

function keySnippet(lang: SnippetLang, origin: string, key: string): string {
  switch (lang) {
    case "Python":
      return `from openai import OpenAI

client = OpenAI(api_key="${key}", base_url="${origin}/v1")

resp = client.chat.completions.create(
    model="llama-3.1-8b-instant",  # any id from GET /v1/models
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`;
    case "JavaScript":
      return `import OpenAI from "openai";

const client = new OpenAI({ apiKey: "${key}", baseURL: "${origin}/v1" });

const resp = await client.chat.completions.create({
  model: "llama-3.1-8b-instant", // any id from GET /v1/models
  messages: [{ role: "user", content: "Hello" }],
});
console.log(resp.choices[0].message.content);`;
    case "curl":
      return `curl -X POST ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "llama-3.1-8b-instant", "messages": [{"role": "user", "content": "Hello"}]}'`;
  }
}

function KeySnippets({ apiKey }: { apiKey: string }) {
  const [lang, setLang] = useState<SnippetLang>("Python");
  const origin = window.location.origin;
  const code = keySnippet(lang, origin, apiKey);

  return (
    <div className="mt-3 border-t border-flame-red/20 pt-3">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <span className="mr-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Use it with any OpenAI SDK</span>
        {SNIPPET_LANGS.map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={
              "px-2 py-1 text-[11px] transition cursor-pointer " +
              (lang === l ? "bg-ink text-cream" : "text-muted-foreground hover:text-ink")
            }
          >
            {l}
          </button>
        ))}
        <Button variant="outline" className="ml-auto" onClick={() => { navigator.clipboard?.writeText(code); toast.success("Snippet copied"); }}>
          Copy snippet
        </Button>
      </div>
      <pre className="mono overflow-x-auto border border-border bg-surface p-3 text-[11px] leading-relaxed">{code}</pre>
      <p className="mt-2 text-[11px] text-muted-foreground">
        List the models this key can use: <code className="mono">GET {origin}/v1/models</code> with the same header.
        The native API (<code className="mono">POST /v1/chat</code> with <code className="mono">X-Api-Key</code>) supports sessions, RAG and provider pinning.
      </p>
    </div>
  );
}

/* ───────────── Keys ───────────── */
const SCOPES = ["chat", "retrieve", "agent", "admin"] as const;
type LiveProviderModels = { provider: string; configured: boolean; models: string[]; error?: string };

function KeysPanel() {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["chat"]);
  const [rpm, setRpm] = useState(60);
  const [restrictModels, setRestrictModels] = useState(false);
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  // null = not fetched yet, "failed" = endpoint unreachable (static fallback)
  const [liveModels, setLiveModels] = useState<LiveProviderModels[] | "failed" | null>(null);

  const load = () => api<{ data: KeyRow[] }>("/v1/admin/keys").then((r) => setKeys(r.data)).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  const loadModels = (refresh = false) => {
    if (refresh) setLiveModels(null);
    api<{ data: LiveProviderModels[] }>(`/v1/admin/models${refresh ? "?refresh=1" : ""}`)
      .then((r) => setLiveModels(r.data?.length ? r.data : "failed"))
      .catch(() => setLiveModels("failed"));
  };
  useEffect(() => { if (restrictModels && liveModels === null) loadModels(); }, [restrictModels]);

  async function create() {
    if (!name.trim()) return toast.error("Name required");
    if (!scopes.length) return toast.error("Pick at least one scope");
    if (restrictModels && !allowedModels.length) return toast.error("Pick at least one model, or turn off the restriction");
    try {
      const r = await api<{ key: string }>("/v1/admin/keys", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(), scopes, rate_limit_rpm: rpm,
          ...(restrictModels && allowedModels.length ? { allowed_models: allowedModels } : {}),
        }),
      });
      setNewKey(r.key);
      setCreating(false);
      setName(""); setScopes(["chat"]); setRpm(60); setRestrictModels(false); setAllowedModels([]);
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
          <KeySnippets apiKey={newKey} />
        </div>
      )}
      <Card className="p-5">
        {!keys ? <Loading /> : keys.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Name</th><th className="py-2 pr-3 font-normal">Scopes</th>
                <th className="py-2 pr-3 font-normal">Models</th><th className="py-2 pr-3 font-normal">RPM</th>
                <th className="py-2 pr-3 font-normal">Status</th><th className="py-2 pr-3 font-normal">Last used</th><th className="py-2 font-normal"></th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{k.name}</td>
                    <td className="py-2 pr-3"><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</div></td>
                    <td className="py-2 pr-3">
                      {!k.allowed_models ? (
                        <span className="text-muted-foreground">all</span>
                      ) : (
                        <div className="flex flex-wrap gap-1" title={k.allowed_models.join(", ")}>
                          {k.allowed_models.slice(0, 2).map((m) => <Badge key={m}>{m}</Badge>)}
                          {k.allowed_models.length > 2 && <Badge>+{k.allowed_models.length - 2}</Badge>}
                        </div>
                      )}
                    </td>
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
        <div className="mb-3"><Label>Rate limit (RPM)</Label><Input type="number" value={rpm} onChange={(e) => setRpm(Number(e.target.value))} /></div>
        <div className="mb-5">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={restrictModels}
              onChange={(e) => { setRestrictModels(e.target.checked); if (!e.target.checked) setAllowedModels([]); }} />
            Restrict to specific models
          </label>
          {restrictModels && (
            <div className="mt-2 max-h-56 overflow-y-auto border border-border p-2">
              {liveModels === null ? (
                <div className="py-2 text-xs text-muted-foreground">Discovering available models…</div>
              ) : liveModels === "failed" ? (
                // Discovery unavailable — fall back to the static catalog
                MODEL_CATALOG.map((m) => (
                  <label key={m.provider + m.model} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                    <input type="checkbox" checked={allowedModels.includes(m.model)}
                      onChange={(e) => setAllowedModels((cur) => e.target.checked ? [...cur, m.model] : cur.filter((x) => x !== m.model))} />
                    <span className="mono text-xs">{m.model}</span>
                    <span className="text-[11px] text-muted-foreground">{m.provider} · {m.tier}</span>
                  </label>
                ))
              ) : (
                liveModels.map((p) => (
                  <div key={p.provider} className="mb-2">
                    <div className="flex items-baseline gap-2 border-b border-border pb-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {PROVIDER_LABELS[p.provider] ?? p.provider}
                      {!p.configured && <span className="normal-case tracking-normal">— no key configured</span>}
                      {p.error && <span className="normal-case tracking-normal text-bad">— unreachable ({p.error})</span>}
                      {p.configured && !p.error && <span className="normal-case tracking-normal">{p.models.length} models</span>}
                    </div>
                    {p.models.map((m) => (
                      <label key={p.provider + m} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                        <input type="checkbox" checked={allowedModels.includes(m)}
                          onChange={(e) => setAllowedModels((cur) => e.target.checked ? [...cur, m] : cur.filter((x) => x !== m))} />
                        <span className="mono text-xs">{m}</span>
                      </label>
                    ))}
                  </div>
                ))
              )}
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Requests routed to any other model are rejected with 403. Leave unchecked to allow all models the plan permits.
                </p>
                {liveModels !== null && (
                  <button type="button" className="shrink-0 cursor-pointer text-[11px] text-muted-foreground underline hover:text-ink"
                    onClick={() => loadModels(true)}>Refresh</button>
                )}
              </div>
            </div>
          )}
        </div>
        <Button className="w-full" onClick={create}>Create key</Button>
      </Modal>
    </div>
  );
}

/* ───────────── Org providers (per-tenant keys) ───────────── */
type OrgProviderRow = {
  slug: string;
  name: string;
  kind: string;
  enabled: boolean;
  has_key: boolean;
  masked_key: string | null;
  needs_key: boolean;
  use_platform_key: boolean;
  platform_key_available: boolean;
  usable: boolean;
};

function OrgProvidersPanel() {
  const [rows, setRows] = useState<OrgProviderRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");

  const load = () =>
    api<{ data: OrgProviderRow[] }>("/v1/admin/org/providers")
      .then((r) => setRows(r.data))
      .catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  async function patch(slug: string, body: { enabled?: boolean; use_platform_key?: boolean }) {
    try {
      await api(`/v1/admin/org/providers/${slug}`, { method: "PUT", body: JSON.stringify(body) });
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function toggle(slug: string, enabled: boolean) {
    await patch(slug, { enabled });
    toast.success(enabled ? "Provider enabled" : "Provider disabled");
  }

  async function togglePlatformKey(slug: string, use_platform_key: boolean) {
    await patch(slug, { enabled: true, use_platform_key });
    toast.success(use_platform_key ? "Using platform key" : "Stopped using platform key");
  }

  async function saveKey() {
    if (!editing) return;
    if (keyInput.trim().length < 8) return toast.error("Key looks too short");
    try {
      await api(`/v1/admin/org/provider-keys/${editing}`, {
        method: "PUT",
        body: JSON.stringify({ api_key: keyInput.trim() }),
      });
      toast.success("Org API key saved");
      setEditing(null); setKeyInput("");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function removeKey(slug: string) {
    if (!window.confirm("Remove this organization's provider key?")) return;
    try {
      await api(`/v1/admin/org/provider-keys/${slug}`, { method: "DELETE" });
      toast.success("Key removed");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-medium">Organization providers</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          When Admin → Providers (or env) already has a Groq/OpenAI/… key, this org is{" "}
          <strong>auto-connected</strong> (On + Use platform key). You only need to paste a key here
          if this company should use its <em>own</em> vendor credentials instead.
        </p>
      </div>
      <Card className="p-5">
        {!rows ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Provider</th>
                <th className="py-2 pr-3 font-normal">Enabled</th>
                <th className="py-2 pr-3 font-normal">Use platform key</th>
                <th className="py-2 pr-3 font-normal">Org key</th>
                <th className="py-2 pr-3 font-normal">Status</th>
                <th className="py-2 font-normal"></th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.slug} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{r.name} <span className="text-muted-foreground">({r.slug})</span></td>
                    <td className="py-2 pr-3">
                      <Button variant="outline" onClick={() => toggle(r.slug, !r.enabled)}>
                        {r.enabled ? "On" : "Off"}
                      </Button>
                    </td>
                    <td className="py-2 pr-3">
                      {r.needs_key ? (
                        r.platform_key_available ? (
                          <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={r.use_platform_key}
                              onChange={(e) => togglePlatformKey(r.slug, e.target.checked)}
                            />
                            Use platform key
                          </label>
                        ) : (
                          <span className="text-xs text-muted-foreground">No platform key</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">n/a</span>
                      )}
                    </td>
                    <td className="py-2 pr-3"><code className="mono text-xs">{r.has_key ? (r.masked_key ?? "••••") : "—"}</code></td>
                    <td className="py-2 pr-3">
                      <Badge tone={r.usable ? "good" : "bad"}>{r.usable ? "ready" : "not ready"}</Badge>
                    </td>
                    <td className="py-2 text-right">
                      {r.needs_key && (
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => { setEditing(r.slug); setKeyInput(""); }}>
                            {r.has_key ? "Update key" : "Set key"}
                          </Button>
                          {r.has_key && (
                            <Button variant="danger" onClick={() => removeKey(r.slug)}>Remove</Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`API key for ${editing}`}>
        <div className="mb-3">
          <Label>API key</Label>
          <Input type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
        </div>
        <Button className="w-full" onClick={saveKey}>Save key</Button>
      </Modal>
    </div>
  );
}

/* ───────────── Provider keys ───────────── */
type ProviderKeyRow = {
  provider: string;
  source: "dashboard" | "env" | "none";
  masked: string | null;
  updated_at: string | null;
};
type RegistryProvider = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  base_url: string | null;
  is_builtin: boolean;
  is_active: boolean;
};
const PROVIDER_LABELS: Record<string, string> = {
  ollama: "OpenInference (self-hosted)",
  openai: "OpenAI", anthropic: "Anthropic", groq: "Groq",
  mistral: "Mistral", cerebras: "Cerebras", gemini: "Gemini",
};
const PROVIDER_KEY_HINTS: Record<string, string> = {
  openai: "sk-…", anthropic: "sk-ant-…", groq: "gsk_…",
  mistral: "…", cerebras: "csk-…", gemini: "AIza…",
};

function ProvidersPanel() {
  const [rows, setRows] = useState<ProviderKeyRow[] | null>(null);
  const [registry, setRegistry] = useState<RegistryProvider[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const load = () => {
    api<{ data: ProviderKeyRow[] }>("/v1/admin/provider-keys").then((r) => setRows(r.data)).catch((e) => toast.error(e.message));
    api<{ data: RegistryProvider[] }>("/v1/admin/providers").then((r) => setRegistry(r.data)).catch((e) => toast.error(e.message));
  };
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    if (keyInput.trim().length < 8) return toast.error("Key looks too short");
    try {
      await api(`/v1/admin/provider-keys/${editing}`, { method: "PUT", body: JSON.stringify({ api_key: keyInput.trim() }) });
      toast.success(`${PROVIDER_LABELS[editing] ?? editing} key saved`);
      setEditing(null); setKeyInput("");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function removeOverride(provider: string) {
    if (!window.confirm("Remove the dashboard key? The gateway falls back to the env var (if set).")) return;
    try { await api(`/v1/admin/provider-keys/${provider}`, { method: "DELETE" }); toast.success("Dashboard key removed"); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  async function addCustom() {
    if (!newSlug.trim() || !newName.trim() || !newUrl.trim()) return toast.error("Slug, name, and base URL required");
    try {
      await api("/v1/admin/providers", {
        method: "POST",
        body: JSON.stringify({ slug: newSlug.trim(), name: newName.trim(), kind: "openai_compat", base_url: newUrl.trim() }),
      });
      toast.success("Custom provider registered");
      setNewSlug(""); setNewName(""); setNewUrl("");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function toggleActive(slug: string, is_active: boolean) {
    try {
      await api(`/v1/admin/providers/${slug}`, { method: "PATCH", body: JSON.stringify({ is_active }) });
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-medium">Platform provider registry</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Built-in and custom OpenAI-compatible endpoints. Orgs turn them on under{" "}
          <strong>Org Providers</strong> (and can tick “Use platform key” instead of pasting).
          Keys in the table below are gateway defaults for that checkbox / workers.
        </p>
      </div>

      <Card className="mb-6 p-5">
        <h4 className="mb-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">Registry</h4>
        {!registry ? <Loading /> : (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Name</th>
                <th className="py-2 pr-3 font-normal">Slug</th>
                <th className="py-2 pr-3 font-normal">Kind</th>
                <th className="py-2 pr-3 font-normal">Base URL</th>
                <th className="py-2 font-normal">Active</th>
              </tr></thead>
              <tbody>
                {registry.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{p.name}{p.is_builtin ? " · builtin" : ""}</td>
                    <td className="py-2 pr-3 mono text-xs">{p.slug}</td>
                    <td className="py-2 pr-3">{p.kind}</td>
                    <td className="py-2 pr-3 max-w-xs truncate text-xs text-muted-foreground">{p.base_url ?? "—"}</td>
                    <td className="py-2">
                      <Button variant="outline" onClick={() => toggleActive(p.slug, !p.is_active)}>
                        {p.is_active ? "On" : "Off"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          <div><Label>Slug</Label><Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="together" /></div>
          <div><Label>Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Together AI" /></div>
          <div><Label>Base URL</Label><Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://api.together.xyz/v1" /></div>
        </div>
        <Button className="mt-3" onClick={addCustom}>Register OpenAI-compat provider</Button>
      </Card>

      <Card className="p-5">
        <h4 className="mb-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">Gateway default keys</h4>
        {!rows ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Provider</th><th className="py-2 pr-3 font-normal">Key</th>
                <th className="py-2 pr-3 font-normal">Source</th><th className="py-2 pr-3 font-normal">Updated</th><th className="py-2 font-normal"></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.provider} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{PROVIDER_LABELS[r.provider] ?? r.provider}</td>
                    <td className="py-2 pr-3"><code className="mono text-xs">{r.masked ?? "—"}</code></td>
                    <td className="py-2 pr-3">
                      <Badge tone={r.source === "none" ? "bad" : "good"}>
                        {r.source === "dashboard" ? "dashboard" : r.source === "env" ? "env var" : "not set"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.updated_at ? fmtDate(r.updated_at) : "—"}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { setEditing(r.provider); setKeyInput(""); }}>
                          {r.source === "dashboard" ? "Update" : "Set key"}
                        </Button>
                        {r.source === "dashboard" && (
                          <Button variant="danger" onClick={() => removeOverride(r.provider)}>Remove</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`${PROVIDER_LABELS[editing ?? ""] ?? editing} API key`}>
        <div className="mb-3">
          <Label>API key</Label>
          <Input type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
            placeholder={PROVIDER_KEY_HINTS[editing ?? ""] ?? ""} />
        </div>
        <p className="mb-5 text-xs text-muted-foreground">
          Shared default credentials — used when an org ticks “Use platform key”, and by background workers.
        </p>
        <Button className="w-full" onClick={save}>Save key</Button>
      </Modal>
    </div>
  );
}

/* ───────────── Tenants ───────────── */
type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
  active_keys: number;
  month_requests: number;
  month_spend_usd: string | number;
};
const PLAN_TIERS: Record<string, string> = {
  free: "small models only",
  pro: "small + standard",
  enterprise: "all models",
};

function TenantsPanel() {
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [platformBudget, setPlatformBudget] = useState<BudgetStatus | null | undefined>(undefined);
  const [budgetInput, setBudgetInput] = useState("");

  const load = () =>
    api<{ data: TenantRow[]; plans: string[] }>("/v1/admin/tenants")
      .then((r) => { setRows(r.data); setPlans(r.plans); })
      .catch((e) => toast.error(e.message));
  const loadBudget = () =>
    api<BudgetStatus>("/v1/admin/platform-budget")
      .then((r) => {
        setPlatformBudget(r ?? null);
        if (r) setBudgetInput(String(r.monthly_budget_usd));
      })
      .catch(() => setPlatformBudget(null));
  useEffect(() => { load(); loadBudget(); }, []);

  async function savePlatformBudget() {
    const n = Number(budgetInput);
    if (!Number.isFinite(n) || n <= 0) return toast.error("Enter a positive USD amount");
    try {
      const status = await api<BudgetStatus>("/v1/admin/platform-budget", {
        method: "PUT",
        body: JSON.stringify({ monthly_budget_usd: n }),
      });
      setPlatformBudget(status);
      toast.success("Platform monthly budget saved");
    } catch (e: any) { toast.error(e.message); }
  }

  async function changePlan(tenant: TenantRow, plan: string) {
    if (plan === tenant.plan) return;
    if (!window.confirm(`Move "${tenant.name}" from ${tenant.plan} to ${plan}? This changes which model tiers its API keys can call, effective immediately.`)) return;
    setSaving(tenant.id);
    try {
      await api(`/v1/admin/tenants/${tenant.id}/plan`, { method: "PUT", body: JSON.stringify({ plan }) });
      toast.success(`${tenant.name} is now on ${plan}`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-medium">Tenants</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Every workspace on this gateway. The plan decides which model tiers a tenant's API keys may
          call — free: {PLAN_TIERS.free}, pro: {PLAN_TIERS.pro}, enterprise: {PLAN_TIERS.enterprise}.
          Changes apply to the tenant's next request.
        </p>
      </div>

      <Card className="mb-6 p-5">
        <h4 className="mb-2 text-sm font-medium">Platform monthly budget</h4>
        <p className="mb-3 text-xs text-muted-foreground">
          Hard cap across all orgs (checked before tenant/key budgets). Leave unset for no platform cap.
        </p>
        {platformBudget === undefined ? <Loading /> : (
          <>
            {platformBudget && (
              <p className="mb-3 text-xs">
                Spent {usd(platformBudget.spent_usd)} / {usd(platformBudget.monthly_budget_usd)}
                {" · "}remaining {usd(platformBudget.remaining_usd)}
                {platformBudget.exceeded && <Badge tone="bad">exceeded</Badge>}
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label>Monthly budget (USD)</Label>
                <Input value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder="500" />
              </div>
              <Button onClick={savePlatformBudget}>Save platform budget</Button>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5">
        {!rows ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Tenant</th><th className="py-2 pr-3 font-normal">Plan</th>
                <th className="py-2 pr-3 font-normal">Keys</th><th className="py-2 pr-3 font-normal">Requests (mo)</th>
                <th className="py-2 pr-3 font-normal">Spend (mo)</th><th className="py-2 font-normal">Created</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      <div>{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <Select value={t.plan} disabled={saving === t.id}
                        onChange={(e) => changePlan(t, e.target.value)} title={PLAN_TIERS[t.plan]}>
                        {(plans.length ? plans : [t.plan]).map((p) => <option key={p} value={p}>{p}</option>)}
                      </Select>
                    </td>
                    <td className="py-2 pr-3">{t.active_keys}</td>
                    <td className="py-2 pr-3">{fmtNum(t.month_requests)}</td>
                    <td className="py-2 pr-3">{usd(t.month_spend_usd)}</td>
                    <td className="py-2 text-muted-foreground">{fmtDate(t.created_at)}</td>
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
  const [file, setFile] = useState<File | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api<{ data: DocRow[] }>("/v1/documents").then((r) => setDocs(r.data)).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  async function upload() {
    if (!pasteMode && !file) return toast.error("Choose a .txt, .md, or .pdf file from your computer");
    if (pasteMode && !title.trim()) return toast.error("Title required");
    if (pasteMode && !content.trim()) return toast.error("Content required");
    setBusy(true);
    try {
      if (pasteMode) {
        await api("/v1/documents", {
          method: "POST",
          body: JSON.stringify({ title: title.trim(), content: content.trim() }),
        });
      } else {
        const form = new FormData();
        if (title.trim()) form.append("title", title.trim());
        form.append("file", file!);
        await apiUpload("/v1/documents/upload", form);
      }
      toast.success("Document queued for ingestion");
      setUploading(false); setTitle(""); setContent(""); setFile(null); setPasteMode(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
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
        <div>
          <h3 className="text-sm font-medium">Knowledge base</h3>
          <p className="mt-1 text-xs text-muted-foreground">Org-scoped documents for this company only.</p>
        </div>
        <Button onClick={() => setUploading(true)}><Plus className="h-3 w-3" /> Upload</Button>
      </div>
      <Card className="p-5">
        {!docs ? <Loading /> : docs.length === 0 ? <Empty text="No documents yet. Upload a file to enable RAG retrieval." /> : (
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
        <div className="mb-3"><Label>Title (optional)</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Company handbook" /></div>
        {!pasteMode ? (
          <div className="mb-3">
            <Label>File (.txt, .md, .pdf)</Label>
            <input type="file" accept=".txt,.md,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
          </div>
        ) : (
          <div className="mb-3">
            <Label>Content</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="Paste document text here…"
              className="w-full border border-border bg-surface px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-flame-red"
            />
          </div>
        )}
        <button type="button" className="mb-4 text-xs text-muted-foreground underline" onClick={() => setPasteMode((v) => !v)}>
          {pasteMode ? "Use file upload instead" : "Or paste text instead"}
        </button>
        <Button className="w-full" onClick={upload} disabled={busy}>{busy ? "Uploading…" : "Upload & ingest"}</Button>
      </Modal>
    </div>
  );
}

/* ───────────── shared ───────────── */
function Loading() { return <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>; }
function Empty({ text = "Nothing here yet." }: { text?: string }) { return <div className="py-6 text-center text-sm text-muted-foreground">{text}</div>; }
