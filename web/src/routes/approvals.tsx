import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { PageHeader } from "@/components/marketing/shared";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Approval = {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  tool_name: string;
  tool_input: Record<string, unknown>;
  goal: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  reviewer_note: string | null;
  expires_at: string;
  created_at: string;
  resolved_at: string | null;
};

type Policy = {
  id: string;
  tool_pattern: string;
  require_approval: boolean;
  notif_webhook: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: "bg-flame-red/10 border-flame-red/30",  text: "text-flame-red",      label: "Pending" },
  approved: { bg: "bg-good/10 border-good/30",            text: "text-good",           label: "Approved" },
  rejected: { bg: "bg-bad/10 border-bad/30",              text: "text-bad",            label: "Rejected" },
  expired:  { bg: "bg-muted/10 border-border",            text: "text-muted-foreground", label: "Expired" },
};

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function Approvals() {
  const { user, loading, setUser } = useAuth();
  if (loading) return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>;
  if (!user)   return <AuthScreen onAuthed={(u) => setUser(u)} />;
  return <ApprovalsPage />;
}

function ApprovalsPage() {
  const [tab, setTab] = useState<"inbox" | "history" | "policies">("inbox");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api<{ total: number }>("/v1/admin/approvals?status=pending&limit=1")
      .then((r) => setPendingCount(r.total))
      .catch(() => {});
  }, []);

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Governance"
        title="Human approvals"
        description="Review and approve or reject agent tool calls that match your approval policies before they execute."
      />

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          { key: "inbox",    label: `Inbox${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
          { key: "history",  label: "History" },
          { key: "policies", label: "Policies" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-6 py-3 text-xs uppercase tracking-[0.15em] transition cursor-pointer",
              tab === t.key
                ? "border-b-2 border-ink font-medium text-ink"
                : "text-muted-foreground hover:text-ink",
              t.key === "inbox" && pendingCount > 0 && tab !== "inbox" && "text-flame-red"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "inbox"    && <InboxTab onResolved={() => setPendingCount((n) => Math.max(0, n - 1))} />}
      {tab === "history"  && <HistoryTab />}
      {tab === "policies" && <PoliciesTab />}
    </div>
  );
}

// ── Inbox (pending only) ───────────────────────────────────────────────────────

function InboxTab({ onResolved }: { onResolved: () => void }) {
  const [approvals, setApprovals] = useState<Approval[] | null>(null);

  const load = () =>
    api<{ data: Approval[] }>("/v1/admin/approvals?status=pending&limit=50")
      .then((r) => setApprovals(r.data))
      .catch((e) => toast.error(e.message));

  useEffect(() => { load(); }, []);

  function onAction(id: string) {
    setApprovals((prev) => prev?.filter((a) => a.id !== id) ?? null);
    onResolved();
  }

  if (!approvals) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Inbox zero</div>
        <p className="max-w-xs text-sm text-muted-foreground">No pending approvals. Tool calls are flowing freely.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 md:px-10">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {approvals.length} pending
        </span>
        <button onClick={load} className="cursor-pointer text-[11px] text-muted-foreground hover:text-ink transition">↻ Refresh</button>
      </div>
      <div className="flex flex-col gap-3">
        {approvals.map((a) => (
          <ApprovalCard key={a.id} approval={a} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({ approval: a, onAction }: { approval: Approval; onAction: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (action === "reject" && !note.trim()) return toast.error("Reason is required for rejection");
    setSubmitting(true);
    try {
      await api(`/v1/admin/approvals/${a.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "approve" ? { note: note.trim() || undefined } : { reason: note.trim() }),
      });
      toast.success(action === "approve" ? "Approved" : "Rejected");
      onAction(a.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left hover:bg-surface transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="flame">{a.tool_name}</Badge>
            {a.agent_name && <span className="text-[10px] text-muted-foreground">via {a.agent_name}</span>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{a.goal ?? "Ad-hoc run"}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-muted-foreground">{relativeAge(a.created_at)}</div>
          <div className="text-[10px] text-muted-foreground">expires {relativeAge(a.expires_at)}</div>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-border bg-surface px-5 py-4">
          {/* Tool input */}
          <div className="mb-4">
            <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Tool input</div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-cream px-3 py-2 font-mono text-xs text-ink/80">
              {JSON.stringify(a.tool_input, null, 2)}
            </pre>
          </div>

          {/* Goal */}
          {a.goal && (
            <div className="mb-4">
              <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Agent goal</div>
              <p className="text-sm text-ink/80">{a.goal}</p>
            </div>
          )}

          {/* Action buttons */}
          {action === null ? (
            <div className="flex gap-2">
              <Button onClick={() => setAction("approve")}>Approve</Button>
              <Button variant="danger" onClick={() => setAction("reject")}>Reject</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <Label>{action === "approve" ? "Note (optional)" : "Reason (required)"}</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={action === "approve" ? "Add a note…" : "Why are you rejecting this?"}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={action === "approve" ? "solid" : "danger"}
                  onClick={submit}
                  disabled={submitting}
                >
                  {submitting ? "Submitting…" : action === "approve" ? "Confirm approval" : "Confirm rejection"}
                </Button>
                <Button variant="ghost" onClick={() => { setAction(null); setNote(""); }} disabled={submitting}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── History tab ────────────────────────────────────────────────────────────────

function HistoryTab() {
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api<{ data: Approval[] }>(`/v1/admin/approvals?status=${filter}&limit=100`)
      .then((r) => setApprovals(r.data))
      .catch((e) => toast.error(e.message));
  }, [filter]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 md:px-10">
      <div className="mb-4 flex items-center gap-2">
        {(["all", "pending", "approved", "rejected", "expired"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "cursor-pointer border px-3 py-1 text-[10px] uppercase tracking-[0.15em] transition",
              filter === s ? "border-ink bg-ink text-cream" : "border-border text-muted-foreground hover:border-ink hover:text-ink"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {!approvals ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : approvals.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No approvals found.</div>
      ) : (
        <div className="flex flex-col gap-px bg-border">
          {approvals.map((a) => {
            const s = STATUS_STYLE[a.status] ?? STATUS_STYLE.expired!;
            return (
              <div key={a.id} className="bg-cream px-4 py-3">
                <div className="flex items-center gap-3">
                  <Badge tone={a.status === "approved" ? "default" : a.status === "rejected" ? "bad" : "flame"}>
                    {s.label}
                  </Badge>
                  <span className="font-mono text-xs">{a.tool_name}</span>
                  {a.agent_name && <span className="text-[10px] text-muted-foreground">· {a.agent_name}</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground">{relativeAge(a.created_at)}</span>
                </div>
                {a.goal && <p className="mt-1 truncate text-[11px] text-muted-foreground">{a.goal}</p>}
                {a.reviewer_note && (
                  <p className="mt-1 text-[11px] italic text-muted-foreground">"{a.reviewer_note}"</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Policies tab ───────────────────────────────────────────────────────────────

function PoliciesTab() {
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [pattern, setPattern] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    api<{ data: Policy[] }>("/v1/admin/approval-policies")
      .then((r) => setPolicies(r.data))
      .catch((e) => toast.error(e.message));

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim()) return toast.error("Pattern is required");
    setSaving(true);
    try {
      const p = await api<Policy>("/v1/admin/approval-policies", {
        method: "POST",
        body: JSON.stringify({ tool_pattern: pattern.trim(), require_approval: true }),
      });
      setPolicies((prev) => (prev ? [p, ...prev] : [p]));
      setPattern("");
      toast.success("Policy created");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/v1/admin/approval-policies/${id}`, { method: "DELETE" });
      setPolicies((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6 md:px-10">
      <p className="mb-6 text-sm text-muted-foreground">
        When an agent attempts to call a tool matching a policy pattern, execution pauses and an approval request appears in the Inbox.
        Patterns support exact names (<code className="font-mono text-xs">retrieve_documents</code>) or glob suffixes (<code className="font-mono text-xs">retrieve_*</code>, <code className="font-mono text-xs">*</code>).
      </p>

      {/* Create form */}
      <Card className="mb-6 p-5">
        <form onSubmit={create} className="flex items-end gap-3">
          <div className="flex-1">
            <Label>Tool pattern</Label>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="retrieve_documents  or  retrieve_*  or  *"
              className="font-mono"
            />
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add policy"}</Button>
        </form>
      </Card>

      {!policies ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : policies.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No approval policies yet. All tool calls execute without review.
        </div>
      ) : (
        <div className="flex flex-col gap-px bg-border">
          {policies.map((p) => (
            <div key={p.id} className="flex items-center gap-3 bg-cream px-4 py-3">
              <code className="flex-1 font-mono text-sm">{p.tool_pattern}</code>
              <Badge tone={p.require_approval ? "bad" : "default"}>
                {p.require_approval ? "requires approval" : "allowed"}
              </Badge>
              <button
                onClick={() => remove(p.id)}
                className="cursor-pointer text-muted-foreground transition hover:text-bad"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
