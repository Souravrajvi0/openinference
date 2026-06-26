import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtTime, fmtNum } from "@/lib/utils";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { AuthScreen } from "@/components/AuthScreen";
import { PageHeader } from "@/components/marketing/shared";

type SessionRow = {
  session_id: string;
  turn_count: number;
  token_count: number;
  created_at: string;
  updated_at: string;
};

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

type SessionDetail = {
  session_id: string;
  messages: Message[];
  summary: string | null;
  token_count: number;
  turn_count: number;
  created_at: string;
  updated_at: string;
};

export function Sessions() {
  const { user, loading, setUser } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSessions = () =>
    api<{ data: SessionRow[] }>("/v1/sessions?limit=50")
      .then((r) => setSessions(r.data))
      .catch((e) => toast.error(e.message));

  useEffect(() => {
    if (user) loadSessions();
  }, [user]);

  async function selectSession(s: SessionRow) {
    if (selectedId === s.session_id) return;
    setSelectedId(s.session_id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await api<SessionDetail>(`/v1/sessions/${s.session_id}`);
      setDetail(d);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function deleteSession(sessionId: string) {
    if (!window.confirm("Delete this session and all its message history?")) return;
    try {
      await api(`/v1/sessions/${sessionId}`, { method: "DELETE" });
      toast.success("Session deleted");
      setSessions((prev) => prev?.filter((s) => s.session_id !== sessionId) ?? null);
      if (selectedId === sessionId) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (e: any) { toast.error(e.message); }
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
        kicker="Conversation memory"
        title="Sessions"
        description="Every multi-turn conversation is stored server-side. When context grows large, older turns are compressed into a summary automatically — both the live messages and the compressed summary are visible here."
      />

      <div className="flex flex-col lg:flex-row" style={{ minHeight: "calc(100vh - 220px)" }}>
        {/* Session list */}
        <div className="flex flex-col border-b border-border lg:w-[38%] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {sessions ? `${sessions.length} session${sessions.length !== 1 ? "s" : ""}` : "Loading…"}
            </span>
            <button
              onClick={loadSessions}
              className="cursor-pointer text-[11px] text-muted-foreground transition hover:text-ink"
              title="Refresh"
            >
              ↻
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!sessions ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">No sessions yet</div>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Sessions are created when a chat request includes a <code className="font-mono text-xs">session_id</code> field.
                </p>
              </div>
            ) : (
              sessions.map((s) => {
                const active = selectedId === s.session_id;
                return (
                  <button
                    key={s.session_id}
                    onClick={() => selectSession(s)}
                    className={`w-full cursor-pointer border-b border-border px-4 py-3 text-left transition ${
                      active ? "bg-ink text-cream" : "hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">
                        {s.session_id.slice(0, 8)}…
                      </span>
                      <span className={`tabular-nums text-[10px] ${active ? "text-cream/50" : "text-muted-foreground"}`}>
                        {fmtNum(s.token_count)} tok
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className={`text-[10px] ${active ? "text-cream/50" : "text-muted-foreground"}`}>
                        {s.turn_count} turn{s.turn_count !== 1 ? "s" : ""}
                      </span>
                      <span className={`text-[10px] ${active ? "text-cream/40" : "text-muted-foreground"}`}>
                        {fmtTime(s.updated_at)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          {detailLoading ? (
            <div className="flex h-full items-center justify-center py-20 text-sm text-muted-foreground">
              Loading session…
            </div>
          ) : !detail ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">No session selected</div>
              <p className="max-w-xs text-sm text-muted-foreground">
                Click a session on the left to inspect its message history and compressed summary.
              </p>
            </div>
          ) : (
            <SessionDetail
              detail={detail}
              onDelete={() => deleteSession(detail.session_id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SessionDetail({ detail, onDelete }: { detail: SessionDetail; onDelete: () => void }) {
  const userMessages = detail.messages.filter((m) => m.role === "user").length;
  const assistantMessages = detail.messages.filter((m) => m.role === "assistant").length;

  return (
    <div>
      {/* Session ID */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Session ID</div>
          <div className="break-all font-mono text-sm">{detail.session_id}</div>
        </div>
        <Button variant="danger" onClick={onDelete} className="shrink-0">
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {[
          { n: String(detail.turn_count), l: "Turns" },
          { n: fmtNum(detail.token_count), l: "Tokens" },
          { n: fmtTime(detail.created_at), l: "Created" },
          { n: fmtTime(detail.updated_at), l: "Updated" },
        ].map((s) => (
          <div key={s.l} className="bg-surface p-4">
            <div className="text-sm font-medium tracking-tight">{s.n}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Summary block */}
      {detail.summary && (
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Compressed context</span>
            <Badge tone="flame">summarized</Badge>
          </div>
          <div className="border border-flame-red/20 bg-flame-red/5 px-4 py-4">
            <p className="text-sm leading-relaxed text-ink/80">{detail.summary}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Messages ({userMessages}u · {assistantMessages}a)
      </div>

      {detail.messages.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No messages.</Card>
      ) : (
        <div className="flex flex-col gap-px bg-border">
          {detail.messages.map((msg, i) => (
            <MessageRow key={i} msg={msg} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";

  return (
    <div className={`px-4 py-4 ${isUser ? "bg-cream" : isSystem ? "bg-muted/40" : "bg-surface"}`}>
      <div className="mb-2">
        <span
          className={`text-[10px] uppercase tracking-[0.2em] font-medium ${
            isUser ? "text-flame-red" : isSystem ? "text-muted-foreground" : "text-ink/60"
          }`}
        >
          {msg.role}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
    </div>
  );
}
