import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type RequestRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtTime } from "@/lib/utils";
import { Badge, Button, Card, Select } from "@/components/ui/primitives";
import { AuthScreen } from "@/components/AuthScreen";
import { PageHeader } from "@/components/marketing/shared";

type TraceSpan = {
  id: string;
  trace_id: string;
  parent_id: string | null;
  request_id: string | null;
  name: string;
  kind: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  status: string;
  status_msg: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
};

type TraceDetail = {
  trace_id: string;
  requests: RequestRow[];
  spans: TraceSpan[];
};

const usd = (v: unknown) => "$" + Number(v || 0).toFixed(4);

export function Traces() {
  const { user, loading, setUser } = useAuth();
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const loadRequests = () => {
    const q = statusFilter ? `&status=${statusFilter}` : "";
    api<{ data: RequestRow[] }>(`/v1/requests?limit=50${q}`)
      .then((r) => setRequests(r.data))
      .catch((e) => toast.error(e.message));
  };

  useEffect(() => {
    if (user) loadRequests();
  }, [user, statusFilter]);

  async function selectRequest(req: RequestRow) {
    if (selectedId === req.id) return;
    setSelectedId(req.id);
    if (!req.trace_id) return;
    setTraceLoading(true);
    setTraceDetail(null);
    try {
      const d = await api<TraceDetail>(`/v1/traces/${req.trace_id}`);
      setTraceDetail(d);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTraceLoading(false);
    }
  }

  if (loading) {
    return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>;
  }
  if (!user) {
    return <AuthScreen onAuthed={(u) => setUser(u)} />;
  }

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Observability"
        title="Traces & Requests"
        description="Every request produces an OTel-style trace. Click a row to drill into its spans — auth, guardrails, retrieval, LLM call — with timing and cost at each stage."
      />

      {/* Split layout */}
      <div className="flex flex-col lg:flex-row" style={{ minHeight: "calc(100vh - 220px)" }}>
        {/* Request list — left panel */}
        <div className="flex flex-col border-b border-border lg:w-[42%] lg:border-b-0 lg:border-r">
          {/* Filter bar */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {requests ? `${requests.length} requests` : "Loading…"}
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1 px-2 text-[11px]"
              >
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
                <option value="filtered">Filtered</option>
                <option value="pending">Pending</option>
              </Select>
              <button
                onClick={loadRequests}
                className="cursor-pointer text-[11px] text-muted-foreground transition hover:text-ink"
                title="Refresh"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {!requests ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : requests.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No requests yet.</div>
            ) : (
              requests.map((r) => {
                const active = selectedId === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => selectRequest(r)}
                    className={`w-full cursor-pointer border-b border-border px-4 py-3 text-left transition ${
                      active ? "bg-ink text-cream" : "hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`shrink-0 text-[10px] uppercase tracking-[0.1em] ${
                            r.status === "success"
                              ? active ? "text-good/70" : "text-good"
                              : r.status === "filtered"
                              ? "text-flame-red"
                              : "text-bad"
                          }`}
                        >
                          {r.status}
                        </span>
                        <span className="truncate text-xs">{r.routed_provider}/{r.routed_model}</span>
                      </div>
                      <span className={`shrink-0 tabular-nums text-[10px] ${active ? "text-cream/50" : "text-muted-foreground"}`}>
                        {r.latency_ms != null ? `${r.latency_ms}ms` : "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className={`font-mono text-[10px] ${active ? "text-cream/40" : "text-muted-foreground"}`}>
                        {r.trace_id?.slice(0, 8)}…
                      </span>
                      <span className={`text-[10px] ${active ? "text-cream/40" : "text-muted-foreground"}`}>
                        {fmtTime(r.created_at)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Trace detail — right panel */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          {traceLoading ? (
            <div className="flex h-full items-center justify-center py-20 text-sm text-muted-foreground">
              Loading trace…
            </div>
          ) : !traceDetail ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">No trace selected</div>
              <p className="max-w-xs text-sm text-muted-foreground">
                Click any request row to see its full trace — spans, timing, cost, and guardrail events.
              </p>
            </div>
          ) : (
            <TraceView detail={traceDetail} />
          )}
        </div>
      </div>
    </div>
  );
}

function TraceView({ detail }: { detail: TraceDetail }) {
  const req = detail.requests[0];
  const spans = detail.spans;

  const traceStartMs = spans.length
    ? Math.min(...spans.map((s) => new Date(s.start_time).getTime()))
    : 0;
  const traceEndMs = spans.length
    ? Math.max(
        ...spans.map((s) =>
          s.end_time
            ? new Date(s.end_time).getTime()
            : new Date(s.start_time).getTime() + (s.duration_ms ?? 1),
        ),
      )
    : traceStartMs + 1;
  const traceDurationMs = Math.max(traceEndMs - traceStartMs, 1);

  return (
    <div>
      {/* Trace ID */}
      <div className="mb-6">
        <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Trace ID</div>
        <div className="break-all font-mono text-sm">{detail.trace_id}</div>
      </div>

      {/* Request summary */}
      {req && (
        <div className="mb-6 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            { n: req.status, l: "Status", bad: req.status === "error" || req.status === "filtered" },
            { n: req.latency_ms != null ? `${req.latency_ms}ms` : "—", l: "Latency" },
            { n: req.total_tokens != null ? String(req.total_tokens) : "—", l: "Tokens" },
            { n: req.cost_usd != null ? usd(req.cost_usd) : "—", l: "Cost" },
          ].map((s) => (
            <div key={s.l} className="bg-surface p-4">
              <div className={`text-lg font-medium tracking-tight ${s.bad ? "text-bad" : ""}`}>{s.n}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {req?.guardrail_triggered && (
        <div className="mb-5">
          <Badge tone="bad">Guardrail triggered</Badge>
        </div>
      )}

      {/* Spans */}
      <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Spans ({spans.length})
      </div>
      {spans.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No spans recorded for this trace.
        </Card>
      ) : (
        <div className="flex flex-col gap-px bg-border">
          {spans.map((span) => {
            const offsetPct =
              ((new Date(span.start_time).getTime() - traceStartMs) / traceDurationMs) * 100;
            const widthPct = Math.max(0.5, ((span.duration_ms ?? 1) / traceDurationMs) * 100);
            const isErr = span.status === "error";

            return (
              <div key={span.id} className="bg-cream px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 ${isErr ? "bg-bad" : "bg-good"}`} />
                    <span className="truncate font-mono text-xs">{span.name}</span>
                    <Badge tone="default" className="shrink-0">{span.kind}</Badge>
                  </div>
                  <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                    {span.duration_ms != null ? `${span.duration_ms}ms` : "—"}
                  </span>
                </div>
                {/* Timeline bar */}
                <div className="relative h-1.5 w-full bg-muted">
                  <div
                    className={`absolute h-1.5 ${isErr ? "bg-bad/70" : "bg-flame-red/60"}`}
                    style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
                  />
                </div>
                {span.status_msg && (
                  <div className="mt-1.5 text-[10px] text-bad">{span.status_msg}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {spans.length > 0 && (
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>0ms</span>
          <span>{traceDurationMs}ms total</span>
        </div>
      )}
    </div>
  );
}
