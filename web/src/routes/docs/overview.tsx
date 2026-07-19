import { Link } from "@tanstack/react-router";
import { CodeBlock, DocsPage, useOrigin } from "@/components/docs/shared";
import { quickstart } from "./snippets";

const TOC = [
  { id: "welcome", label: "Welcome" },
  { id: "start", label: "Start building" },
];

const CARDS = [
  { to: "/docs/quickstart", title: "Quickstart", desc: "Create a key and make your first chat completion in minutes." },
  { to: "/docs/models", title: "Models", desc: "See which models the gateway routes, and how plans filter access." },
  { to: "/docs/openai", title: "OpenAI compatibility", desc: "Point any OpenAI SDK or IDE tool at our base URL." },
  { to: "/docs/reference", title: "API reference", desc: "Endpoints, auth headers, request shapes, and response fields." },
];

export function DocsOverview() {
  const origin = useOrigin();

  return (
    <DocsPage
      title="Welcome"
      description="Fast multi-provider inference, OpenAI-compatible. One gateway key — routing, guardrails, budgets, and traces on every request."
      toc={TOC}
    >
      <section id="welcome" className="scroll-mt-24 border border-border bg-surface p-5 sm:p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Swap <code className="mono text-xs">base_url</code> to{" "}
          <code className="mono text-xs">{origin}/v1</code>, use your gateway API key, and keep your existing OpenAI client code.
        </p>
        <CodeBlock code={quickstart("Python", origin)} label="python" />
      </section>

      <h2 id="start" className="mt-12 scroll-mt-24 text-xl font-semibold tracking-[-0.02em]">
        Start building
      </h2>
      <div className="mt-5 grid gap-px border border-border bg-border sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group bg-cream p-5 transition hover:bg-ink hover:text-cream"
          >
            <div className="text-sm font-medium">{c.title}</div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground group-hover:text-cream/70">
              {c.desc}
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Create keys in{" "}
        <Link to="/admin" className="underline underline-offset-2 hover:text-ink">Admin → Keys</Link>
        {" · "}
        Enable LLM providers with your org's own API keys under{" "}
        <Link to="/admin" className="underline underline-offset-2 hover:text-ink">Admin → Org Providers</Link>
        {" · "}
        Company knowledge base (org-scoped) at{" "}
        <Link to="/documents" className="underline underline-offset-2 hover:text-ink">Documents</Link>
        {" · "}
        Try models in the{" "}
        <Link to="/playground" className="underline underline-offset-2 hover:text-ink">Playground</Link>.
      </p>
    </DocsPage>
  );
}
