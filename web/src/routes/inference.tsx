import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, RefreshCw, Cpu, Zap } from "lucide-react";
import { api, authHeaders, MODEL_CATALOG } from "@/lib/api";
import { fmtNum } from "@/lib/utils";
import { Badge, Button, Card, Kicker, Label, Select } from "@/components/ui/primitives";

// ── types ─────────────────────────────────────────────────────────────────────

interface OllamaModel {
  name: string;
  size: number;
  digest?: string;
  expires_at?: string;
  size_vram?: number;
}

interface InferenceStats {
  model: string;
  provider: string;
  requests: string | number;
  avg_tokens_per_sec: string | number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
  avg_ttfb_ms: number | null;
  avg_tokens: number | null;
}

interface BenchRun {
  run: number;
  prompt?: string;
  ttfb_ms?: number;
  latency_ms?: number;
  completion_tokens?: number;
  tokens_per_sec?: number;
  error?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtBytes = (b: number) => {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(0) + " MB";
  return b + " B";
};
const ms = (v: number | null) => (v == null ? "—" : v.toLocaleString() + " ms");
const tps = (v: string | number | null) => (v == null ? "—" : Number(v).toFixed(1) + " t/s");

// ── page ──────────────────────────────────────────────────────────────────────

export function Inference() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-10">
        <Kicker>Inference</Kicker>
        <h1 className="mt-2 text-4xl font-medium tracking-tight md:text-5xl">
          CPU &amp; cloud benchmarks.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Compare self-hosted CPU inference (Ollama) against GPU-accelerated cloud providers.
          Run live benchmarks or browse aggregated stats from real traffic.
        </p>
      </div>

      <div className="space-y-10">
        <ModelStatusSection />
        <StatsSection />
        <BenchmarkSection />
      </div>
    </div>
  );
}

// ── Model Status ──────────────────────────────────────────────────────────────

function ModelStatusSection() {
  const [data, setData] = useState<{ running: OllamaModel[]; available: OllamaModel[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api<{ running: OllamaModel[]; available: OllamaModel[] }>("/v1/admin/inference/models")
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium uppercase tracking-[0.15em]">Ollama model status</h2>
        </div>
        <Button variant="ghost" onClick={load}><RefreshCw className="h-3 w-3" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Running */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-good" />
            <h3 className="text-xs font-medium uppercase tracking-[0.15em]">Loaded in memory</h3>
          </div>
          {loading ? <Loading /> : !data || data.running.length === 0 ? (
            <Empty text="No models currently loaded. Send a request to load one." />
          ) : (
            <div className="space-y-3">
              {data.running.map((m) => (
                <div key={m.name} className="flex items-start justify-between border border-border p-3">
                  <div>
                    <div className="font-mono text-sm">{m.name}</div>
                    {m.expires_at && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        expires {new Date(m.expires_at).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <div>{fmtBytes(m.size)}</div>
                    {m.size_vram != null && m.size_vram > 0 && (
                      <div className="text-[10px] text-muted-foreground">{fmtBytes(m.size_vram)} VRAM</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Available */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-muted-foreground" />
            <h3 className="text-xs font-medium uppercase tracking-[0.15em]">Available on disk</h3>
          </div>
          {loading ? <Loading /> : !data || data.available.length === 0 ? (
            <Empty text="No models pulled. Run: ollama pull gemma3:1b" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    <th className="py-2 pr-4 font-normal">Model</th>
                    <th className="py-2 pr-4 font-normal">Size</th>
                    <th className="py-2 font-normal">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {data.available.map((m) => (
                    <tr key={m.name} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-mono">{m.name}</td>
                      <td className="py-2 pr-4">{fmtBytes(m.size)}</td>
                      <td className="py-2"><Badge>CPU</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

// ── Performance Stats ─────────────────────────────────────────────────────────

function StatsSection() {
  const [rows, setRows] = useState<InferenceStats[] | null>(null);
  useEffect(() => {
    api<{ data: InferenceStats[] }>("/v1/admin/inference/stats")
      .then((r) => setRows(r.data))
      .catch((e) => toast.error(e.message));
  }, []);

  const cpu = rows?.filter((r) => r.provider === "ollama") ?? [];
  const cloud = rows?.filter((r) => r.provider !== "ollama") ?? [];

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium uppercase tracking-[0.15em]">Performance from real traffic</h2>
      </div>

      {!rows ? <Card className="p-5"><Loading /></Card> : rows.length === 0 ? (
        <Card className="p-5"><Empty text="No request history yet. Send some chat requests first." /></Card>
      ) : (
        <div className="space-y-5">
          {cpu.length > 0 && <StatsTable title="Self-hosted · CPU (Ollama)" rows={cpu} accent="bg-flame-red/10 border-flame-red/20" />}
          {cloud.length > 0 && <StatsTable title="Cloud · GPU accelerated" rows={cloud} accent="bg-good/10 border-good/20" />}
        </div>
      )}
    </section>
  );
}

function StatsTable({ title, rows, accent }: { title: string; rows: InferenceStats[]; accent: string }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className={`border-b px-5 py-3 text-[11px] font-medium uppercase tracking-[0.15em] ${accent}`}>
        {title}
      </div>
      <div className="overflow-x-auto p-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <th className="pb-2 pr-4 font-normal">Model</th>
              <th className="pb-2 pr-4 font-normal">Requests</th>
              <th className="pb-2 pr-4 font-normal">Tok/s avg</th>
              <th className="pb-2 pr-4 font-normal">p50</th>
              <th className="pb-2 pr-4 font-normal">p95</th>
              <th className="pb-2 pr-4 font-normal">p99</th>
              <th className="pb-2 pr-4 font-normal">TTFB avg</th>
              <th className="pb-2 font-normal">Avg tokens</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model + r.provider} className="border-b border-border last:border-0">
                <td className="py-2 pr-4 font-mono text-[11px]">{r.model}</td>
                <td className="py-2 pr-4">{fmtNum(r.requests)}</td>
                <td className="py-2 pr-4 font-medium">{tps(r.avg_tokens_per_sec)}</td>
                <td className="py-2 pr-4 text-muted-foreground">{ms(r.p50_ms)}</td>
                <td className="py-2 pr-4 text-muted-foreground">{ms(r.p95_ms)}</td>
                <td className="py-2 pr-4 text-muted-foreground">{ms(r.p99_ms)}</td>
                <td className="py-2 pr-4 text-muted-foreground">{ms(r.avg_ttfb_ms)}</td>
                <td className="py-2 text-muted-foreground">{r.avg_tokens ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Benchmark Runner ──────────────────────────────────────────────────────────

function BenchmarkSection() {
  const [modelKey, setModelKey] = useState(MODEL_CATALOG[0].provider + "/" + MODEL_CATALOG[0].model);
  const [runs, setRuns] = useState(5);
  const [results, setResults] = useState<BenchRun[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selected = MODEL_CATALOG.find((m) => m.provider + "/" + m.model === modelKey)!;

  async function runBenchmark() {
    setResults([]);
    setRunning(true);
    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      const res = await fetch("/v1/admin/inference/benchmark", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ model: selected.model, provider: selected.provider, runs }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.replace(/^data:\s?/, "").trim();
          if (!line || line === "[DONE]") continue;
          try {
            const evt: BenchRun = JSON.parse(line);
            setResults((prev) => [...prev, evt]);
          } catch { /* */ }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  const successful = results.filter((r) => !r.error);
  const avgTps = successful.length
    ? Math.round(successful.reduce((a, r) => a + (r.tokens_per_sec ?? 0), 0) / successful.length)
    : null;
  const avgLatency = successful.length
    ? Math.round(successful.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / successful.length)
    : null;
  const avgTtfb = successful.length
    ? Math.round(successful.reduce((a, r) => a + (r.ttfb_ms ?? 0), 0) / successful.length)
    : null;

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Play className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium uppercase tracking-[0.15em]">Live benchmark runner</h2>
      </div>

      <Card className="p-5">
        <div className="mb-5 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-48">
            <Label>Model</Label>
            <Select className="w-full" value={modelKey} onChange={(e) => setModelKey(e.target.value)} disabled={running}>
              {MODEL_CATALOG.map((m) => (
                <option key={m.provider + "/" + m.model} value={m.provider + "/" + m.model}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <Label>Runs (1–10)</Label>
            <Select className="w-full" value={String(runs)} onChange={(e) => setRuns(Number(e.target.value))} disabled={running}>
              {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>
          {running ? (
            <Button variant="danger" onClick={() => abortRef.current?.abort()}>Stop</Button>
          ) : (
            <Button onClick={runBenchmark}><Play className="h-3 w-3" /> Run benchmark</Button>
          )}
        </div>

        {/* Summary stats */}
        {successful.length > 0 && (
          <div className="mb-5 grid grid-cols-3 gap-px bg-border">
            {[
              { n: avgTps != null ? avgTps + " t/s" : "—", l: "Avg tokens/sec" },
              { n: avgLatency != null ? avgLatency + " ms" : "—", l: "Avg latency" },
              { n: avgTtfb != null ? avgTtfb + " ms" : "—", l: "Avg TTFB" },
            ].map((s) => (
              <div key={s.l} className="bg-surface p-4">
                <div className="text-xl font-medium">{s.n}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  <th className="pb-2 pr-3 font-normal">#</th>
                  <th className="pb-2 pr-3 font-normal">Prompt</th>
                  <th className="pb-2 pr-3 font-normal">TTFB</th>
                  <th className="pb-2 pr-3 font-normal">Latency</th>
                  <th className="pb-2 pr-3 font-normal">Tokens</th>
                  <th className="pb-2 font-normal">Tok/s</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.run} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 text-muted-foreground">{r.run}</td>
                    <td className="py-2 pr-3 max-w-xs truncate text-muted-foreground">{r.prompt ?? "—"}</td>
                    {r.error ? (
                      <td colSpan={4} className="py-2 text-bad">{r.error}</td>
                    ) : (
                      <>
                        <td className="py-2 pr-3">{r.ttfb_ms != null ? r.ttfb_ms + " ms" : "—"}</td>
                        <td className="py-2 pr-3">{r.latency_ms != null ? r.latency_ms + " ms" : "—"}</td>
                        <td className="py-2 pr-3">{r.completion_tokens ?? "—"}</td>
                        <td className={"py-2 font-medium " + ((r.tokens_per_sec ?? 0) > 50 ? "text-good" : "text-flame-red")}>
                          {r.tokens_per_sec != null ? r.tokens_per_sec + " t/s" : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {running && results.length < runs && (
                  <tr className="border-b border-border">
                    <td colSpan={6} className="py-3 text-center text-[11px] text-muted-foreground">
                      <span className="animate-pulse">Running run {results.length + 1} of {runs}…</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!running && results.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Pick a model and hit Run benchmark to measure inference speed.
          </div>
        )}
      </Card>
    </section>
  );
}

function Loading() { return <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>; }
function Empty({ text }: { text: string }) { return <div className="py-6 text-center text-sm text-muted-foreground">{text}</div>; }
