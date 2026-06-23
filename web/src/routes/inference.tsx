import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, RefreshCw, Cpu, Zap, Shield, DollarSign, Wifi } from "lucide-react";
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

// ── cost table (per 1M tokens, input + output blended) ───────────────────────
const CLOUD_COST: Record<string, number> = {
  "llama-3.1-8b-instant":       0,      // Groq free tier
  "llama-3.3-70b-versatile":    0,      // Groq free tier
  "mistral-small-latest":       0.20,
  "mistral-large-latest":       4.00,
  "claude-haiku-4-5-20251001":  0.75,
  "claude-3-5-sonnet-20241022": 9.00,
  "gemini-2.0-flash":           0.15,
  "gemini-1.5-flash":           0.1875,
  "gemini-1.5-pro":             3.125,
};

const BEST_FOR: Record<string, string> = {
  ollama:    "batch · async · private",
  groq:      "realtime · low latency",
  openai:    "high accuracy · production",
  anthropic: "reasoning · long context",
  mistral:   "multilingual · code",
  cerebras:  "ultra-fast generation",
  gemini:    "multimodal · large context",
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtBytes = (b: number) => {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(0) + " MB";
  return b + " B";
};
const ms = (v: number | null) => (v == null ? "—" : v.toLocaleString() + " ms");
const tps = (v: string | number | null) => (v == null ? "—" : Number(v).toFixed(1) + " t/s");
const costLabel = (model: string, provider: string) => {
  if (provider === "ollama") return "$0.00";
  const c = CLOUD_COST[model];
  return c == null ? "—" : c === 0 ? "free tier" : `$${c.toFixed(2)}/1M`;
};

// ── page ──────────────────────────────────────────────────────────────────────

export function Inference() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Kicker>Inference</Kicker>
        <h1 className="mt-2 text-4xl font-medium tracking-tight md:text-5xl">
          CPU inference is viable.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          GPU-accelerated cloud APIs win on raw throughput. But for the right workloads —
          batch jobs, async pipelines, privacy-sensitive data — self-hosted CPU inference
          costs nothing, leaks nothing, and hits no rate limits.
        </p>
      </div>

      <div className="space-y-10">
        <WhyCpuSection />
        <ModelStatusSection />
        <StatsSection />
        <BenchmarkSection />
      </div>
    </div>
  );
}

// ── Why CPU ───────────────────────────────────────────────────────────────────

function WhyCpuSection() {
  const cards = [
    {
      icon: <DollarSign className="h-5 w-5" />,
      title: "Zero marginal cost",
      body: "No per-token billing. Run 10 requests or 10 million — the cost is the same: your server's electricity. Ideal for high-volume internal tooling.",
      tag: "vs $0.20–$9.00/1M tokens on cloud",
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "100% private",
      body: "Your prompts and responses never leave your infrastructure. No vendor data retention policy to audit. Required for PII, HIPAA, or proprietary data.",
      tag: "vs cloud API terms of service",
    },
    {
      icon: <Wifi className="h-5 w-5" />,
      title: "No rate limits",
      body: "Cloud providers throttle bursts. CPU inference runs as fast as the hardware allows — predictable, no 429s, no quota negotiations.",
      tag: "vs RPM/TPM caps on every cloud API",
    },
    {
      icon: <Cpu className="h-5 w-5" />,
      title: "Right-sized models",
      body: "Gemma 3 1B and Qwen 2.5 0.5B handle classification, extraction, and short Q&A well. Not every task needs a 70B frontier model.",
      tag: "small models · fast enough for async",
    },
  ];

  return (
    <section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title} className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center border border-border text-flame-red">
              {c.icon}
            </div>
            <div className="mb-1 text-sm font-medium">{c.title}</div>
            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">{c.body}</p>
            <div className="text-[10px] uppercase tracking-[0.1em] text-flame-red">{c.tag}</div>
          </Card>
        ))}
      </div>

      {/* Use-case guidance */}
      <div className="mt-4 grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
        {[
          { when: "Use CPU (Ollama)", cases: ["Document classification", "Async summarisation", "Batch extraction", "Internal chatbots", "Privacy-sensitive prompts"], tone: "border-flame-red/40 bg-flame-red/5" },
          { when: "Use cloud GPU", cases: ["Customer-facing chat", "Code generation", "Long-context reasoning", "Multimodal tasks", "Sub-200ms latency SLA"], tone: "border-good/40 bg-good/5" },
          { when: "Use both (hybrid)", cases: ["CPU for pre-filtering", "GPU for final generation", "CPU fallback on quota hit", "A/B cost experiments", "Tiered plan routing"], tone: "border-border bg-muted/30" },
        ].map((col) => (
          <div key={col.when} className={`border p-5 ${col.tone}`}>
            <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.15em]">{col.when}</div>
            <ul className="space-y-1.5">
              {col.cases.map((c) => (
                <li key={c} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-current" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
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
          <h2 className="text-sm font-medium uppercase tracking-[0.15em]">Ollama — self-hosted CPU node</h2>
        </div>
        <Button variant="ghost" onClick={load}><RefreshCw className="h-3 w-3" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-good" />
            <h3 className="text-xs font-medium uppercase tracking-[0.15em]">Loaded in memory</h3>
          </div>
          {loading ? <Loading /> : !data || data.running.length === 0 ? (
            <Empty text="No models in RAM. Send a request to load one — first response is slower while the model loads." />
          ) : (
            <div className="space-y-3">
              {data.running.map((m) => (
                <div key={m.name} className="flex items-start justify-between border border-border p-3">
                  <div>
                    <div className="font-mono text-sm">{m.name}</div>
                    {m.expires_at && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        unloads at {new Date(m.expires_at).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-medium">{fmtBytes(m.size)}</div>
                    {m.size_vram != null && m.size_vram > 0 && (
                      <div className="text-[10px] text-muted-foreground">{fmtBytes(m.size_vram)} VRAM</div>
                    )}
                    <Badge tone="good" className="mt-1">ready</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-muted-foreground" />
            <h3 className="text-xs font-medium uppercase tracking-[0.15em]">Available on disk</h3>
          </div>
          {loading ? <Loading /> : !data || data.available.length === 0 ? (
            <Empty text="No models pulled yet. SSH into the server and run: ollama pull gemma3:1b" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    <th className="py-2 pr-4 font-normal">Model</th>
                    <th className="py-2 pr-4 font-normal">Size</th>
                    <th className="py-2 pr-4 font-normal">Cost/1M</th>
                    <th className="py-2 font-normal">Inference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.available.map((m) => (
                    <tr key={m.name} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-mono">{m.name}</td>
                      <td className="py-2 pr-4">{fmtBytes(m.size)}</td>
                      <td className="py-2 pr-4 font-medium text-good">$0.00</td>
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

  // Savings: sum of tokens * cloud rate for equivalent model class
  const cpuRequests = cpu.reduce((a, r) => a + Number(r.requests), 0);
  const cheapestCloud = 0.10; // Groq/Gemini flash tier $/1M tokens
  const avgTokensPerReq = cpu.length ? cpu.reduce((a, r) => a + (r.avg_tokens ?? 0), 0) / cpu.length : 50;
  const savedUsd = (cpuRequests * avgTokensPerReq / 1_000_000) * cheapestCloud;

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium uppercase tracking-[0.15em]">Performance from real traffic</h2>
      </div>

      {/* Savings card */}
      {cpuRequests > 0 && (
        <div className="mb-5 border border-flame-red/30 bg-flame-red/5 p-5">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-2xl font-medium">{fmtNum(cpuRequests)}</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">CPU requests served</div>
            </div>
            <div>
              <div className="text-2xl font-medium text-good">${savedUsd < 0.01 ? "<0.01" : savedUsd.toFixed(2)}</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">estimated savings vs cloud</div>
            </div>
            <div className="ml-auto max-w-xs text-[11px] text-muted-foreground">
              Based on equivalent requests at the cheapest cloud rate (${cheapestCloud}/1M tokens).
              Your actual savings scale with model tier.
            </div>
          </div>
        </div>
      )}

      {!rows ? <Card className="p-5"><Loading /></Card> : rows.length === 0 ? (
        <Card className="p-5"><Empty text="No request history yet. Send some chat requests to populate this table." /></Card>
      ) : (
        <div className="space-y-5">
          {cpu.length > 0 && (
            <StatsTable
              title="Self-hosted · CPU inference · $0 / request"
              rows={cpu}
              headerClass="bg-flame-red/5 border-flame-red/20 text-flame-red"
            />
          )}
          {cloud.length > 0 && (
            <StatsTable
              title="Cloud · GPU-accelerated · per-token billing"
              rows={cloud}
              headerClass="bg-muted border-border text-muted-foreground"
            />
          )}
        </div>
      )}
    </section>
  );
}

function StatsTable({ title, rows, headerClass }: { title: string; rows: InferenceStats[]; headerClass: string }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className={`border-b px-5 py-3 text-[11px] font-medium uppercase tracking-[0.15em] ${headerClass}`}>
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
              <th className="pb-2 pr-4 font-normal">TTFB avg</th>
              <th className="pb-2 pr-4 font-normal">Cost/1M</th>
              <th className="pb-2 font-normal">Best for</th>
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
                <td className="py-2 pr-4 text-muted-foreground">{ms(r.avg_ttfb_ms)}</td>
                <td className={`py-2 pr-4 font-medium ${r.provider === "ollama" ? "text-good" : "text-muted-foreground"}`}>
                  {costLabel(r.model, r.provider)}
                </td>
                <td className="py-2 text-[10px] text-muted-foreground">
                  {BEST_FOR[r.provider] ?? "—"}
                </td>
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
  const isCpu = selected.provider === "ollama";

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
  const avgTps = successful.length ? Math.round(successful.reduce((a, r) => a + (r.tokens_per_sec ?? 0), 0) / successful.length) : null;
  const avgLatency = successful.length ? Math.round(successful.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / successful.length) : null;
  const avgTtfb = successful.length ? Math.round(successful.reduce((a, r) => a + (r.ttfb_ms ?? 0), 0) / successful.length) : null;

  // For CPU: green if ≥8 t/s (usable). For cloud: green if ≥80 t/s.
  const tpsGreenThreshold = isCpu ? 8 : 80;
  const tpsGoodLabel = isCpu ? "≥8 t/s is usable for async" : "≥80 t/s is realtime";

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

        {/* Context strip */}
        <div className={`mb-4 flex items-center gap-3 border p-3 text-[11px] ${isCpu ? "border-flame-red/30 bg-flame-red/5" : "border-good/30 bg-good/5"}`}>
          <span className={`inline-block h-2 w-2 shrink-0 ${isCpu ? "bg-flame-red" : "bg-good"}`} />
          <span className="text-muted-foreground">
            {isCpu
              ? `CPU inference · $0 per run · data stays on your server · ${tpsGoodLabel}`
              : `Cloud GPU inference · billed per token · ${tpsGoodLabel}`}
          </span>
        </div>

        {/* Summary stats */}
        {successful.length > 0 && (
          <div className="mb-5 grid grid-cols-3 gap-px bg-border">
            {[
              { n: avgTps != null ? avgTps + " t/s" : "—", l: "Avg tokens/sec", good: avgTps != null && avgTps >= tpsGreenThreshold },
              { n: avgLatency != null ? avgLatency + " ms" : "—", l: "Avg latency", good: avgLatency != null && avgLatency < 5000 },
              { n: avgTtfb != null ? avgTtfb + " ms" : "—", l: "Avg TTFB", good: avgTtfb != null && avgTtfb < 2000 },
            ].map((s) => (
              <div key={s.l} className="bg-surface p-4">
                <div className={`text-xl font-medium ${s.good ? "text-good" : ""}`}>{s.n}</div>
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
                    <td className="py-2 pr-3 max-w-[200px] truncate text-muted-foreground">{r.prompt ?? "—"}</td>
                    {r.error ? (
                      <td colSpan={4} className="py-2 text-bad">{r.error}</td>
                    ) : (
                      <>
                        <td className="py-2 pr-3">{r.ttfb_ms != null ? r.ttfb_ms + " ms" : "—"}</td>
                        <td className="py-2 pr-3">{r.latency_ms != null ? r.latency_ms + " ms" : "—"}</td>
                        <td className="py-2 pr-3">{r.completion_tokens ?? "—"}</td>
                        <td className={`py-2 font-medium ${(r.tokens_per_sec ?? 0) >= tpsGreenThreshold ? "text-good" : "text-flame-red"}`}>
                          {r.tokens_per_sec != null ? r.tokens_per_sec + " t/s" : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {running && results.length < runs && (
                  <tr className="border-b border-border">
                    <td colSpan={6} className="py-3 text-center text-[11px] text-muted-foreground">
                      <span className="animate-pulse">Running {results.length + 1} of {runs}…</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!running && results.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Pick a model and run a benchmark. CPU models are scored ≥{tpsGreenThreshold} t/s as production-viable.
          </div>
        )}
      </Card>
    </section>
  );
}

function Loading() { return <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>; }
function Empty({ text }: { text: string }) { return <div className="py-6 text-center text-sm text-muted-foreground">{text}</div>; }
