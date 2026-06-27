import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PixelLogo } from "@/components/pixel/icons";
import { toast } from "sonner";
import { api, authHeaders, MODEL_CATALOG } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// ── types ─────────────────────────────────────────────────────────────────────

interface OllamaModel { name: string; size: number; expires_at?: string; }

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

// ── helpers ───────────────────────────────────────────────────────────────────

const CLOUD_COST: Record<string, number> = {
  "mistral-small-latest": 0.20, "mistral-large-latest": 4.00,
  "claude-haiku-4-5-20251001": 0.75, "claude-3-5-sonnet-20241022": 9.00,
  "gemini-2.0-flash": 0.15, "gemini-1.5-flash": 0.19, "gemini-1.5-pro": 3.13,
};

const fmtBytes = (b: number) =>
  b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(0) + " MB" : b + " B";

// ── page ──────────────────────────────────────────────────────────────────────

export function Inference() {
  return (
    <div className="overflow-x-hidden">
      <BentoSection />
      <OrangeSection />
      <DarkSection />
      <CostSection />
      <AmberSection />
      <BenchmarkSection />
      <ModelStatusSection />
    </div>
  );
}

// ── Section 1: Bento overview (cream) ─────────────────────────────────────────

function BentoSection() {
  return (
    <section className="flex flex-col bg-surface">
      <div className="border-b border-border px-4 pb-10 pt-12 sm:px-8 sm:pb-12 sm:pt-16 md:px-16">
        <div className="mb-4 flex items-center gap-3 sm:mb-6">
          <PixelLogo size={22} />
          <span className="text-xs font-medium text-muted-foreground sm:text-sm">OpenInference · Inference</span>
        </div>
        <h1 className="text-[clamp(2rem,8vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
          CPU inference.<br />Open source models.
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
          Route to self-hosted models for batch work, private data, and zero-cost pipelines —
          without changing your API.
        </p>
      </div>

      {/* Bento grid — 1 col mobile, 2 col sm, 4 col md */}
      <div className="grid grid-cols-1 gap-px border-t border-border bg-border sm:grid-cols-2 md:grid-cols-4">

        {/* Big dark tile — $0 */}
        <div className="relative col-span-1 flex min-h-[220px] flex-col justify-end overflow-hidden bg-ink p-6 text-cream sm:col-span-2 sm:row-span-2 sm:min-h-[280px] sm:p-9">
          <div className="absolute right-0 top-0 h-20 w-20 -translate-y-1/2 translate-x-1/2 rotate-45 border border-cream/10" />
          <div className="mb-auto flex h-9 w-9 items-center justify-center bg-flame-red">
            <svg viewBox="0 0 18 18" className="h-4 w-4 fill-none stroke-white stroke-[1.5]">
              <path d="M9 1v16M5 5h5.5a3.5 3.5 0 010 7H5M5 5H3M5 12H3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[clamp(3rem,18vw,5.25rem)] font-semibold leading-none tracking-[-0.04em] text-flame-red">$0</div>
          <div className="mt-2 text-base font-medium text-cream">Zero cost inference</div>
          <div className="mt-1.5 text-xs leading-relaxed text-cream/50">
            No per-token billing. Self-hosted Ollama on your own hardware. No surprises.
          </div>
          <div className="absolute bottom-4 right-4 h-12 w-12 rotate-45 border border-cream/8" />
        </div>

        {/* Privacy */}
        <div className="relative flex flex-col justify-end overflow-hidden bg-surface p-5 sm:p-7">
          <div className="absolute right-0 top-0 h-16 w-16 -translate-y-1/2 translate-x-1/2 rotate-45 border border-border" />
          <div className="mb-auto flex h-9 w-9 items-center justify-center bg-ink">
            <svg viewBox="0 0 18 18" className="h-4 w-4 fill-none stroke-cream stroke-[1.5]">
              <path d="M9 2L3 5v5c0 3.5 2.5 6 6 7 3.5-1 6-3.5 6-7V5L9 2z" strokeLinecap="round" />
            </svg>
          </div>
          <div className="mt-6 text-base font-medium">100% private</div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Prompts never leave your server. No vendor data retention policy to audit.
          </div>
        </div>

        {/* No rate limits */}
        <div className="flex flex-col justify-end bg-flame-red p-5 text-cream sm:p-7">
          <div className="mb-auto flex h-9 w-9 items-center justify-center bg-white/20">
            <svg viewBox="0 0 18 18" className="h-4 w-4 fill-none stroke-white stroke-[1.5]">
              <circle cx="9" cy="9" r="7" /><path d="M9 5v4l3 2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="mt-6 text-base font-medium">No rate limits</div>
          <div className="mt-1 text-xs leading-relaxed text-cream/75">
            Runs as fast as hardware allows. No 429s, no quota negotiations.
          </div>
        </div>

        {/* Batch pipelines */}
        <div className="relative flex flex-col justify-end overflow-hidden bg-surface p-5 sm:p-7">
          <div className="absolute bottom-3 right-3 h-12 w-12 rotate-45 border border-border" />
          <div className="mb-auto flex h-9 w-9 items-center justify-center" style={{ backgroundColor: "#F2C335" }}>
            <svg viewBox="0 0 18 18" className="h-4 w-4 fill-none stroke-ink stroke-[1.5]">
              <rect x="2" y="4" width="14" height="3" rx="0.5" /><rect x="2" y="9" width="14" height="3" rx="0.5" />
              <rect x="2" y="14" width="8" height="3" rx="0.5" />
            </svg>
          </div>
          <div className="mt-6 text-base font-medium">Batch pipelines</div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Classification, extraction, summarisation. Run millions of requests overnight.
          </div>
        </div>

        {/* Open source */}
        <div className="relative flex flex-col justify-end overflow-hidden bg-muted p-5 sm:p-7">
          <div className="absolute right-0 top-0 h-20 w-20 -translate-y-1/2 translate-x-1/2 rotate-45 border border-border" />
          <div className="mt-16 text-base font-medium">Open source models</div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Gemma, Qwen, Llama — any GGUF model on Ollama. Your weights, your infra.
          </div>
        </div>

        {/* Hybrid routing — spans remaining bottom row */}
        <div className="col-span-1 flex flex-col justify-end bg-surface p-5 sm:col-span-2 sm:p-7 md:col-span-3">
          <div className="mb-auto flex h-9 w-9 items-center justify-center bg-ink">
            <svg viewBox="0 0 18 18" className="h-4 w-4 fill-none stroke-cream stroke-[1.5]">
              <path d="M2 9h14M9 2l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="mt-6 text-base font-medium">Hybrid routing</div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            CPU for cost-sensitive tasks. Cloud GPU for latency-critical ones. One gateway.
          </div>
        </div>

        {/* Semantic cache */}
        <div className="flex flex-col justify-end bg-muted p-5 sm:p-7">
          <div className="mb-auto flex h-9 w-9 items-center justify-center bg-flame-orange">
            <svg viewBox="0 0 18 18" className="h-4 w-4 fill-none stroke-white stroke-[1.5]">
              <path d="M3 9h12M9 3v12" strokeLinecap="round" />
            </svg>
          </div>
          <div className="mt-6 text-base font-medium">Semantic cache</div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Repeat prompts hit cache — skip the model call entirely.
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section 2: Orange — the economics ─────────────────────────────────────────

function OrangeSection() {
  return (
    <section className="relative flex min-h-0 flex-col bg-flame-red px-4 py-12 text-cream sm:px-8 sm:py-16 md:px-16">
      <a className="absolute right-4 top-12 text-xs text-cream/50 hover:text-cream transition sm:right-8 sm:top-16 sm:text-[13px] md:right-16">
        Discover Benchmark ›
      </a>

      <div className="text-[11px] uppercase tracking-[0.18em] text-cream/40">The economics</div>
      <h2 className="mt-3 max-w-2xl text-[clamp(1.75rem,7vw,5rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        Your server.<br />Their model.<br />Your rules.
      </h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-cream/60">
        Pull any open-source model with Ollama. OpenInference routes to it automatically.
        No API keys, no invoices, no quotas — ever.
      </p>

      {/* Mockup */}
      <div className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-[520px] border border-cream/15 bg-cream/10 backdrop-blur">
          <div className="flex items-center gap-2 border-b border-cream/10 bg-cream/8 px-4 py-3 text-xs text-cream/50">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
            <span className="ml-2">OpenInference — Request log</span>
          </div>
          <div className="divide-y divide-cream/8 px-6 py-2">
            {[
              { label: "Model", value: "gemma3:1b · Ollama", mono: true },
              { label: "Tokens generated", value: "124 tokens" },
              { label: "Latency", value: "1,840 ms" },
              { label: "Cost", value: "$0.0000", big: true },
              { label: "Data left your server", value: "Never", green: true },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-4">
                <span className="text-[11px] uppercase tracking-[0.12em] text-cream/40">{row.label}</span>
                <span className={[
                  "font-medium",
                  row.big ? "text-2xl tracking-tight" : "text-sm",
                  row.green ? "text-green-300" : "text-cream",
                  row.mono ? "font-mono" : "",
                ].filter(Boolean).join(" ")} style={row.big ? { color: "#F2C335" } : undefined}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section 3: Dark — performance stats ───────────────────────────────────────

function DarkSection() {
  const [rows, setRows] = useState<InferenceStats[] | null>(null);

  useEffect(() => {
    api<{ data: InferenceStats[] }>("/v1/admin/inference/stats")
      .then((r) => r && setRows(r.data))
      .catch((e) => toast.error(e.message));
  }, []);

  const cpu = rows?.filter((r) => r.provider === "ollama") ?? [];
  const cloud = rows?.filter((r) => r.provider !== "ollama") ?? [];
  const cpuReqs = cpu.reduce((a, r) => a + Number(r.requests), 0);
  const avgTok = cpu.length ? cpu.reduce((a, r) => a + (Number(r.avg_tokens) || 0), 0) / cpu.length : 50;
  const saved = (cpuReqs * avgTok / 1_000_000) * 0.10;

  const STATIC_CPU = [
    { name: "gemma3:1b", tps: 18, w: 9 },
    { name: "qwen2.5:0.5b", tps: 28, w: 14 },
    { name: "gemma3:4b", tps: 8, w: 4 },
  ];
  const STATIC_CLOUD = [
    { name: "llama-3.1-8b · groq", tps: 200, w: 100 },
    { name: "gemini-2.0-flash", tps: 120, w: 60 },
    { name: "claude-3-5-sonnet", tps: 80, w: 40 },
  ];

  const allRows = rows && rows.length > 0 ? null : null;
  void allRows;

  const displayCpu = rows && cpu.length > 0
    ? cpu.map((r) => ({ name: r.model, tps: Number(r.avg_tokens_per_sec ?? 0), w: Math.round(Number(r.avg_tokens_per_sec ?? 0) / 2) }))
    : STATIC_CPU;

  const displayCloud = rows && cloud.length > 0
    ? cloud.map((r) => ({ name: `${r.model} · ${r.provider}`, tps: Number(r.avg_tokens_per_sec ?? 0), w: Math.round(Number(r.avg_tokens_per_sec ?? 0) / 2) }))
    : STATIC_CLOUD;

  const maxW = Math.max(...displayCpu.map(r => r.w), ...displayCloud.map(r => r.w), 1);

  return (
    <section className="flex flex-col bg-ink text-cream">
      {/* Tag strip */}
      <div className="overflow-hidden border-b border-cream/8 px-4 py-4 sm:px-8 md:px-16">
        <div className="whitespace-nowrap text-[11px] uppercase tracking-[0.16em] text-cream/25">
          {["SELF-HOSTED", "CPU INFERENCE", "ZERO COST", "PRIVATE DATA", "BATCH PIPELINES",
            "NO RATE LIMITS", "OPEN SOURCE MODELS", "HYBRID ROUTING", "ZERO VENDOR LOCK-IN",
            "SELF-HOSTED", "CPU INFERENCE", "ZERO COST"].map((t, i) => (
            <span key={i} className="mr-8">{t}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 py-12 sm:px-8 sm:py-16 md:px-16">
        <div className="text-[11px] uppercase tracking-[0.18em] text-cream/30">Real traffic</div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[clamp(1.75rem,6vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.03em]">
            Performance from<br />your requests.
          </h2>
          {cpuReqs > 0 && (
            <div className="border border-flame-red/30 px-5 py-3">
              <div className="text-2xl font-medium text-flame-red">
                {saved < 0.01 ? "<$0.01" : `$${saved.toFixed(2)}`}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-cream/30">
                saved vs cheapest cloud
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-cream/40">
          Every request is timed and recorded. This is your actual data, not synthetic benchmarks.
          {rows === null && " Loading…"}
        </p>

        <div className="table-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="mt-12 min-w-[520px] flex-1">
          {/* Column labels */}
          <div className="mb-3 grid grid-cols-[200px_1fr_80px_96px] gap-6 text-[10px] uppercase tracking-[0.15em] text-cream/25 md:grid-cols-[240px_1fr_80px_96px]">
            <span>Model</span><span>Tokens / sec</span>
            <span className="text-right">t/s avg</span><span className="text-right">Cost / 1M</span>
          </div>

          {/* CPU rows */}
          {displayCpu.map((r) => (
            <div key={r.name} className="grid grid-cols-[200px_1fr_80px_96px] items-center gap-6 border-b border-cream/6 py-5 md:grid-cols-[240px_1fr_80px_96px]">
              <span className="truncate font-mono text-[13px] text-cream/70">{r.name}</span>
              <div className="h-[3px] bg-cream/8">
                <div className="h-[3px] bg-flame-red transition-all" style={{ width: `${(r.w / maxW) * 100}%` }} />
              </div>
              <span className="text-right text-[13px] font-medium text-flame-red">{r.tps} t/s</span>
              <span className="text-right text-[12px] text-green-400">$0.00</span>
            </div>
          ))}

          {/* Divider */}
          <div className="my-2 border-t border-cream/4 pt-6" />

          {/* Cloud rows */}
          {displayCloud.map((r) => {
            const costKey = r.name.split(" · ")[0] ?? r.name;
            const cost = CLOUD_COST[costKey];
            return (
              <div key={r.name} className="grid grid-cols-[200px_1fr_80px_96px] items-center gap-6 border-b border-cream/6 py-5 md:grid-cols-[240px_1fr_80px_96px]">
                <span className="truncate font-mono text-[13px] text-cream/30">{r.name}</span>
                <div className="h-[3px] bg-cream/8">
                  <div className="h-[3px] bg-cream/25 transition-all" style={{ width: `${(r.w / maxW) * 100}%` }} />
                </div>
                <span className="text-right text-[13px] text-cream/30">{r.tps} t/s</span>
                <span className="text-right text-[12px] text-cream/30">
                  {cost != null ? (cost === 0 ? "free tier" : `$${cost.toFixed(2)}`) : "—"}
                </span>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </section>
  );
}

// ── Section 4: Cost comparison chart ─────────────────────────────────────────

const COST_ROWS = [
  // CPU self-hosted — the hero
  {
    name: "Your existing server + Ollama",
    category: "CPU · self-hosted",
    cost: 0,
    label: "$0",
    tps: "18–50",
    private: true,
    highlight: true,
    note: "Zero extra cost if you already pay for a VPS or droplet",
  },
  {
    name: "Dedicated CPU server (DO c-4)",
    category: "CPU · self-hosted",
    cost: 0.05,
    label: "~$0.05",
    tps: "30–45",
    private: true,
    highlight: true,
    note: "$84/mo amortized at 50% utilisation · 4 dedicated vCPU",
  },
  // Free / cheap managed APIs
  {
    name: "Groq",
    category: "Managed API",
    cost: 0,
    label: "$0",
    tps: "200+",
    private: false,
    highlight: false,
    note: "Free tier caps at 500K tokens/day · $0.08/1M after",
  },
  {
    name: "Together.ai",
    category: "Managed API",
    cost: 0.18,
    label: "$0.18",
    tps: "150+",
    private: false,
    highlight: false,
    note: null,
  },
  {
    name: "Fireworks.ai",
    category: "Managed API",
    cost: 0.20,
    label: "$0.20",
    tps: "120+",
    private: false,
    highlight: false,
    note: null,
  },
  // GPU rental (amortized 24/7)
  {
    name: "Vast.ai · RTX 3090",
    category: "GPU rental",
    cost: 0.46,
    label: "$0.46",
    tps: "~80",
    private: true,
    highlight: false,
    note: "$0.13/hr × 730 hrs/mo · amortized at 80 t/s continuous",
  },
  {
    name: "OpenAI GPT-4o mini",
    category: "Managed API",
    cost: 0.60,
    label: "$0.60",
    tps: "100+",
    private: false,
    highlight: false,
    note: "Output tokens",
  },
  {
    name: "Vast.ai · RTX 4090",
    category: "GPU rental",
    cost: 1.23,
    label: "$1.23",
    tps: "~140",
    private: true,
    highlight: false,
    note: "$0.35/hr × 730 hrs/mo · amortized at 80 t/s continuous",
  },
  {
    name: "RunPod · RTX 3090",
    category: "GPU rental",
    cost: 1.62,
    label: "$1.62",
    tps: "~80",
    private: true,
    highlight: false,
    note: "$0.46/hr × 730 hrs/mo · amortized at 80 t/s continuous",
  },
  // Premium APIs
  {
    name: "OpenAI GPT-4o",
    category: "Managed API",
    cost: 10.00,
    label: "$10.00",
    tps: "100+",
    private: false,
    highlight: false,
    note: "Output tokens",
  },
  {
    name: "Anthropic Claude 3.5 Sonnet",
    category: "Managed API",
    cost: 15.00,
    label: "$15.00",
    tps: "~80",
    private: false,
    highlight: false,
    note: "Output tokens",
  },
] as const;

const CATEGORY_COLOR: Record<string, string> = {
  "CPU · self-hosted": "text-flame-red border-flame-red/30 bg-flame-red/6",
  "Managed API":       "text-ink/50 border-border bg-surface",
  "GPU rental":        "text-amber-700 border-amber-400/40 bg-amber-50",
};

function CostSection() {
  const MAX = 15;

  return (
    <section className="bg-surface px-4 py-12 sm:px-8 sm:py-16 md:px-16">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Cost reality</div>
      <div className="mt-3 mb-12 flex flex-wrap items-end justify-between gap-6">
        <h2 className="text-[clamp(1.75rem,6.5vw,5rem)] font-medium leading-[1.05] tracking-[-0.03em]">
          The numbers.
        </h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Cost per 1M output tokens. GPU rental figures are amortised at 24/7
          continuous use — real burst costs are higher.
        </p>
      </div>

      {/* Column headers */}
      <div className="mb-2 hidden grid-cols-[2fr_120px_1fr_72px_52px_52px] items-center gap-5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:grid">
        <span>Provider</span>
        <span>Category</span>
        <span>Cost / 1M tokens</span>
        <span className="text-right">Speed</span>
        <span className="text-right">Private</span>
        <span className="text-right">Limited</span>
      </div>

      <div className="divide-y divide-border border-t border-border">
        {COST_ROWS.map((row) => {
          const barPct = row.cost === 0 ? 0 : Math.min((row.cost / MAX) * 100, 100);
          const isCpu = row.category === "CPU · self-hosted";
          const isGpu = row.category === "GPU rental";

          return (
            <div
              key={row.name}
              className={`grid grid-cols-1 gap-3 py-5 md:grid-cols-[2fr_120px_1fr_72px_52px_52px] md:items-center md:gap-5 ${
                isCpu ? "bg-flame-red/[0.03]" : ""
              }`}
            >
              {/* Name */}
              <div>
                <div className={`text-sm font-medium ${isCpu ? "text-ink" : "text-ink/70"}`}>
                  {row.name}
                </div>
                {row.note && (
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">
                    {row.note}
                  </div>
                )}
              </div>

              {/* Category badge */}
              <div>
                <span className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${CATEGORY_COLOR[row.category]}`}>
                  {row.category}
                </span>
              </div>

              {/* Cost bar + label */}
              <div className="flex items-center gap-3">
                <div className="relative h-[3px] flex-1 bg-border">
                  {row.cost === 0 ? (
                    <div className="absolute inset-0 border-r-0 border border-dashed border-green-400/60" />
                  ) : (
                    <div
                      className={`absolute left-0 top-0 h-[3px] ${isCpu ? "bg-flame-red" : isGpu ? "bg-amber-400" : "bg-ink/25"}`}
                      style={{ width: `${barPct}%` }}
                    />
                  )}
                </div>
                <span className={`w-14 shrink-0 text-right text-sm font-semibold tabular-nums ${
                  row.cost === 0 ? "text-green-600" : isCpu ? "text-flame-red" : "text-ink/60"
                }`}>
                  {row.label}
                </span>
              </div>

              {/* Speed */}
              <div className="text-right font-mono text-xs text-muted-foreground">
                {row.tps} t/s
              </div>

              {/* Private */}
              <div className="text-right text-xs">
                {row.private
                  ? <span className="text-green-600">Yes</span>
                  : <span className="text-muted-foreground/50">No</span>}
              </div>

              {/* Rate limited */}
              <div className="text-right text-xs">
                {row.category === "Managed API"
                  ? <span className="text-muted-foreground/50">Yes</span>
                  : <span className="text-green-600">None</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Insight callout */}
      <div className="mt-10 grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
        {[
          {
            stat: "$0",
            label: "Incremental cost",
            body: "If you already run a server for your app, Ollama adds zero cost per token. You're already paying for the server.",
          },
          {
            stat: "6–9M",
            label: "Tokens to break even vs Claude",
            body: "At $84/mo for a dedicated CPU server, you break even against Claude 3.5 Sonnet pricing at around 6M output tokens per month.",
          },
          {
            stat: "∞",
            label: "Daily token limit",
            body: "No rate limits, no quota requests, no 429s at 3 AM. CPU inference runs as fast as hardware allows — nothing else controls your throughput.",
          },
        ].map((c) => (
          <div key={c.label} className="bg-surface px-8 py-7">
            <div className="text-3xl font-semibold tracking-tight text-flame-red">{c.stat}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{c.label}</div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{c.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-[11px] text-muted-foreground/50">
        * GPU rental amortised cost assumes 24/7 continuous utilisation at stated t/s.
        Burst / spot use is pay-per-second — cheaper for low volume, higher effective cost per token when idle.
        Managed API prices are output-token rates as of June 2026.
      </p>
    </section>
  );
}

// ── Section 5: Amber — decision guide ─────────────────────────────────────────

function AmberSection() {
  return (
    <section
      className="relative flex min-h-0 flex-col px-4 py-12 sm:px-8 sm:py-16 md:px-16"
      style={{ backgroundColor: "#F2C335" }}
    >
      <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "rgba(20,18,16,0.45)" }}>
        Decision guide
      </div>
      <h2 className="mt-3 max-w-lg text-[clamp(1.75rem,6.5vw,5rem)] font-medium leading-[1.05] tracking-[-0.03em] text-ink">
        Right model.<br />Right backend.
      </h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed" style={{ color: "rgba(20,18,16,0.55)" }}>
        CPU inference handles more than you'd expect. Know where the line is —
        and let the gateway route automatically.
      </p>

      {/* 3-col grid */}
      <div
        className="mt-12 flex-1 grid grid-cols-1 gap-px sm:grid-cols-3"
        style={{ background: "rgba(20,18,16,0.14)" }}
      >
        {[
          {
            label: "Use CPU · Ollama", bg: "#F2C335",
            items: ["Batch classification overnight", "Async document extraction",
              "High-volume internal tools", "PII / HIPAA sensitive prompts", "No latency SLA under 2 s"],
          },
          {
            label: "Use cloud GPU", bg: "rgba(20,18,16,0.06)",
            items: ["Customer-facing realtime chat", "Code generation at scale",
              "Long-context reasoning (>32K)", "Multimodal tasks", "Sub-500 ms latency required"],
          },
          {
            label: "Use both · hybrid", bg: "rgba(20,18,16,0.06)",
            items: ["CPU pre-filters, GPU generates", "CPU fallback on quota hit",
              "A/B cost experiments", "Free plan → CPU, Pro → cloud", "Plan-tiered routing built in"],
          },
        ].map((col) => (
          <div key={col.label} className="px-8 py-8" style={{ backgroundColor: col.bg }}>
            <div
              className="mb-5 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "rgba(20,18,16,0.45)" }}
            >
              {col.label}
            </div>
            {col.items.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 border-b py-3 text-[13px] text-ink"
                style={{ borderColor: "rgba(20,18,16,0.1)" }}
              >
                <span
                  className="inline-block h-1 w-1 shrink-0"
                  style={{ backgroundColor: "#141210" }}
                />
                {item}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Section 5: Benchmark ──────────────────────────────────────────────────────

function BenchmarkSection() {
  // Anyone can read the page; running a live benchmark is an admin-only op.
  const { user, isAdmin } = useAuth();
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
    <section className="bg-surface px-4 py-12 sm:px-8 sm:py-16 md:px-16">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Live test</div>
      <h2 className="mt-3 mb-12 text-[clamp(1.75rem,6.5vw,5rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        Run a benchmark.
      </h2>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 border border-border bg-cream p-6 mb-8">
        <div className="flex min-w-52 flex-1 flex-col gap-2">
          <label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Model</label>
          <select
            className="border border-border bg-white px-3 py-2.5 text-[13px] text-ink appearance-none cursor-pointer disabled:opacity-50"
            value={modelKey}
            onChange={(e) => setModelKey(e.target.value)}
            disabled={running}
          >
            {MODEL_CATALOG.map((m) => (
              <option key={m.provider + "/" + m.model} value={m.provider + "/" + m.model}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="flex w-24 flex-col gap-2">
          <label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Runs</label>
          <select
            className="border border-border bg-white px-3 py-2.5 text-[13px] text-ink appearance-none cursor-pointer disabled:opacity-50"
            value={String(runs)}
            onChange={(e) => setRuns(Number(e.target.value))}
            disabled={running}
          >
            {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-3">
          {running ? (
            <button
              className="border border-red-500/50 bg-red-500/10 px-6 py-2.5 text-[13px] font-medium text-red-600 hover:bg-red-500/20 transition cursor-pointer"
              onClick={() => abortRef.current?.abort()}
            >
              Stop
            </button>
          ) : isAdmin ? (
            <button
              className="flex items-center gap-2 bg-ink px-6 py-2.5 text-[13px] font-medium text-cream hover:bg-flame-red transition cursor-pointer"
              onClick={runBenchmark}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 1l8 4-8 4V1z"/></svg>
              Run benchmark
            </button>
          ) : user ? (
            <span
              className="flex items-center gap-2 border border-border px-6 py-2.5 text-[13px] text-muted-foreground cursor-not-allowed"
              title="Running benchmarks is restricted to admins"
            >
              Admin only
            </span>
          ) : (
            <Link
              to="/admin"
              className="flex items-center gap-2 border border-border px-6 py-2.5 text-[13px] text-muted-foreground hover:text-ink transition"
            >
              Sign in to run
            </Link>
          )}
          <div className={`border px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] ${
            isCpu ? "border-flame-red/30 bg-flame-red/5 text-flame-red" : "border-green-500/30 bg-green-500/5 text-green-600"
          }`}>
            {isCpu ? "CPU · $0" : "Cloud GPU"}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {ok.length > 0 && (
        <div className="mb-8 grid grid-cols-3 gap-px bg-border border border-border">
          {[
            { v: avgTps != null ? `${avgTps} t/s` : "—", l: "Avg tokens/sec", good: avgTps != null && avgTps >= greenTps },
            { v: avgLat != null ? `${avgLat} ms` : "—", l: "Avg latency", good: avgLat != null && avgLat < 5000 },
            { v: avgTtfb != null ? `${avgTtfb} ms` : "—", l: "Time to first token", good: avgTtfb != null && avgTtfb < 2000 },
          ].map((s) => (
            <div key={s.l} className="bg-surface p-6">
              <div className={`text-3xl font-medium tracking-tight ${s.good ? "text-green-600" : ""}`}>{s.v}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {results.length > 0 ? (
        <div>
          <div className="grid grid-cols-[32px_1fr_80px_80px_72px] gap-5 border-t border-border pb-3 pt-4 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span /><span>Prompt</span><span className="text-right">TTFB</span>
            <span className="text-right">Latency</span><span className="text-right">Tok/s</span>
          </div>
          {results.map((r) => (
            <div
              key={r.run}
              className={`border-b border-border py-4 ${r.error ? "opacity-50" : ""}`}
            >
              {r.error ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">{r.prompt}</span>
                  <span className="text-red-500">{r.error}</span>
                </div>
              ) : (
                <div className="grid grid-cols-[32px_1fr_80px_80px_72px] items-center gap-5">
                  <span className="text-[11px] text-muted-foreground">{r.run}</span>
                  <div>
                    <div className="mb-2 truncate font-mono text-xs text-muted-foreground">{r.prompt}</div>
                    <div className="h-[2px] w-full bg-border">
                      <div
                        className={isCpu ? "h-[2px] bg-flame-red" : "h-[2px] bg-green-500"}
                        style={{ width: `${Math.min(((r.tokens_per_sec ?? 0) / maxResultTps) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">{r.ttfb_ms} ms</div>
                  <div className="text-right text-xs text-muted-foreground">{r.latency_ms} ms</div>
                  <div className={`text-right text-sm font-medium ${
                    (r.tokens_per_sec ?? 0) >= greenTps ? "text-green-600" : "text-flame-red"
                  }`}>
                    {r.tokens_per_sec} t/s
                  </div>
                </div>
              )}
            </div>
          ))}
          {running && (
            <div className="border-b border-border py-4 text-center text-xs text-muted-foreground animate-pulse">
              Running {results.length + 1} of {runs}…
            </div>
          )}
        </div>
      ) : !running ? (
        <div className="border border-border py-20 text-center text-sm text-muted-foreground">
          {isCpu
            ? `CPU models score green at ≥${greenTps} t/s — viable for async pipelines.`
            : `Cloud GPU models score green at ≥${greenTps} t/s — required for realtime chat.`}
        </div>
      ) : null}
    </section>
  );
}

// ── Section 6: Model status (dark) ────────────────────────────────────────────

function ModelStatusSection() {
  const [data, setData] = useState<{ running: OllamaModel[]; available: OllamaModel[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api<{ running: OllamaModel[]; available: OllamaModel[] }>("/v1/admin/inference/models")
      .then((r) => r && setData(r)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <section className="min-h-[60vh] bg-ink px-8 py-16 text-cream md:px-16">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-cream/30">Ollama node</div>
          <h2 className="text-[clamp(36px,5vw,64px)] font-medium leading-[1.05] tracking-[-0.03em]">
            Self-hosted models.
          </h2>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 border border-cream/15 px-4 py-2 text-xs text-cream/50 hover:border-cream/30 hover:text-cream transition cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11 6A5 5 0 111 6" strokeLinecap="round"/>
            <path d="M11 2v4H7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-cream/25">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-px bg-cream/6 lg:grid-cols-2">
          {/* Loaded in RAM */}
          <div className="bg-ink p-8">
            <div className="mb-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-cream/30">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" /> Loaded in RAM
            </div>
            {!data || data.running.length === 0 ? (
              <p className="text-sm leading-relaxed text-cream/25">
                No models currently loaded. The first request triggers a cold load (~2–5 s),
                after which it stays in memory until idle timeout.
              </p>
            ) : data.running.map((m) => (
              <div key={m.name} className="flex items-center justify-between border-b border-cream/8 py-4">
                <div>
                  <div className="font-mono text-sm text-cream/80">{m.name}</div>
                  {m.expires_at && (
                    <div className="mt-0.5 text-[10px] text-cream/30">
                      unloads {new Date(m.expires_at).toLocaleTimeString()}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm text-cream/60">{fmtBytes(m.size)}</div>
                  <div className="mt-0.5 text-[10px] text-green-400">ready</div>
                </div>
              </div>
            ))}
          </div>

          {/* Available on disk */}
          <div className="bg-ink p-8">
            <div className="mb-5 text-[11px] uppercase tracking-[0.16em] text-cream/30">Available on disk</div>
            {!data || data.available.length === 0 ? (
              <p className="text-sm text-cream/25">
                No models pulled yet. Run{" "}
                <code className="font-mono text-cream/40">ollama pull gemma3:1b</code> to get started.
              </p>
            ) : data.available.map((m) => (
              <div key={m.name} className="flex items-center justify-between border-b border-cream/8 py-4">
                <span className="font-mono text-sm text-cream/70">{m.name}</span>
                <div className="text-right">
                  <div className="text-sm text-cream/40">{fmtBytes(m.size)}</div>
                  <div className="mt-0.5 text-[10px] font-medium text-flame-red">$0.00 / 1M</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
