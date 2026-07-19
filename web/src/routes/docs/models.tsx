import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/primitives";
import { MODEL_CATALOG } from "@/lib/api";
import {
  CodeBlock,
  DocH2,
  DocP,
  DocsPage,
  LangTabs,
  useLang,
  useOrigin,
} from "@/components/docs/shared";
import { listModelsSnippet } from "./snippets";

const TOC = [
  { id: "discover", label: "Discover your models" },
  { id: "naming", label: "Model IDs" },
  { id: "plans", label: "Plan tiers" },
  { id: "catalog", label: "Catalog" },
];

const PLANS = [
  { plan: "free", tiers: "small", example: "llama-3.1-8b-instant, self-hosted" },
  { plan: "pro", tiers: "small + standard", example: "+ 70B, haiku, gemini-flash" },
  { plan: "enterprise", tiers: "all (+ frontier)", example: "+ sonnet, mistral-large" },
];

export function DocsModels() {
  const origin = useOrigin();
  const [lang, setLang] = useLang();

  const featured = MODEL_CATALOG.filter((m) =>
    ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "claude-haiku-4-5-20251001", "gemini-2.0-flash", "gemma3:1b"].includes(m.model),
  );

  return (
    <DocsPage
      title="Supported models"
      description="Explore models the gateway can route. Your key only sees what your plan and allowlist allow — always prefer GET /v1/models at runtime."
      toc={TOC}
    >
      <DocH2 id="discover">Discover your models</DocH2>
      <DocP>
        Don't hardcode. <code className="mono text-xs">GET /v1/models</code> returns exactly what
        <em> your </em> key can call. If a model is listed, it won't 403 for plan/allowlist reasons.
      </DocP>
      <LangTabs lang={lang} setLang={setLang} />
      <CodeBlock code={listModelsSnippet(lang, origin)} label={lang.toLowerCase()} />

      <DocH2 id="naming">Model IDs</DocH2>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="font-medium">Bare id</dt>
          <dd className="mt-0.5 text-muted-foreground">
            <code className="mono text-xs">llama-3.1-8b-instant</code> — routed via live provider catalog / heuristics.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Pinned</dt>
          <dd className="mt-0.5 text-muted-foreground">
            <code className="mono text-xs">groq/…</code>, <code className="mono text-xs">openai/…</code>,{" "}
            <code className="mono text-xs">openinference/llama3.1:8b</code> (self-hosted) forces that backend.
          </dd>
        </div>
      </dl>

      <DocH2 id="plans">Plan tiers</DocH2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Plan</th>
              <th className="py-2 pr-3 font-normal">Tiers</th>
              <th className="py-2 font-normal">Examples</th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map((p) => (
              <tr key={p.plan} className="border-b border-border last:border-0">
                <td className="py-2 pr-3"><Badge>{p.plan}</Badge></td>
                <td className="py-2 pr-3">{p.tiers}</td>
                <td className="py-2 text-muted-foreground">{p.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocH2 id="catalog">Featured models</DocH2>
      <DocP>
        Representative IDs often available when the matching provider key is configured.
        Live availability is always <code className="mono text-xs">GET /v1/models</code>.
        Browse the product catalogue at{" "}
        <Link to="/models" className="underline underline-offset-2 hover:text-ink">/models</Link>.
      </DocP>
      <div className="mt-5 grid gap-px border border-border bg-border sm:grid-cols-2">
        {featured.map((m) => (
          <div key={m.provider + m.model} className="bg-cream p-4">
            <div className="flex items-center gap-2">
              <code className="mono text-xs font-medium">{m.model}</code>
              <Badge>{m.tier}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{m.label} · {m.provider}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Model ID</th>
              <th className="py-2 pr-3 font-normal">Provider</th>
              <th className="py-2 font-normal">Tier</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_CATALOG.map((m) => (
              <tr key={m.provider + m.model} className="border-b border-border last:border-0">
                <td className="py-2 pr-3 mono text-xs">{m.model}</td>
                <td className="py-2 pr-3 text-muted-foreground">{m.provider}</td>
                <td className="py-2"><Badge>{m.tier}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DocsPage>
  );
}
