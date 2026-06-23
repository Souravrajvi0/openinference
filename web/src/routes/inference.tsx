import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, RefreshCw } from "lucide-react";
import { api, authHeaders, MODEL_CATALOG } from "@/lib/api";
import { fmtNum } from "@/lib/utils";
import { Button, Label, Select } from "@/components/ui/primitives";

// ── types ─────────────────────────────────────────────────────────────────────

interface OllamaModel { name: string; size: number; expires_at?: string; size_vram?: number; }

interface InferenceStats {
  model: string; provider: string; requests: string | number;
  avg_tokens_per_sec: string | number | null;
  p50_ms: number | null; p95_ms: number | null; p99_ms: number | null;
  avg_ttfb_ms: number | null; avg_tokens: number | null;
}

interface BenchRun {
  run: number; prompt?: string; ttfb_ms?: number; latency_ms?: number;
  completion_tokens?: number; tokens_per_sec?: number; error?: string;
}

// ── static data ───────────────────────────────────────────────────────────────

const CLOUD_COST: Record<string, number> = {
  "mistral-small-latest": 0.20, "mistral-large-latest": 4.00,
  "claude-haiku-4-5-20251001": 0.75, "claude-3-5-sonnet-20241022": 9.00,
  "gemini-2.0-flash": 0.15, "gemini-1.5-flash": 0.19, "gemini-1.5-pro": 3.13,
};

const BEST_FOR: Record<string, string> = {
  ollama: "batch · async · private data",
  groq: "realtime chat · low latency",
  openai: "production · high accuracy",
  anthropic: "reasoning · long context",
  mistral: "multilingual · code",
  gemini: "multimodal · large context",
};

const fmtBytes = (b: number) =>
  b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(0) + " MB" : b + " B";

const ms = (v: number | null) => (v == null ? "—" : v.toLocaleString() + " ms");

// ── page ──────────────────────────────────────────────────────────────────────

export function Inference() {
  return (
    <div>
      <HeroSection />
      <WhySection />
      <StatsSection />
      <ModelStatusSection />
      <BenchmarkSection />
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-ink px-6 py-24 text-cream md:px-16">
      {/* Background grid decoration */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "linear-gradient(var(--cream) 1px,transparent 1px),linear-gradient(90deg,var(--cream) 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-4 text-[11px] uppercase tracking-[0.2em] text-cream/50">Inference</div>
        <h1 className="mb-6 text-5xl font-medium leading-[1.05] tracking-tight md:text-7xl">
          CPU inference.<br />
          <span className="text-flame-red">Zero cost.</span>
        </h1>
        <p className="mb-16 max-w-xl text-base text-cream/60">
          GPU cloud APIs win on raw speed. But for batch workloads, private data,
          and cost-sensitive pipelines — self-hosted CPU inference is production-viable
          and costs nothing per token.
        </p>

        {/* Visual comparison bars */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-cream/40">Self-hosted · CPU</div>
            <div className="space-y-3">
              {[
                { name: "gemma3:1b", tps: 18, max: 200, cost: "$0.00" },
                { name: "qwen2.5:0.5b", tps: 28, max: 200, cost: "$0.00" },
                { name: "gemma3:4b", tps: 8, max: 200, cost: "$0.00" },
              ].map((m) => (
                <div key={m.name}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-mono text-cream/80">{m.name}</span>
                    <span className="text-flame-red font-medium">{m.cost} · {m.tps} t/s</span>
                  </div>
                  <div className="h-1.5 w-full bg-cream/10">
                    <div className="h-full bg-flame-red transition-all" style={{ width: `${(m.tps / m.max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-cream/40">Cloud GPU · for reference</div>
            <div className="space-y-3">
              {[
                { name: "llama-3.1-8b · groq", tps: 200, max: 200, cost: "free tier" },
                { name: "llama-3.3-70b · groq", tps: 140, max: 200, cost: "free tier" },
                { name: "gemini-2.0-flash", tps: 120, max: 200, cost: "$0.15/1M" },
              ].map((m) => (
                <div key={m.name}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-mono text-cream/50">{m.name}</span>
                    <span className="text-cream/40">{m.cost} · {m.tps} t/s</span>
                  </div>
                  <div className="h-1.5 w-full bg-cream/10">
                    <div className="h-full bg-cream/25 transition-all" style={{ width: `${(m.tps / m.max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-[10px] text-cream/30">
          * CPU t/s are estimates for a 2-vCPU cloud instance. Run a live benchmark below for your actual numbers.
        </p>
      </div>
    </section>
  );
}

// ── Why CPU ───────────────────────────────────────────────────────────────────

function WhySection() {
  return (
    <section className="bg-surface px-6 py-20 md:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">The case for CPU</div>
        <h2 className="mb-12 text-4xl font-medium tracking-tight md:text-5xl">
          Slower. Cheaper.<br />Sometimes the right call.
        </h2>

        {/* Bento grid */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Big tile - cost */}
          <div className="col-span-2 row-span-2 border border-border bg-ink p-8 text-cream">
            <div className="mb-4 text-[10px] uppercase tracking-[0.2em] text-cream/40">Cost per 1M tokens</div>
            <div className="mb-2 text-7xl font-medium text-flame-red">$0</div>
            <div className="mb-6 text-cream/60">Self-hosted Ollama. Always. No per-token billing, no surprises on your invoice, no rate-limit 429s at 3am.</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-cream/30">vs $0.15–$9.00 on cloud</div>
          </div>

          {/* Privacy */}
          <div className="border border-border bg-cream p-6">
            <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Privacy</div>
            <div className="mb-2 text-lg font-medium">Stays on your server</div>
            <p className="text-xs text-muted-foreground">Prompts never leave your infrastructure. No vendor data retention to audit. Required for PII, HIPAA, and proprietary data.</p>
          </div>

          {/* Rate limits */}
          <div className="border border-border bg-cream p-6">
            <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Limits</div>
            <div className="mb-2 text-lg font-medium">No rate limits</div>
            <p className="text-xs text-muted-foreground">Cloud APIs throttle bursts. CPU inference runs as fast as hardware allows — predictable, no quotas, no negotiations.</p>
          </div>

          {/* Right-sized */}
          <div className="border border-border bg-cream p-6">
            <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Model size</div>
            <div className="mb-2 text-lg font-medium">Right-sized models</div>
            <p className="text-xs text-muted-foreground">1B–4B models handle classification, extraction, and short Q&A well. Not every task needs a 70B frontier model.</p>
          </div>

          {/* No lock-in */}
          <div className="border border-border bg-cream p-6">
            <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Ownership</div>
            <div className="mb-2 text-lg font-medium">Zero vendor lock-in</div>
            <p className="text-xs text-muted-foreground">Swap models without changing your API. Ollama runs any GGUF model. Your gateway, your weights, your infra.</p>
          </div>
        </div>

        {/* Use-case strip */}
        <div className="mt-3 grid grid-cols-1 gap-0 border border-border sm:grid-cols-3">
          {[
            { label: "Use CPU when", items: ["Batch / async pipelines", "High-volume internal tools", "Privacy-sensitive prompts", "Cost ceilings are hard", "No latency SLA < 2s"], bg: "bg-flame-red/5 border-r border-border" },
            { label: "Use cloud GPU when", items: ["Customer-facing realtime chat", "Code generation at scale", "Long-context reasoning (>32K)", "Multimodal tasks", "Sub-500ms latency required"], bg: "bg-surface border-r border-border" },
            { label: "Use both (hybrid)", items: ["CPU for pre-filtering/classify", "GPU only for final generation", "CPU fallback on quota hit", "A/B cost experiments", "Plan-tiered routing (free→CPU)"], bg: "bg-surface" },
          ].map((col) => (
            <div key={col.label} className={`p-6 ${col.bg}`}>
              <div className="mb-4 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{col.label}</div>
              <ul className="space-y-2">
                {col.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs">
                    <span className="mt-1.5 h-1 w-1 shrink-0 bg-flame-red" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function StatsSection() {
  const [rows, setRows] = useState<InferenceStats[] | null>(null);
  useEffect(() => {
    api<{ data: InferenceStats[] }>("/v1/admin/inference/stats")
      .then((r) => setRows(r.data))
      .catch((e) => toast.error(e.message));
  }, []);

  const cpu = rows?.filter((r) => r.provider === "ollama") ?? [];
  const cloud = rows?.filter((r) => r.provider !== "ollama") ?? [];
  const cpuReqs = cpu.reduce((a, r) => a + Number(r.requests), 0);
  const avgTok = cpu.length ? cpu.reduce((a, r) => a + (r.avg_tokens ?? 0), 0) / cpu.length : 50;
  const saved = (cpuReqs * avgTok / 1_000_000) * 0.10;

  const maxTps = rows ? Math.max(...rows.map((r) => Number(r.avg_tokens_per_sec ?? 0)), 1) : 1;

  return (
    <section className="px-6 py-20 md:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Real traffic</div>
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-4xl font-medium tracking-tight md:text-5xl">Performance from your requests.</h2>
          {cpuReqs > 0 && (
            <div className="border border-flame-red/30 bg-flame-red/5 px-5 py-3">
              <div className="text-2xl font-medium text-flame-red">${saved < 0.01 ? "<$0.01" : "$" + saved.toFixed(2)}</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">saved vs cheapest cloud</div>
            </div>
          )}
        </div>

        {!rows ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="border border-border py-16 text-center text-sm text-muted-foreground">
            No request history yet. Send some chat requests to populate this table.
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_100px_80px_80px_80px_100px] gap-4 px-4 py-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <span>Model</span><span>Requests</span><span>Tok/s</span>
              <span>p50</span><span>p95</span><span>TTFB</span><span>Cost/1M</span>
            </div>

            {cpu.length > 0 && (
              <>
                <div className="bg-flame-red/5 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.15em] text-flame-red border-l-2 border-flame-red">
                  Self-hosted · CPU · $0 per request
                </div>
                {cpu.map((r) => <StatRow key={r.model} row={r} maxTps={maxTps} isCpu />)}
              </>
            )}

            {cloud.length > 0 && (
              <>
                <div className="mt-2 bg-muted px-4 py-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground border-l-2 border-border">
                  Cloud GPU · per-token billing
                </div>
                {cloud.map((r) => <StatRow key={r.model + r.provider} row={r} maxTps={maxTps} isCpu={false} />)}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function StatRow({ row, maxTps, isCpu }: { row: InferenceStats; maxTps: number; isCpu: boolean }) {
  const tps = Number(row.avg_tokens_per_sec ?? 0);
  const cost = isCpu ? "$0.00" : (CLOUD_COST[row.model] != null ? (CLOUD_COST[row.model] === 0 ? "free tier" : `$${CLOUD_COST[row.model].toFixed(2)}`) : "—");

  return (
    <div className="group border border-border hover:bg-muted/40 transition-colors">
      <div className="grid grid-cols-[1fr_80px_100px_80px_80px_80px_100px] items-center gap-4 px-4 py-4">
        <div>
          <div className="font-mono text-sm">{row.model}</div>
          <div className="text-[10px] text-muted-foreground">{BEST_FOR[row.provider] ?? row.provider}</div>
        </div>
        <div className="text-sm">{fmtNum(row.requests)}</div>
        <div>
          <div className="mb-1 text-sm font-medium">{tps > 0 ? tps.toFixed(1) + " t/s" : "—"}</div>
          {tps > 0 && (
            <div className="h-1 w-full bg-border">
              <div className={`h-full ${isCpu ? "bg-flame-red" : "bg-good"}`} style={{ width: `${Math.min((tps / maxTps) * 100, 100)}%` }} />
            </div>
          )}
        </div>
        <div className="text-sm text-muted-foreground">{ms(row.p50_ms)}</div>
        <div className="text-sm text-muted-foreground">{ms(row.p95_ms)}</div>
        <div className="text-sm text-muted-foreground">{ms(row.avg_ttfb_ms)}</div>
        <div className={`text-sm font-medium ${isCpu ? "text-good" : "text-muted-foreground"}`}>{cost}</div>
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
      .then(setData).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <section className="bg-ink px-6 py-20 text-cream md:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-cream/40">Ollama node</div>
        <div className="mb-10 flex items-end justify-between">
          <h2 className="text-4xl font-medium tracking-tight md:text-5xl">Self-hosted models.</h2>
          <button onClick={load} className="flex items-center gap-2 border border-cream/20 px-4 py-2 text-xs text-cream/60 hover:border-cream/40 hover:text-cream transition cursor-pointer">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-cream/30">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Running */}
            <div>
              <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cream/40">
                <span className="inline-block h-2 w-2 bg-good" /> Loaded in RAM
              </div>
              {!data || data.running.length === 0 ? (
                <div className="border border-cream/10 p-6 text-sm text-cream/30">
                  No models loaded. The first request to any model triggers a cold load (~2–5s), after which it stays in memory.
                </div>
              ) : data.running.map((m) => (
                <div key={m.name} className="flex items-center justify-between border border-cream/10 p-4 mb-2">
                  <div>
                    <div className="font-mono text-sm">{m.name}</div>
                    {m.expires_at && <div className="text-[10px] text-cream/30">unloads {new Date(m.expires_at).toLocaleTimeString()}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{fmtBytes(m.size)}</div>
                    <div className="text-[10px] text-good">ready</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Available */}
            <div>
              <div className="mb-4 text-[10px] uppercase tracking-[0.2em] text-cream/40">Available on disk</div>
              {!data || data.available.length === 0 ? (
                <div className="border border-cream/10 p-6 text-sm text-cream/30">No models pulled yet.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-cream/10 text-[10px] uppercase tracking-[0.15em] text-cream/30">
                      <th className="pb-3 pr-4 text-left font-normal">Model</th>
                      <th className="pb-3 pr-4 text-left font-normal">Size</th>
                      <th className="pb-3 text-left font-normal">Cost/1M</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.available.map((m) => (
                      <tr key={m.name} className="border-b border-cream/10">
                        <td className="py-3 pr-4 font-mono text-sm text-cream/80">{m.name}</td>
                        <td className="py-3 pr-4 text-sm text-cream/50">{fmtBytes(m.size)}</td>
                        <td className="py-3 text-sm font-medium text-flame-red">$0.00</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Benchmark ─────────────────────────────────────────────────────────────────

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
          try { setResults((p) => [...p, JSON.parse(line)]); } catch { /* */ }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message);
    } finally {
      setRunning(false); abortRef.current = null;
    }
  }

  const ok = results.filter((r) => !r.error);
  const avgTps = ok.length ? Math.round(ok.reduce((a, r) => a + (r.tokens_per_sec ?? 0), 0) / ok.length) : null;
  const avgLat = ok.length ? Math.round(ok.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / ok.length) : null;
  const avgTtfb = ok.length ? Math.round(ok.reduce((a, r) => a + (r.ttfb_ms ?? 0), 0) / ok.length) : null;
  const greenTps = isCpu ? 8 : 80;
  const maxResultTps = ok.length ? Math.max(...ok.map((r) => r.tokens_per_sec ?? 0), 1) : 1;

  return (
    <section className="px-6 py-20 md:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Live test</div>
        <h2 className="mb-10 text-4xl font-medium tracking-tight md:text-5xl">Run a benchmark.</h2>

        {/* Controls */}
        <div className="mb-8 flex flex-wrap items-end gap-4 border border-border p-5">
          <div className="flex-1 min-w-52">
            <Label>Model</Label>
            <Select className="w-full" value={modelKey} onChange={(e) => setModelKey(e.target.value)} disabled={running}>
              {MODEL_CATALOG.map((m) => (
                <option key={m.provider + "/" + m.model} value={m.provider + "/" + m.model}>{m.label}</option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <Label>Runs</Label>
            <Select className="w-full" value={String(runs)} onChange={(e) => setRuns(Number(e.target.value))} disabled={running}>
              {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>
          <div className="flex items-end gap-3">
            {running
              ? <Button variant="danger" onClick={() => abortRef.current?.abort()}>Stop</Button>
              : <Button onClick={runBenchmark}><Play className="h-3 w-3" /> Run</Button>}
            <div className={`border px-4 py-2 text-[10px] uppercase tracking-[0.1em] ${isCpu ? "border-flame-red/40 text-flame-red bg-flame-red/5" : "border-good/40 text-good bg-good/5"}`}>
              {isCpu ? "CPU · $0" : "Cloud GPU"}
            </div>
          </div>
        </div>

        {/* Summary */}
        {ok.length > 0 && (
          <div className="mb-8 grid grid-cols-3 gap-px bg-border">
            {[
              { v: avgTps != null ? avgTps + " t/s" : "—", l: "Avg tokens/sec", good: avgTps != null && avgTps >= greenTps },
              { v: avgLat != null ? avgLat + " ms" : "—", l: "Avg latency", good: avgLat != null && avgLat < 5000 },
              { v: avgTtfb != null ? avgTtfb + " ms" : "—", l: "Avg time to first token", good: avgTtfb != null && avgTtfb < 2000 },
            ].map((s) => (
              <div key={s.l} className="bg-surface p-6">
                <div className={`text-3xl font-medium tracking-tight ${s.good ? "text-good" : ""}`}>{s.v}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {results.length > 0 ? (
          <div className="space-y-1">
            {results.map((r) => (
              <div key={r.run} className={`border p-4 ${r.error ? "border-bad/30 bg-bad/5" : "border-border"}`}>
                {r.error ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">{r.prompt}</span>
                    <span className="text-xs text-bad">{r.error}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-[24px_1fr_72px_80px_72px] items-center gap-4">
                    <div className="text-[11px] text-muted-foreground">{r.run}</div>
                    <div>
                      <div className="mb-1.5 truncate font-mono text-xs text-muted-foreground">{r.prompt}</div>
                      <div className="h-1 w-full bg-border">
                        <div className={`h-full ${isCpu ? "bg-flame-red" : "bg-good"}`}
                          style={{ width: `${Math.min(((r.tokens_per_sec ?? 0) / maxResultTps) * 100, 100)}%` }} />
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">{r.ttfb_ms}ms TTFB</div>
                    <div className="text-right text-xs text-muted-foreground">{r.latency_ms}ms</div>
                    <div className={`text-right text-sm font-medium ${(r.tokens_per_sec ?? 0) >= greenTps ? "text-good" : "text-flame-red"}`}>
                      {r.tokens_per_sec} t/s
                    </div>
                  </div>
                )}
              </div>
            ))}
            {running && (
              <div className="border border-border p-4 text-center text-xs text-muted-foreground animate-pulse">
                Running {results.length + 1} of {runs}…
              </div>
            )}
          </div>
        ) : !running ? (
          <div className="border border-border py-16 text-center text-sm text-muted-foreground">
            {isCpu
              ? `CPU models score green at ≥${greenTps} t/s — viable for async pipelines.`
              : `Cloud GPU models score green at ≥${greenTps} t/s — required for realtime chat.`}
          </div>
        ) : null}
      </div>
    </section>
  );
}
