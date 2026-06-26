import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { PageHeader } from "@/components/marketing/shared";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type McpServer = {
  id: string;
  name: string;
  url: string;
  description: string | null;
  auth_type: "none" | "bearer" | "api_key";
  is_active: boolean;
  policy_count: number;
  call_count: number;
  created_at: string;
};

type Policy = {
  id: string;
  tool_pattern: string;
  action: "allow" | "deny";
  rate_limit: number | null;
  created_at: string;
};

type CallLog = {
  id: string;
  server_id: string;
  server_name: string;
  tool_name: string;
  status: string;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
};

// ── Page ───────────────────────────────────────────────────────────────────────

export function Mcp() {
  const { user, loading, setUser } = useAuth();
  if (loading) return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>;
  if (!user)   return <AuthScreen onAuthed={(u) => setUser(u)} />;
  return <McpPage />;
}

function McpPage() {
  const [tab, setTab] = useState<"servers" | "logs">("servers");
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [selected, setSelected] = useState<McpServer | null>(null);

  const loadServers = () =>
    api<{ data: McpServer[] }>("/v1/admin/mcp-servers")
      .then((r) => setServers(r.data))
      .catch((e) => toast.error(e.message));

  useEffect(() => { loadServers(); }, []);

  function onCreated(s: McpServer) {
    setServers((prev) => prev ? [s, ...prev] : [s]);
    setSelected(s);
  }

  function onDeleted(id: string) {
    setServers((prev) => prev?.filter((s) => s.id !== id) ?? null);
    if (selected?.id === id) setSelected(null);
  }

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Integrations"
        title="MCP Traffic Governance"
        description="Register Model Context Protocol servers, set allow/deny policies per tool, rate-limit calls, and audit all traffic."
      />

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["servers", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "cursor-pointer px-6 py-3 text-xs uppercase tracking-[0.15em] transition",
              tab === t ? "border-b-2 border-ink font-medium text-ink" : "text-muted-foreground hover:text-ink"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "servers" && (
        <div className="flex min-h-[calc(100vh-220px)]">
          {/* Server list */}
          <aside className="w-72 shrink-0 border-r border-border">
            <div className="border-b border-border px-4 py-3">
              <RegisterServerForm onCreated={onCreated} />
            </div>
            {!servers ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
            ) : servers.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">No servers yet. Register one above.</div>
            ) : (
              <ul>
                {servers.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelected(s)}
                      className={cn(
                        "flex w-full cursor-pointer flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition hover:bg-surface",
                        selected?.id === s.id && "bg-surface"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{s.name}</span>
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", s.is_active ? "bg-good" : "bg-muted-foreground")} />
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>{s.policy_count} polic{s.policy_count !== 1 ? "ies" : "y"}</span>
                        <span>{s.call_count} calls/mo</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* Server detail */}
          <main className="flex-1 min-w-0">
            {selected ? (
              <ServerDetail server={selected} onDeleted={() => onDeleted(selected.id)} onToggled={(s) => {
                setServers((prev) => prev?.map((x) => x.id === s.id ? { ...x, is_active: s.is_active } : x) ?? null);
                setSelected((x) => x ? { ...x, is_active: s.is_active } : x);
              }} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a server to manage its policies.
              </div>
            )}
          </main>
        </div>
      )}

      {tab === "logs" && <LogsTab servers={servers ?? []} />}
    </div>
  );
}

// ── Register server form ───────────────────────────────────────────────────────

function RegisterServerForm({ onCreated }: { onCreated: (s: McpServer) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState("none");
  const [authHeader, setAuthHeader] = useState("");
  const [authValue, setAuthValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return toast.error("Name and URL are required");
    setSaving(true);
    try {
      const s = await api<McpServer>("/v1/admin/mcp-servers", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(), url: url.trim(), auth_type: authType,
          auth_header: authHeader.trim() || null,
          auth_value: authValue.trim() || null,
        }),
      });
      onCreated({ ...s, policy_count: 0, call_count: 0 });
      setName(""); setUrl(""); setAuthType("none"); setAuthHeader(""); setAuthValue(""); setOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full text-[10px]">+ Register server</Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My MCP server" className="text-xs" />
      </div>
      <div>
        <Label>URL</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com" className="text-xs" />
      </div>
      <div>
        <Label>Auth</Label>
        <Select value={authType} onChange={(e) => setAuthType(e.target.value)} className="w-full text-xs py-1.5 mb-2">
          <option value="none">None</option>
          <option value="bearer">Bearer token</option>
          <option value="api_key">API key header</option>
        </Select>
        {authType === "api_key" && (
          <Input value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} placeholder="Header name, e.g. X-Api-Key" className="text-xs mb-1" />
        )}
        {authType !== "none" && (
          <Input value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder="Secret value" type="password" className="text-xs" />
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1 text-[10px]">{saving ? "Saving…" : "Register"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-[10px]">Cancel</Button>
      </div>
    </form>
  );
}

// ── Server detail ──────────────────────────────────────────────────────────────

function ServerDetail({
  server,
  onDeleted,
  onToggled,
}: {
  server: McpServer;
  onDeleted: () => void;
  onToggled: (s: { id: string; is_active: boolean }) => void;
}) {
  const [policies, setPolicies] = useState<Policy[] | null>(null);

  useEffect(() => {
    api<{ data: Policy[] }>(`/v1/admin/mcp-servers/${server.id}/policies`)
      .then((r) => setPolicies(r.data))
      .catch((e) => toast.error(e.message));
  }, [server.id]);

  async function toggle() {
    try {
      await api(`/v1/admin/mcp-servers/${server.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !server.is_active }),
      });
      onToggled({ id: server.id, is_active: !server.is_active });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function deleteServer() {
    if (!confirm(`Delete "${server.name}"?`)) return;
    try {
      await api(`/v1/admin/mcp-servers/${server.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function onPolicyCreated(p: Policy) {
    setPolicies((prev) => prev ? [...prev, p] : [p]);
  }

  async function deletePolicy(id: string) {
    try {
      await api(`/v1/admin/mcp-servers/${server.id}/policies/${id}`, { method: "DELETE" });
      setPolicies((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">{server.name}</h2>
          <a href={server.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-ink transition mt-0.5">
            {server.url} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggle}
            className={cn(
              "cursor-pointer border px-3 py-1 text-[10px] uppercase tracking-[0.15em] transition",
              server.is_active
                ? "border-good text-good hover:bg-good/10"
                : "border-border text-muted-foreground hover:border-ink hover:text-ink"
            )}
          >
            {server.is_active ? "Active" : "Disabled"}
          </button>
          <button onClick={deleteServer} className="cursor-pointer text-muted-foreground hover:text-bad transition">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Policies */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Tool policies</div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Rules are evaluated in order — the last matching rule wins. Default: <strong>allow all</strong>.
      </p>

      <AddPolicyForm serverId={server.id} onCreated={onPolicyCreated} />

      {!policies ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
      ) : policies.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No policies — all tool calls are allowed.</div>
      ) : (
        <div className="mt-3 flex flex-col gap-px bg-border">
          {policies.map((p) => (
            <div key={p.id} className="flex items-center gap-3 bg-cream px-4 py-3">
              <code className="flex-1 font-mono text-sm">{p.tool_pattern}</code>
              <Badge tone={p.action === "allow" ? "good" : "bad"}>{p.action}</Badge>
              {p.rate_limit && (
                <span className="text-[10px] text-muted-foreground">{p.rate_limit}/min</span>
              )}
              <button onClick={() => deletePolicy(p.id)} className="cursor-pointer text-muted-foreground hover:text-bad transition">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Test call */}
      <div className="mt-8">
        <TestCallForm serverId={server.id} />
      </div>
    </div>
  );
}

// ── Add policy form ────────────────────────────────────────────────────────────

function AddPolicyForm({ serverId, onCreated }: { serverId: string; onCreated: (p: Policy) => void }) {
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState("allow");
  const [rateLimit, setRateLimit] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim()) return toast.error("Pattern is required");
    setSaving(true);
    try {
      const p = await api<Policy>(`/v1/admin/mcp-servers/${serverId}/policies`, {
        method: "POST",
        body: JSON.stringify({
          tool_pattern: pattern.trim(),
          action,
          rate_limit: rateLimit ? parseInt(rateLimit) : null,
        }),
      });
      onCreated(p);
      setPattern(""); setAction("allow"); setRateLimit("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-2 flex gap-2 items-end">
      <div className="flex-1">
        <Label>Tool pattern</Label>
        <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="search  or  search_*  or  *" className="font-mono text-xs" />
      </div>
      <div className="w-24">
        <Label>Action</Label>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-full text-xs py-1.5">
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
        </Select>
      </div>
      <div className="w-24">
        <Label>Rate/min</Label>
        <Input value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} type="number" min="1" placeholder="∞" className="text-xs" />
      </div>
      <Button type="submit" disabled={saving} className="shrink-0">{saving ? "…" : "Add"}</Button>
    </form>
  );
}

// ── Test call form ─────────────────────────────────────────────────────────────

function TestCallForm({ serverId }: { serverId: string }) {
  const [toolName, setToolName] = useState("");
  const [inputJson, setInputJson] = useState("{}");
  const [result, setResult] = useState<{ output?: string; error?: string; latency_ms?: number } | null>(null);
  const [calling, setCalling] = useState(false);

  async function call(e: React.FormEvent) {
    e.preventDefault();
    if (!toolName.trim()) return toast.error("Tool name is required");
    let input: Record<string, unknown>;
    try { input = JSON.parse(inputJson); } catch { return toast.error("Input must be valid JSON"); }
    setCalling(true); setResult(null);
    try {
      const res = await api<{ output: string; latency_ms: number }>("/v1/mcp/call", {
        method: "POST",
        body: JSON.stringify({ server_id: serverId, tool_name: toolName.trim(), input }),
      });
      setResult({ output: res.output, latency_ms: res.latency_ms });
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setCalling(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Test a tool call</div>
      <form onSubmit={call} className="space-y-3">
        <div>
          <Label>Tool name</Label>
          <Input value={toolName} onChange={(e) => setToolName(e.target.value)} placeholder="search" className="font-mono text-xs" />
        </div>
        <div>
          <Label>Input (JSON)</Label>
          <Textarea value={inputJson} onChange={(e) => setInputJson(e.target.value)} rows={3} className="font-mono text-xs" />
        </div>
        <Button type="submit" disabled={calling}>{calling ? "Calling…" : "Call tool"}</Button>
      </form>

      {result && (
        <div className="mt-4 border-t border-border pt-4">
          {result.error ? (
            <div className="text-xs text-bad">{result.error}</div>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Output</div>
                {result.latency_ms && <span className="text-[10px] text-muted-foreground">{result.latency_ms}ms</span>}
              </div>
              <pre className="rounded bg-cream px-3 py-2 font-mono text-xs text-ink/80 whitespace-pre-wrap overflow-x-auto max-h-40">
                {result.output}
              </pre>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Logs tab ───────────────────────────────────────────────────────────────────

function LogsTab({ servers }: { servers: McpServer[] }) {
  const [logs, setLogs] = useState<CallLog[] | null>(null);
  const [serverFilter, setServerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ limit: "200" });
    if (serverFilter) params.set("server_id", serverFilter);
    if (statusFilter) params.set("status", statusFilter);
    api<{ data: CallLog[] }>(`/v1/admin/mcp-logs?${params}`)
      .then((r) => setLogs(r.data))
      .catch((e) => toast.error(e.message));
  }, [serverFilter, statusFilter]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 md:px-10">
      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <Select value={serverFilter} onChange={(e) => setServerFilter(e.target.value)} className="text-xs py-1.5">
          <option value="">All servers</option>
          {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs py-1.5">
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="denied">Denied</option>
        </Select>
        <span className="ml-auto text-[10px] text-muted-foreground">{logs?.length ?? "…"} entries</span>
      </div>

      {!logs ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No MCP calls logged yet.</div>
      ) : (
        <div className="flex flex-col gap-px bg-border">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 bg-cream px-4 py-3">
              <Badge tone={l.status === "success" ? "good" : l.status === "denied" ? "flame" : "bad"}>
                {l.status}
              </Badge>
              <span className="font-mono text-xs w-40 shrink-0 truncate">{l.tool_name}</span>
              <span className="text-xs text-muted-foreground">{l.server_name}</span>
              {l.latency_ms != null && (
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{l.latency_ms}ms</span>
              )}
              <span className="text-[10px] text-muted-foreground shrink-0">
                {new Date(l.created_at).toLocaleTimeString()}
              </span>
              {l.error && (
                <span className="truncate text-[10px] text-bad max-w-[200px]" title={l.error}>{l.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
