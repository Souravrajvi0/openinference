import { Link } from "@tanstack/react-router";
import {
  CodeBlock,
  DocH2,
  DocP,
  DocsPage,
  useOrigin,
} from "@/components/docs/shared";
import { quickstart } from "./snippets";

const TOC = [
  { id: "drop-in", label: "Drop-in usage" },
  { id: "auth", label: "Auth headers" },
  { id: "tools", label: "IDE & client tools" },
  { id: "limits", label: "What's supported" },
];

const TOOLS: { name: string; config: string }[] = [
  { name: "Cursor", config: "Settings → Models → OpenAI API Key + Override OpenAI Base URL → {origin}/v1" },
  { name: "Continue", config: "config.yaml: provider openai, apiBase: {origin}/v1, apiKey: <key>" },
  { name: "Cline", config: "OpenAI Compatible → Base URL {origin}/v1 · API key · model from /v1/models" },
  { name: "Aider", config: "OPENAI_API_BASE={origin}/v1 OPENAI_API_KEY=<key> aider --model openai/<model>" },
  { name: "Open WebUI", config: "Admin → Connections → OpenAI → URL {origin}/v1 · API key" },
  { name: "LibreChat", config: "librechat.yaml: type openai, baseURL: {origin}/v1, apiKey: <key>" },
];

export function DocsOpenai() {
  const origin = useOrigin();

  return (
    <DocsPage
      title="OpenAI compatibility"
      description="The gateway speaks the classic OpenAI Chat Completions API so existing SDKs and tools work with a URL + key swap."
      toc={TOC}
    >
      <DocH2 id="drop-in">Drop-in usage</DocH2>
      <DocP>
        Set <code className="mono text-xs">base_url</code> / <code className="mono text-xs">baseURL</code> to{" "}
        <code className="mono text-xs">{origin}/v1</code> and use your gateway key as{" "}
        <code className="mono text-xs">api_key</code>. Every call still runs guardrails, plan checks,
        allowlists, rate limits, tracing, and evals.
      </DocP>
      <CodeBlock code={quickstart("Python", origin)} label="python" />

      <DocH2 id="auth">Auth headers</DocH2>
      <div className="mt-4 grid gap-px border border-border bg-border sm:grid-cols-2">
        <div className="bg-cream p-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">OpenAI SDKs</div>
          <code className="mono mt-2 block text-xs">Authorization: Bearer YOUR_API_KEY</code>
        </div>
        <div className="bg-cream p-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Native</div>
          <code className="mono mt-2 block text-xs">X-Api-Key: YOUR_API_KEY</code>
        </div>
      </div>

      <DocH2 id="tools">IDE & client tools</DocH2>
      <div className="mt-4 border-t border-border">
        {TOOLS.map((t) => (
          <div
            key={t.name}
            className="grid gap-1 border-b border-border py-3 sm:grid-cols-[7rem_1fr] sm:gap-6"
          >
            <div className="text-sm font-medium">{t.name}</div>
            <p className="mono text-xs leading-relaxed text-muted-foreground">
              {t.config.replaceAll("{origin}", origin)}
            </p>
          </div>
        ))}
      </div>

      <DocH2 id="limits">What's supported</DocH2>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        <li><span className="text-ink">Yes</span> — <code className="mono text-xs">POST /v1/chat/completions</code> (stream + non-stream)</li>
        <li><span className="text-ink">Yes</span> — <code className="mono text-xs">GET /v1/models</code></li>
        <li><span className="text-ink">Yes</span> — bare model ids and <code className="mono text-xs">provider/model</code> pins</li>
        <li><span className="text-muted-foreground">Not yet</span> — tool / function calling on completions (use{" "}
          <code className="mono text-xs">POST /v1/agent</code>)</li>
        <li><span className="text-muted-foreground">Not yet</span> — OpenAI Responses API (<code className="mono text-xs">client.responses</code>)</li>
      </ul>
      <DocP>
        For sessions, RAG, and provider pinning, use the native{" "}
        <Link to="/docs/reference" className="underline underline-offset-2 hover:text-ink">
          <code className="mono text-xs">POST /v1/chat</code>
        </Link>{" "}
        endpoint.
      </DocP>
    </DocsPage>
  );
}
