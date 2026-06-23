import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { api, authHeaders, MODEL_CATALOG } from "@/lib/api";

// ── types ─────────────────────────────────────────────────────────────────────

interface OllamaModel {
  name: string;
  size: number;
  digest?: string;
  expires_at?: string;
}

interface InferenceStats {
  model: string;
  provider: string;
  avg_tokens_per_sec: string | number | null;
  requests: string | number;
}

interface PullEvent {
  status?: string;
  completed?: number;
  total?: number;
  error?: string;
  digest?: string;
}

// ── static enrichment data ────────────────────────────────────────────────────

const PARAMS: Record<string, string> = {
  "smollm2:135m":  "135 M",
  "smollm2:360m":  "360 M",
  "qwen2.5:0.5b":  "500 M",
  "gemma3:1b":     "1 B",
  "llama3.2:1b":   "1 B",
  "gemma3:4b":     "4 B",
};

const BEST_FOR_CPU: Record<string, string> = {
  "smollm2:135m":  "Binary classification · keyword extraction · ultra-fast pipelines",
  "smollm2:360m":  "Sentiment · tagging · simple Q&A",
  "qwen2.5:0.5b":  "Structured JSON output · multilingual classification",
  "gemma3:1b":     "Summarisation · short-form generation · chat",
  "llama3.2:1b":   "Instruction following · RAG retrieval · general purpose",
  "gemma3:4b":     "Best CPU quality · complex reasoning · longer context",
};

const EST_TPS: Record<string, string> = {
  "smollm2:135m":  "60–100",
  "smollm2:360m":  "40–65",
  "qwen2.5:0.5b":  "28–40",
  "gemma3:1b":     "18–28",
  "llama3.2:1b":   "15–22",
  "gemma3:4b":     "6–10",
};

const CLOUD_META: Record<string, { costPerM: number; tps: string; bestFor: string; providerColor: string }> = {
  "llama-3.1-8b-instant":       { costPerM: 0.08,  tps: "~200",  bestFor: "Fastest cloud · realtime chat · prototyping",         providerColor: "#F55036" },
  "llama-3.3-70b-versatile":    { costPerM: 0.59,  tps: "~140",  bestFor: "Complex tasks · long context · high accuracy",        providerColor: "#F55036" },
  "mistral-small-latest":       { costPerM: 0.20,  tps: "~100",  bestFor: "Multilingual · code · function calling",              providerColor: "#FF7000" },
  "mistral-large-latest":       { costPerM: 6.00,  tps: "~80",   bestFor: "Advanced reasoning · agents · enterprise",            providerColor: "#FF7000" },
  "claude-haiku-4-5-20251001":  { costPerM: 1.25,  tps: "~120",  bestFor: "Fast structured output · classification at scale",    providerColor: "#CC785C" },
  "claude-3-5-sonnet-20241022": { costPerM: 15.00, tps: "~80",   bestFor: "Coding · analysis · long document reasoning",         providerColor: "#CC785C" },
  "gemini-2.0-flash":           { costPerM: 0.15,  tps: "~150",  bestFor: "Multimodal · 1M-token context · low cost cloud",      providerColor: "#4285F4" },
};

const TIER_STYLE: Record<string, string> = {
  small:    "border-green-400/40 text-green-700 bg-green-50",
  standard: "border-blue-400/40 text-blue-700 bg-blue-50",
  frontier: "border-amber-400/40 text-amber-700 bg-amber-50",
};

const fmtBytes = (b: number) =>
  b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(0) + " MB" : b + " B";

// ── page ──────────────────────────────────────────────────────────────────────

export function Models() {
  return (
    <div className="overflow-x-hidden">
      <HeroSection />
      <SelfHostedSection />
      <CloudSection />
      <PullSection />
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  const cpuCount  = MODEL_CATALOG.filter((m) => m.provider === "ollama").length;
  const cloudCount = MODEL_CATALOG.filter((m) => m.provider !== "ollama").length;

  return (
    <section className="min-h-[50vh] bg-ink px-8 py-16 text-cream md:px-16 flex flex-col justify-between">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-cream/30">
          OpenInference · Models
        </div>
        <h1 className="mt-3 text-[clamp(48px,7vw,88px)] font-medium leading-[1.02] tracking-[-0.03em]">
          Model catalogue.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-cream/50">
          Every model routable through the gateway. Self-hosted runs on your
          CPU at zero cost per token; cloud models are one API key away.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-2 gap-px bg-cream/8 sm:grid-cols-4">
        {[
          { v: String(cpuCount),  l: "Self-hosted models" },
          { v: String(cloudCount), l: "Cloud models" },
          { v: "$0",              l: "Cost / token (CPU)" },
          { v: "1 API",           l: "Unified endpoint" },
        ].map((s) => (
          <div key={s.l} className="bg-ink px-6 py-6">
            <div className="text-2xl font-semibold tracking-tight text-cream">{s.v}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-cream/30">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Self-hosted ───────────────────────────────────────────────────────────────

function SelfHostedSection() {
  const [running, setRunning] = useState<OllamaModel[]>([]);
  const [available, setAvailable] = useState<OllamaModel[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<{ running: OllamaModel[]; available: OllamaModel[] }>("/v1/admin/inference/models"),
      api<{ data: InferenceStats[] }>("/v1/admin/inference/stats"),
    ])
      .then(([models, perfData]) => {
        setRunning(models.running);
        setAvailable(models.available);
        const map: Record<string, number> = {};
        for (const row of perfData.data) {
          if (row.provider === "ollama") {
            map[row.model] = Number(row.avg_tokens_per_sec ?? 0);
          }
        }
        setStats(map);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const runningNames = new Set(running.map((m) => m.name));

  return (
    <section className="bg-surface px-8 py-16 md:px-16">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">CPU · $0 / token</div>
      <h2 className="mt-3 mb-10 text-[clamp(36px,5vw,60px)] font-medium leading-[1.05] tracking-[-0.03em]">
        Self-hosted models.
      </h2>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-px bg-border border border-border sm:grid-cols-2 lg:grid-cols-3">
          {available.map((m) => {
            const isLoaded = runningNames.has(m.name);
            const realTps  = stats[m.name];
            const estTps   = EST_TPS[m.name] ?? "—";
            const params   = PARAMS[m.name] ?? "—";
            const bestFor  = BEST_FOR_CPU[m.name] ?? "General purpose";
            const tpsLabel = realTps && realTps > 0
              ? `${realTps.toFixed(0)} t/s (live)`
              : `${estTps} t/s (est.)`;

            return (
              <div key={m.name} className="relative flex flex-col bg-surface p-7">
                {/* Status dot */}
                <div className="mb-5 flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${isLoaded ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {isLoaded ? "Loaded in RAM" : "On disk"}
                  </span>
                </div>

                {/* Name */}
                <div className="font-mono text-lg font-semibold tracking-tight">{m.name}</div>

                {/* Meta row */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{params} params</span>
                  <span>{fmtBytes(m.size)} on disk</span>
                </div>

                {/* Speed bar */}
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-[11px]">
                    <span className="uppercase tracking-[0.12em] text-muted-foreground">Speed</span>
                    <span className={`font-medium ${realTps && realTps > 0 ? "text-flame-red" : "text-muted-foreground"}`}>
                      {tpsLabel}
                    </span>
                  </div>
                  <div className="h-[2px] bg-border">
                    <div
                      className="h-[2px] bg-flame-red"
                      style={{
                        width: `${Math.min(
                          ((realTps && realTps > 0
                            ? realTps
                            : parseInt(estTps.split("–")[0] ?? "0")) / 100) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Best for */}
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground flex-1">{bestFor}</p>

                {/* Footer */}
                <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
                  <span className="text-sm font-semibold text-green-600">$0.00 / 1M tokens</span>
                  <Link
                    to="/playground"
                    className="text-xs uppercase tracking-[0.1em] text-muted-foreground hover:text-ink transition"
                  >
                    Test in Playground →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Cloud models ──────────────────────────────────────────────────────────────

function CloudSection() {
  const cloudModels = MODEL_CATALOG.filter((m) => m.provider !== "ollama");

  return (
    <section className="bg-ink px-8 py-16 text-cream md:px-16">
      <div className="text-[11px] uppercase tracking-[0.18em] text-cream/30">Cloud · per token billing</div>
      <h2 className="mt-3 mb-10 text-[clamp(36px,5vw,60px)] font-medium leading-[1.05] tracking-[-0.03em]">
        Cloud models.
      </h2>

      {/* Column headers */}
      <div className="mb-2 hidden grid-cols-[1fr_100px_80px_80px_1fr] items-center gap-5 text-[10px] uppercase tracking-[0.14em] text-cream/25 lg:grid">
        <span>Model</span>
        <span>Tier</span>
        <span className="text-right">Cost / 1M</span>
        <span className="text-right">Speed</span>
        <span>Best for</span>
      </div>

      <div className="divide-y divide-cream/8 border-t border-cream/8">
        {cloudModels.map((m) => {
          const meta = CLOUD_META[m.model];
          const providerLabel = m.provider.charAt(0).toUpperCase() + m.provider.slice(1);

          return (
            <div
              key={m.provider + m.model}
              className="grid grid-cols-1 gap-3 py-5 lg:grid-cols-[1fr_100px_80px_80px_1fr] lg:items-center lg:gap-5"
            >
              {/* Model name + provider */}
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: meta?.providerColor ?? "#888" }}
                  />
                  <span className="font-mono text-sm text-cream/90">{m.label}</span>
                </div>
                <div className="mt-0.5 pl-4 text-[11px] text-cream/35">{providerLabel}</div>
              </div>

              {/* Tier */}
              <div>
                <span className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${TIER_STYLE[m.tier]}`}>
                  {m.tier}
                </span>
              </div>

              {/* Cost */}
              <div className="text-right font-mono text-sm text-cream/70">
                {meta ? `$${meta.costPerM.toFixed(2)}` : "—"}
              </div>

              {/* Speed */}
              <div className="text-right font-mono text-sm text-cream/50">
                {meta?.tps ?? "—"} t/s
              </div>

              {/* Best for */}
              <div className="text-xs leading-relaxed text-cream/40">
                {meta?.bestFor ?? "—"}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-[11px] text-cream/25">
        Cost is output-token rate as of June 2026. Speed estimates at light load — varies by model size and provider infrastructure.
      </p>
    </section>
  );
}

// ── Pull a model ──────────────────────────────────────────────────────────────

const SUGGESTED = [
  { name: "phi4-mini:3.8b",   note: "Microsoft · 3.8B · strong reasoning for size" },
  { name: "mistral:7b",       note: "Mistral AI · 7B · best overall CPU quality" },
  { name: "llama3.2:3b",      note: "Meta · 3B · good balance of speed vs quality" },
  { name: "qwen2.5:1.5b",     note: "Alibaba · 1.5B · strong code + structured output" },
  { name: "tinyllama:1.1b",   note: "Community · 1.1B · extremely fast, older base" },
];

function PullSection() {
  const [input, setInput] = useState("");
  const [pulling, setPulling] = useState(false);
  const [events, setEvents] = useState<PullEvent[]>([]);
  const [done, setDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function pull(modelName: string) {
    const name = modelName.trim();
    if (!name) return;
    setInput(name);
    setEvents([]);
    setDone(false);
    setPulling(true);
    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      const res = await fetch("/v1/admin/inference/pull", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ model: name }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      for (;;) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data:\s?/, "").trim();
          if (!line || line === "[DONE]") { setDone(true); continue; }
          try { setEvents((p) => [...p.slice(-1), JSON.parse(line)]); } catch { /* */ }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message);
    } finally {
      setPulling(false);
      abortRef.current = null;
    }
  }

  const latest = events[events.length - 1];
  const pct = latest?.total ? Math.round((latest.completed ?? 0) / latest.total * 100) : null;

  return (
    <section className="min-h-[60vh] bg-surface px-8 py-16 md:px-16">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ollama · pull</div>
      <h2 className="mt-3 mb-10 text-[clamp(36px,5vw,60px)] font-medium leading-[1.05] tracking-[-0.03em]">
        Add a model.
      </h2>

      {/* Input */}
      <div className="flex flex-wrap items-stretch gap-0 border border-border max-w-2xl">
        <input
          className="flex-1 min-w-0 bg-cream px-5 py-3.5 font-mono text-sm text-ink placeholder:text-muted-foreground/50 outline-none"
          placeholder="gemma3:4b, phi4-mini, mistral:7b…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !pulling && pull(input)}
          disabled={pulling}
        />
        {pulling ? (
          <button
            className="border-l border-border bg-ink px-6 py-3.5 text-[13px] font-medium text-cream hover:bg-red-600 transition cursor-pointer"
            onClick={() => abortRef.current?.abort()}
          >
            Stop
          </button>
        ) : (
          <button
            className="border-l border-border bg-ink px-6 py-3.5 text-[13px] font-medium text-cream hover:bg-flame-red transition cursor-pointer disabled:opacity-40"
            onClick={() => pull(input)}
            disabled={!input.trim()}
          >
            Pull
          </button>
        )}
      </div>

      {/* Progress */}
      {(pulling || done) && (
        <div className="mt-4 max-w-2xl border border-border bg-cream p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{input}</span>
            {pct != null && (
              <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
            )}
          </div>
          {pct != null && (
            <div className="mb-3 h-[2px] bg-border">
              <div className="h-[2px] bg-flame-red transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {done
              ? <span className="font-medium text-green-600">Done — model is ready. Refresh to see it above.</span>
              : latest?.error
              ? <span className="text-red-500">{latest.error}</span>
              : latest?.status ?? "Starting…"}
          </div>
        </div>
      )}

      {/* Suggestions */}
      <div className="mt-10">
        <div className="mb-4 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Suggested models</div>
        <div className="grid grid-cols-1 gap-px bg-border border border-border sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
          {SUGGESTED.map((s) => (
            <button
              key={s.name}
              className="flex flex-col items-start bg-surface px-6 py-5 text-left hover:bg-muted/50 transition cursor-pointer disabled:opacity-50"
              onClick={() => pull(s.name)}
              disabled={pulling}
            >
              <span className="font-mono text-sm font-medium text-ink">{s.name}</span>
              <span className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.note}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
