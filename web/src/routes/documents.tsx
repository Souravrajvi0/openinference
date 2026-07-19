import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import { api, apiUpload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/utils";
import { Badge, Button, Card, Input, Label } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { PageHeader } from "@/components/marketing/shared";

type DocRow = {
  id: string;
  title: string;
  source_type: string;
  status: string;
  chunk_count: number | null;
  error_message: string | null;
  created_at: string;
  indexed_at: string | null;
};

type RetrieveChunk = {
  chunk_id: string;
  document_id: string;
  document_title: string | null;
  content_preview: string;
  score: number;
  match_type: string;
};

const statusColor = (s: string): "good" | "bad" | "default" | "flame" =>
  s === "indexed" ? "good" : s === "failed" ? "bad" : "default";

export function Documents() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  const [results, setResults] = useState<RetrieveChunk[] | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const load = () =>
    api<{ data: DocRow[] }>("/v1/documents")
      .then((r) => setDocs(r.data))
      .catch((e) => toast.error(e.message));

  useEffect(() => {
    if (user) load();
  }, [user]);

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
      setUploading(false);
      setTitle(""); setContent(""); setFile(null); setPasteMode(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function del(id: string) {
    if (!window.confirm("Delete this document and all its chunks?")) return;
    try {
      await api(`/v1/documents/${id}`, { method: "DELETE" });
      toast.success("Deleted");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function retrieve() {
    if (!query.trim()) return toast.error("Enter a query");
    setRetrieving(true);
    setResults(null);
    try {
      const r = await api<{ query: string; results: RetrieveChunk[]; latency_ms: number }>(
        "/v1/retrieve",
        { method: "POST", body: JSON.stringify({ query: query.trim(), top_k: 5 }) },
      );
      setResults(r.results);
      setLatency(r.latency_ms);
    } catch (e: any) { toast.error(e.message); }
    finally { setRetrieving(false); }
  }

  const indexed = docs?.filter((d) => d.status === "indexed").length ?? 0;
  const pending = docs?.filter((d) => d.status === "pending" || d.status === "processing").length ?? 0;
  const failed = docs?.filter((d) => d.status === "failed").length ?? 0;

  return (
    <div className="bg-cream text-ink">
      <PageHeader
        kicker="Knowledge base"
        title="Your organization's documents"
        description="Upload handbooks, policies, and notes for this company only. OpenInference chunks, embeds, and indexes them for hybrid search and RAG — other orgs cannot see this knowledge base."
        action={
          user ? (
            <Button onClick={() => setUploading(true)}>
              <Plus className="h-3 w-3" /> Upload
            </Button>
          ) : undefined
        }
      />

      {/* Stats strip */}
      <section className="border-b border-border">
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            { n: String(docs?.length ?? "—"), l: "Total" },
            { n: String(indexed), l: "Indexed" },
            { n: String(pending), l: "Pending" },
            { n: String(failed), l: "Failed", bad: failed > 0 },
          ].map((s) => (
            <div key={s.l} className="bg-cream p-6">
              <div className={`text-3xl font-medium tracking-tight ${s.bad ? "text-bad" : ""}`}>{s.n}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Documents table */}
      <section className="border-b border-border px-6 py-8 md:px-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.15em]">Documents</h2>
          <button
            onClick={load}
            className="cursor-pointer text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition hover:text-ink"
          >
            Refresh
          </button>
        </div>
        <Card>
          {!user ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Link to="/admin" className="underline">Sign in</Link> to upload, index, and search your knowledge base.
            </div>
          ) : !docs ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No documents yet. Upload text to enable RAG retrieval.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    <th className="px-4 py-3 font-normal">Title</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal">Chunks</th>
                    <th className="px-4 py-3 font-normal">Indexed</th>
                    <th className="px-4 py-3 font-normal">Uploaded</th>
                    <th className="px-4 py-3 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-b border-border transition last:border-0 hover:bg-surface">
                      <td className="max-w-xs px-4 py-3">
                        <div className="truncate font-medium">{d.title}</div>
                        {d.error_message && (
                          <div className="mt-0.5 truncate text-[10px] text-bad">{d.error_message}</div>
                        )}
                      </td>
                      <td className="px-4 py-3"><Badge tone={statusColor(d.status)}>{d.status}</Badge></td>
                      <td className="px-4 py-3">{d.chunk_count ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{d.indexed_at ? fmtDate(d.indexed_at) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(d.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {user && (
                          <Button variant="danger" onClick={() => del(d.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* Retrieval test */}
      <section className="px-6 py-8 md:px-10">
        <div className="mb-5">
          <h2 className="text-xs uppercase tracking-[0.15em]">Test retrieval</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Query your indexed documents. Uses hybrid vector + keyword search with RRF reranking.
          </p>
        </div>
        {!user ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            <Link to="/admin" className="underline">Sign in</Link> to query your indexed documents.
          </Card>
        ) : (
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && retrieve()}
              placeholder="What does the refund policy say?"
              className="flex-1"
            />
            <Button onClick={retrieve} disabled={retrieving}>
              <Search className="h-3 w-3" />
              {retrieving ? "Searching…" : "Search"}
            </Button>
          </div>
        )}

        {results !== null && (
          <div className="mt-5">
            <div className="mb-3 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {results.length} result{results.length !== 1 ? "s" : ""}
              {latency !== null ? ` · ${latency}ms` : ""}
            </div>
            {results.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No matching chunks found. Try a different query or verify documents are indexed.
              </Card>
            ) : (
              <div className="flex flex-col gap-px bg-border">
                {results.map((r, i) => (
                  <div key={r.chunk_id} className="bg-cream p-5">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        #{i + 1}
                      </span>
                      {r.document_title && (
                        <span className="text-[10px] uppercase tracking-[0.15em] font-medium">
                          {r.document_title}
                        </span>
                      )}
                      <Badge tone={r.match_type === "hybrid" ? "flame" : "default"}>{r.match_type}</Badge>
                      <span className="ml-auto tabular-nums text-[10px] text-muted-foreground">
                        {r.score.toFixed(4)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-ink/80">{r.content_preview}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Upload modal */}
      <Modal open={uploading} onClose={() => setUploading(false)} title="Upload document">
        <div className="mb-3">
          <Label>Title (optional — defaults to filename)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Company handbook" />
        </div>
        {!pasteMode ? (
          <div className="mb-3">
            <Label>File (.txt, .md, .pdf — max 10MB)</Label>
            <input
              type="file"
              accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm"
            />
          </div>
        ) : (
          <div className="mb-3">
            <Label>Content</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="Paste document text here…"
              className="w-full resize-y border border-border-strong bg-surface px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-flame-red"
            />
          </div>
        )}
        <button
          type="button"
          className="mb-4 text-xs text-muted-foreground underline"
          onClick={() => setPasteMode((v) => !v)}
        >
          {pasteMode ? "Use file upload instead" : "Or paste text instead"}
        </button>
        <Button className="w-full" onClick={upload} disabled={busy}>
          {busy ? "Uploading…" : "Upload & ingest"}
        </Button>
      </Modal>
    </div>
  );
}
