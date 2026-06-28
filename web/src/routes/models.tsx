import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PixelLogo } from "@/components/pixel/icons";
import { toast } from "sonner";
import { api, authHeaders, MODEL_CATALOG } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LocalOiCatalog } from "@/components/LocalOiCatalog";
import { OI_CATALOG } from "@/lib/oi-catalog";

// ── types ─────────────────────────────────────────────────────────────────────

interface OllamaModel { name: string; size: number; expires_at?: string; }
interface InferenceStats {
  model: string; provider: string;
  avg_tokens_per_sec: string | number | null; requests: string | number;
}
interface PullEvent {
  status?: string; completed?: number; total?: number; error?: string;
}

// ── static enrichment ─────────────────────────────────────────────────────────

const MODEL_META: Record<string, {
  params: string; estTps: string; bestFor: string;
}> = {
  // under 1 GB
  "smollm2:135m":     { params: "135 M", estTps: "60–100", bestFor: "Binary classification · keyword extraction · ultra-fast batch" },
  "smollm2:360m":     { params: "360 M", estTps: "40–65",  bestFor: "Sentiment · multi-label tagging · simple Q&A" },
  "qwen2.5:0.5b":     { params: "500 M", estTps: "28–40",  bestFor: "Structured JSON output · multilingual classification" },
  "qwen2.5:1.5b":     { params: "1.5 B", estTps: "18–28",  bestFor: "Data extraction · structured output · code tasks" },
  "gemma3:1b":        { params: "1 B",   estTps: "18–28",  bestFor: "Summarisation · short-form generation · general chat" },
  // 1–2 GB
  "deepseek-r1:1.5b": { params: "1.5 B", estTps: "12–20",  bestFor: "Step-by-step reasoning · math · logic with chain-of-thought" },
  "llama3.2:1b":      { params: "1 B",   estTps: "15–22",  bestFor: "Instruction following · RAG retrieval · general purpose" },
  "gemma2:2b":        { params: "2 B",   estTps: "10–16",  bestFor: "Google's 2B · general chat · balanced quality vs speed" },
  "smollm2:1.7b":     { params: "1.7 B", estTps: "12–18",  bestFor: "Better SmolLM quality · chat · summarisation" },
  "qwen2.5:3b":       { params: "3 B",   estTps: "8–14",   bestFor: "Code generation · complex structured output · 3B quality" },
  // 2–3 GB
  "llama3.2:3b":      { params: "3 B",   estTps: "8–12",   bestFor: "Meta's best small model · instruction following · agents" },
  "phi3.5:latest":    { params: "3.8 B", estTps: "6–10",   bestFor: "Microsoft · strong reasoning · code · efficient for size" },
  // over 3 GB
  "gemma3:4b":        { params: "4 B",   estTps: "6–10",   bestFor: "Best CPU quality · complex reasoning · longer context" },
};

const CLOUD_META: Record<string, {
  costPerM: number; tps: string; bestFor: string; color: string;
}> = {
  "llama-3.1-8b-instant":       { costPerM: 0.08,  tps: "~200", color: "#F55036", bestFor: "Fastest cloud · realtime chat · prototyping" },
  "llama-3.3-70b-versatile":    { costPerM: 0.59,  tps: "~140", color: "#F55036", bestFor: "Complex reasoning · long context · high accuracy" },
  "mistral-small-latest":       { costPerM: 0.20,  tps: "~100", color: "#FF7000", bestFor: "Multilingual · code · function calling" },
  "mistral-large-latest":       { costPerM: 6.00,  tps: "~80",  color: "#FF7000", bestFor: "Advanced reasoning · agents · enterprise" },
  "claude-haiku-4-5-20251001":  { costPerM: 1.25,  tps: "~120", color: "#CC785C", bestFor: "Fast structured output · classification at scale" },
  "claude-3-5-sonnet-20241022": { costPerM: 15.00, tps: "~80",  color: "#CC785C", bestFor: "Coding · analysis · long document reasoning" },
  "gemini-2.0-flash":           { costPerM: 0.15,  tps: "~150", color: "#4285F4", bestFor: "Multimodal · 1M-token context · low-cost cloud" },
};

const TIER_STYLE: Record<string, string> = {
  small:    "border-good/40 text-good bg-good/10",
  standard: "border-flame-orange/40 text-flame-deep bg-flame-orange/10",
  frontier: "border-flame-amber/40 text-flame-deep bg-flame-amber/10",
};

// ── picker tasks ──────────────────────────────────────────────────────────────

interface PickTask {
  label: string;
  icon: string;
  description: string;
  recommendation: {
    model: string;
    provider: string;
    reason: string;
    alt?: { model: string; provider: string; why: string };
  };
}

const PICK_TASKS: PickTask[] = [
  {
    label: "Fast batch classification",
    icon: "⚡",
    description: "Millions of rows labelled overnight — yes/no, category, sentiment",
    recommendation: {
      model: "smollm2:135m", provider: "ollama",
      reason: "60–100 t/s on CPU at $0/token. Fast enough to process 500K rows overnight on a $48/mo server.",
      alt: { model: "smollm2:360m", provider: "ollama", why: "Better accuracy on harder labels, still 40–65 t/s" },
    },
  },
  {
    label: "Extract structured data",
    icon: "🗂",
    description: "Pull fields out of documents into JSON — invoices, emails, logs",
    recommendation: {
      model: "qwen2.5:1.5b", provider: "ollama",
      reason: "Qwen models are purpose-built for structured output. The 1.5B hits the sweet spot of accuracy vs speed for extraction.",
      alt: { model: "qwen2.5:0.5b", provider: "ollama", why: "Simpler schemas with fewer fields — faster at 28–40 t/s" },
    },
  },
  {
    label: "General chat / Q&A",
    icon: "💬",
    description: "Internal tool, knowledge base assistant, support bot",
    recommendation: {
      model: "gemma3:1b", provider: "ollama",
      reason: "Good instruction following and fluent responses. Runs at 18–28 t/s — fast enough for async chat.",
      alt: { model: "llama3.2:1b", provider: "ollama", why: "Meta's 1B has better instruction following for complex prompts" },
    },
  },
  {
    label: "Summarise long text",
    icon: "📄",
    description: "Condense articles, reports, meeting transcripts",
    recommendation: {
      model: "gemma3:4b", provider: "ollama",
      reason: "Longer context and better language quality make 4B noticeably better at coherent summaries than 1B models.",
      alt: { model: "gemma3:1b", provider: "ollama", why: "If throughput matters more than quality — 2–3× faster" },
    },
  },
  {
    label: "Write or fix code",
    icon: "🖥",
    description: "Code generation, autocomplete, bug explanations",
    recommendation: {
      model: "qwen2.5:1.5b", provider: "ollama",
      reason: "Qwen 2.5 series was heavily trained on code. 1.5B handles common languages (Python, JS, SQL) well.",
      alt: { model: "llama-3.1-8b-instant", provider: "groq", why: "For complex or multi-file code tasks — cloud GPU at $0.08/1M" },
    },
  },
  {
    label: "Realtime user-facing chat",
    icon: "🚀",
    description: "Response must arrive in under 1 second — live product feature",
    recommendation: {
      model: "llama-3.1-8b-instant", provider: "groq",
      reason: "~200 t/s cloud GPU = first token in ~100 ms. CPU inference at 18–30 t/s is too slow for synchronous UX.",
      alt: { model: "gemini-2.0-flash", provider: "gemini", why: "150 t/s, 1M context, $0.15/1M output" },
    },
  },
  {
    label: "Complex reasoning / agents",
    icon: "🧠",
    description: "Multi-step plans, analysis, coding agents, RAG with large docs",
    recommendation: {
      model: "claude-3-5-sonnet-20241022", provider: "anthropic",
      reason: "Best overall reasoning quality. Worth the cost for tasks where errors are expensive.",
      alt: { model: "gemma3:4b", provider: "ollama", why: "CPU fallback for non-critical reasoning at $0" },
    },
  },
  {
    label: "Large documents / PDFs",
    icon: "📚",
    description: "Whole books, codebases, long transcripts — context > 32K tokens",
    recommendation: {
      model: "gemini-2.0-flash", provider: "gemini",
      reason: "1M-token context window. Cheapest route for truly long documents at $0.15/1M output tokens.",
      alt: { model: "claude-3-5-sonnet-20241022", provider: "anthropic", why: "Higher quality on complex docs, 200K context" },
    },
  },
];

const fmtBytes = (b: number) =>
  b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(0) + " MB" : b + " B";

// ── page ──────────────────────────────────────────────────────────────────────

export function Models() {
  // Anyone can browse the catalogue; pulling a model is a heavy, admin-only op.
  const { isAdmin } = useAuth();
  return (
    <div className="overflow-x-hidden">
      <HeroSection />
      <PickerSection />
      <LocalOiCatalog />
      <SelfHostedSection />
      <CloudSection />
      {isAdmin && <PullSection />}
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  const cpuModels   = MODEL_CATALOG.filter((m) => m.provider === "ollama");
  const cloudModels = MODEL_CATALOG.filter((m) => m.provider !== "ollama");

  return (
    <section className="flex min-h-0 flex-col justify-between border-b border-border bg-navy px-4 py-12 text-cream sm:px-8 sm:py-16 md:px-16">
      <div>
        <div className="mb-6 flex items-center gap-3">
          <PixelLogo size={22} />
          <span className="text-sm font-medium text-cream/50">OpenInference · Models</span>
        </div>
        <h1 className="text-[clamp(2rem,8vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
          Model catalogue.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-cream/50">
          Every model routable through the gateway — with a built-in picker
          to tell you which one fits your use case.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-px bg-cream/8 sm:mt-12 sm:grid-cols-4">
        {[
          { v: String(OI_CATALOG.length), l: "Local models (oi)" },
          { v: String(cpuModels.length),   l: "Gateway CPU models" },
          { v: String(cloudModels.length), l: "Cloud models" },
          { v: "$0",                       l: "Per token (local)" },
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

// ── Picker ────────────────────────────────────────────────────────────────────

function PickerSection() {
  const [selected, setSelected] = useState<PickTask | null>(null);

  function modelLabel(modelId: string, provider: string) {
    const entry = MODEL_CATALOG.find((m) => m.model === modelId && m.provider === provider);
    return entry?.label ?? modelId;
  }

  return (
    <section className="bg-surface px-4 py-12 sm:px-8 sm:py-16 md:px-16">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Model picker</div>
      <h2 className="mt-3 mb-2 text-[clamp(1.5rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        What are you building?
      </h2>
      <p className="mb-10 text-sm text-muted-foreground">
        Pick a use case — we'll tell you exactly which model to use and why.
      </p>

      {/* Task grid */}
      <div className="grid grid-cols-1 gap-px bg-border border border-border sm:grid-cols-2 lg:grid-cols-4">
        {PICK_TASKS.map((task) => {
          const active = selected?.label === task.label;
          return (
            <button
              key={task.label}
              onClick={() => setSelected(active ? null : task)}
              className={`flex flex-col items-start px-5 py-5 text-left transition cursor-pointer ${
                active ? "bg-ink text-cream" : "bg-surface hover:bg-muted/60 text-ink"
              }`}
            >
              <span className="mb-2 text-xl">{task.icon}</span>
              <span className={`text-sm font-medium leading-snug ${active ? "text-cream" : ""}`}>
                {task.label}
              </span>
              <span className={`mt-1 text-[11px] leading-snug ${active ? "text-cream/50" : "text-muted-foreground"}`}>
                {task.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Recommendation panel */}
      {selected && (
        <div className="mt-px border border-t-0 border-border bg-cream p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Primary */}
            <div>
              <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Recommended
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-ink text-cream text-lg">
                  {selected.recommendation.provider === "ollama" ? "⚙" : "☁"}
                </div>
                <div>
                  <div className="font-mono text-base font-semibold">
                    {modelLabel(selected.recommendation.model, selected.recommendation.provider)}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {selected.recommendation.reason}
                  </p>
                  {selected.recommendation.provider === "ollama" && (
                    <div className="mt-3 inline-block text-[11px] font-medium text-green-600 uppercase tracking-[0.1em]">
                      $0.00 / 1M tokens
                    </div>
                  )}
                </div>
              </div>
              <Link
                to="/playground"
                className="mt-5 inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2.5 text-xs uppercase tracking-[0.1em] text-cream hover:bg-flame-red hover:border-flame-red transition"
              >
                Use in Playground →
              </Link>
            </div>

            {/* Alt */}
            {selected.recommendation.alt && (
              <div className="border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
                <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Alternative
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-surface border border-border text-lg">
                    {selected.recommendation.alt.provider === "ollama" ? "⚙" : "☁"}
                  </div>
                  <div>
                    <div className="font-mono text-sm font-medium">
                      {modelLabel(selected.recommendation.alt.model, selected.recommendation.alt.provider)}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {selected.recommendation.alt.why}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Approximate sizes in bytes for the static catalog fallback
const OLLAMA_SIZE_BYTES: Record<string, number> = {
  "smollm2:135m": 270e6,   "smollm2:360m": 725e6,  "qwen2.5:0.5b": 397e6,
  "qwen2.5:1.5b": 986e6,   "gemma3:1b": 815e6,     "deepseek-r1:1.5b": 1.1e9,
  "llama3.2:1b": 1.3e9,    "gemma2:2b": 1.6e9,     "smollm2:1.7b": 1.8e9,
  "qwen2.5:3b": 1.9e9,     "llama3.2:3b": 2.0e9,   "phi3.5:latest": 2.2e9,
  "gemma3:4b": 3.3e9,
};

const STATIC_OLLAMA: OllamaModel[] = MODEL_CATALOG
  .filter((m) => m.provider === "ollama")
  .map((m) => ({ name: m.model, size: OLLAMA_SIZE_BYTES[m.model] ?? 0 }));

// ── Self-hosted ───────────────────────────────────────────────────────────────

function SelfHostedSection() {
  const [running, setRunning] = useState<OllamaModel[]>([]);
  const [available, setAvailable] = useState<OllamaModel[]>(STATIC_OLLAMA);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<{ running: OllamaModel[]; available: OllamaModel[] }>("/v1/admin/inference/models"),
      api<{ data: InferenceStats[] }>("/v1/admin/inference/stats"),
    ])
      .then(([models, perf]) => {
        if (models) { setRunning(models.running); setAvailable(models.available); }
        if (perf) {
          const map: Record<string, number> = {};
          for (const r of perf.data) {
            if (r.provider === "ollama") map[r.model] = Number(r.avg_tokens_per_sec ?? 0);
          }
          setStats(map);
        }
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const runningNames = new Set(running.map((m) => m.name));

  // Sort: sub-1GB first (ascending size), then over-1GB
  const sorted = [...available].sort((a, b) => a.size - b.size);
  const sub1gb  = sorted.filter((m) => m.size < 1e9);
  const over1gb = sorted.filter((m) => m.size >= 1e9);

  return (
    <section className="bg-muted/30 px-4 py-12 sm:px-8 sm:py-16 md:px-16">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Gateway · server</div>
      <h2 className="mt-3 mb-10 text-[clamp(1.5rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        Models on your OpenInference stack.
      </h2>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          {/* Under 1 GB */}
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Under 1 GB</span>
            <span className="text-[10px] text-muted-foreground/50">{sub1gb.length} models · fits in any VPS</span>
          </div>
          <ModelGrid models={sub1gb} runningNames={runningNames} stats={stats} />

          {over1gb.length > 0 && (
            <>
              <div className="mb-2 mt-8 flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Over 1 GB</span>
                <span className="text-[10px] text-muted-foreground/50">{over1gb.length} models · need ≥2 GB free RAM</span>
              </div>
              <ModelGrid models={over1gb} runningNames={runningNames} stats={stats} />
            </>
          )}
        </>
      )}
    </section>
  );
}

function ModelGrid({ models, runningNames, stats }: {
  models: OllamaModel[];
  runningNames: Set<string>;
  stats: Record<string, number>;
}) {
  return (
    <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
      {models.map((m, i) => {
        const isLast = i === models.length - 1;
        const rem3 = models.length % 3;
        const rem2 = models.length % 2;
        const span = [
          isLast && rem3 === 2 ? "lg:col-span-2" : "",
          isLast && rem3 === 1 ? "lg:col-span-3" : "",
          isLast && rem2 === 1 ? "sm:col-span-2 lg:col-span-auto" : "",
        ].filter(Boolean).join(" ");
        const isLoaded = runningNames.has(m.name);
        const meta     = MODEL_META[m.name];
        const realTps  = stats[m.name];
        const tpsLabel = realTps && realTps > 0
          ? `${realTps.toFixed(0)} t/s (live)`
          : `${meta?.estTps ?? "—"} t/s (est.)`;
        const barPct = Math.min(
          ((realTps && realTps > 0 ? realTps : parseInt(meta?.estTps?.split("–")[0] ?? "0")) / 100) * 100,
          100
        );

        return (
          <div key={m.name} className={`flex flex-col bg-surface p-7 ${span}`}>
            <div className="mb-4 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${isLoaded ? "bg-green-500" : "bg-muted-foreground/25"}`} />
              <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {isLoaded ? "Loaded in RAM" : "On disk"}
              </span>
              {m.size < 1e9 && (
                <span className="ml-auto text-[10px] font-medium text-flame-red uppercase tracking-[0.1em]">
                  &lt;1 GB
                </span>
              )}
            </div>

            <div className="font-mono text-base font-semibold tracking-tight">{m.name}</div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
              <span>{meta?.params ?? "—"} params</span>
              <span>{fmtBytes(m.size)}</span>
            </div>

            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-[11px]">
                <span className="uppercase tracking-[0.12em] text-muted-foreground">Speed</span>
                <span className={`font-medium ${realTps && realTps > 0 ? "text-flame-red" : "text-muted-foreground"}`}>
                  {tpsLabel}
                </span>
              </div>
              <div className="h-[2px] bg-border">
                <div className="h-[2px] bg-flame-red transition-all" style={{ width: `${barPct}%` }} />
              </div>
            </div>

            <p className="mt-4 flex-1 text-xs leading-relaxed text-muted-foreground">
              {meta?.bestFor ?? "General purpose"}
            </p>

            <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
              <span className="text-sm font-semibold text-green-600">$0.00 / 1M</span>
              <Link to="/playground" className="text-xs uppercase tracking-[0.1em] text-muted-foreground hover:text-ink transition">
                Test →
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Cloud ─────────────────────────────────────────────────────────────────────

function CloudSection() {
  const cloudModels = MODEL_CATALOG.filter((m) => m.provider !== "ollama");

  return (
    <section className="bg-ink px-8 py-16 text-cream md:px-16">
      <div className="text-[11px] uppercase tracking-[0.18em] text-cream/30">Cloud · per token</div>
      <h2 className="mt-3 mb-10 text-[clamp(1.5rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        Cloud models.
      </h2>

      <div className="mb-2 hidden grid-cols-[1fr_100px_80px_80px_1fr] gap-5 text-[10px] uppercase tracking-[0.14em] text-cream/25 lg:grid">
        <span>Model</span><span>Tier</span>
        <span className="text-right">Cost / 1M</span><span className="text-right">Speed</span>
        <span>Best for</span>
      </div>

      <div className="divide-y divide-cream/8 border-t border-cream/8">
        {cloudModels.map((m) => {
          const meta = CLOUD_META[m.model];
          return (
            <div key={m.provider + m.model}
              className="grid grid-cols-1 gap-3 py-5 lg:grid-cols-[1fr_100px_80px_80px_1fr] lg:items-center lg:gap-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: meta?.color ?? "#888" }} />
                  <span className="font-mono text-sm text-cream/90">{m.label}</span>
                </div>
                <div className="mt-0.5 pl-[18px] text-[11px] text-cream/35 capitalize">{m.provider}</div>
              </div>
              <div>
                <span className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${TIER_STYLE[m.tier]}`}>
                  {m.tier}
                </span>
              </div>
              <div className="text-right font-mono text-sm text-cream/70">
                {meta ? `$${meta.costPerM.toFixed(2)}` : "—"}
              </div>
              <div className="text-right font-mono text-sm text-cream/50">{meta?.tps ?? "—"} t/s</div>
              <div className="text-xs leading-relaxed text-cream/40">{meta?.bestFor ?? "—"}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Pull ──────────────────────────────────────────────────────────────────────

const SUGGESTED = [
  { name: "phi4-mini:3.8b",  note: "Microsoft · 3.8B · strong reasoning for size" },
  { name: "mistral:7b",      note: "Mistral AI · 7B · best overall CPU quality" },
  { name: "llama3.2:3b",     note: "Meta · 3B · good balance speed vs quality" },
  { name: "qwen2.5:3b",      note: "Alibaba · 3B · excellent code + structured output" },
  { name: "deepseek-r1:1.5b",note: "DeepSeek · 1.5B · reasoning-focused, 1.1 GB" },
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
        const { value, done: d } = await reader.read();
        if (d) break;
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
    <section className="min-h-[55vh] bg-surface px-4 py-12 sm:px-8 sm:py-16 md:px-16">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ollama · pull</div>
      <h2 className="mt-3 mb-10 text-[clamp(1.5rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        Add a model.
      </h2>

      <div className="flex max-w-2xl flex-wrap items-stretch gap-0 border border-border">
        <input
          className="min-w-0 flex-1 bg-cream px-5 py-3.5 font-mono text-sm text-ink placeholder:text-muted-foreground/50 outline-none"
          placeholder="phi4-mini, mistral:7b, llama3.2:3b…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !pulling && pull(input)}
          disabled={pulling}
        />
        {pulling ? (
          <button
            className="border-l border-border bg-ink px-6 py-3.5 text-[13px] font-medium text-cream hover:bg-red-600 transition cursor-pointer"
            onClick={() => abortRef.current?.abort()}
          >Stop</button>
        ) : (
          <button
            className="border-l border-border bg-ink px-6 py-3.5 text-[13px] font-medium text-cream hover:bg-flame-red transition cursor-pointer disabled:opacity-40"
            onClick={() => pull(input)}
            disabled={!input.trim()}
          >Pull</button>
        )}
      </div>

      {(pulling || done) && (
        <div className="mt-4 max-w-2xl border border-border bg-cream p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{input}</span>
            {pct != null && <span className="font-mono text-xs text-muted-foreground">{pct}%</span>}
          </div>
          {pct != null && (
            <div className="mb-3 h-[2px] bg-border">
              <div className="h-[2px] bg-flame-red transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {done
              ? <span className="font-medium text-green-600">Done — model ready. Reload the page to see it in the grid.</span>
              : latest?.error
              ? <span className="text-red-500">{latest.error}</span>
              : latest?.status ?? "Starting…"}
          </div>
        </div>
      )}

      <div className="mt-10">
        <div className="mb-4 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Suggested</div>
        <div className="grid max-w-4xl grid-cols-1 gap-px bg-border border border-border sm:grid-cols-2 lg:grid-cols-3">
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
