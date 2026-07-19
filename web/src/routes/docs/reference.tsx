import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/primitives";
import {
  CodeBlock,
  DocH2,
  DocP,
  DocsPage,
  useOrigin,
} from "@/components/docs/shared";
import { nativeChatSnippet, quickstart } from "./snippets";

const TOC = [
  { id: "auth", label: "Authentication" },
  { id: "completions", label: "Chat completions" },
  { id: "models", label: "List models" },
  { id: "native", label: "Native chat" },
  { id: "retrieve", label: "Retrieve" },
  { id: "agent", label: "Agent" },
];

export function DocsReference() {
  const origin = useOrigin();

  return (
    <DocsPage
      title="API reference"
      description="The endpoints you need to integrate. Narrative reference — not a raw OpenAPI explorer."
      toc={TOC}
    >
      <DocH2 id="auth">Authentication</DocH2>
      <DocP>
        Send either header on every request. Keys need the appropriate scope (
        <code className="mono text-xs">chat</code>, <code className="mono text-xs">retrieve</code>,{" "}
        <code className="mono text-xs">agent</code>, …).
      </DocP>
      <div className="mt-4 space-y-2">
        <code className="mono block border border-border bg-surface px-3 py-2 text-xs">
          Authorization: Bearer YOUR_API_KEY
        </code>
        <code className="mono block border border-border bg-surface px-3 py-2 text-xs">
          X-Api-Key: YOUR_API_KEY
        </code>
      </div>

      <DocH2 id="completions">
        <Badge tone="flame">POST</Badge>{" "}
        <code className="mono text-base">/v1/chat/completions</code>
      </DocH2>
      <DocP>
        OpenAI-compatible chat. Streaming and non-streaming. Drop-in for SDKs and IDE tools.
        Required: <code className="mono text-xs">model</code>, <code className="mono text-xs">messages[]</code>.
        Optional: <code className="mono text-xs">stream</code>.
      </DocP>
      <CodeBlock code={quickstart("curl", origin)} label="curl" />

      <DocH2 id="models">
        <Badge tone="flame">GET</Badge>{" "}
        <code className="mono text-base">/v1/models</code>
      </DocH2>
      <DocP>
        Models your key can use — filtered by plan, allowlist, and configured providers.
      </DocP>
      <CodeBlock
        code={`curl ${origin}/v1/models -H "Authorization: Bearer YOUR_API_KEY"`}
        label="curl"
      />

      <DocH2 id="native">
        <Badge tone="flame">POST</Badge>{" "}
        <code className="mono text-base">/v1/chat</code>
      </DocH2>
      <DocP>
        Native chat with <code className="mono text-xs">session_id</code>,{" "}
        <code className="mono text-xs">rag.enabled</code>, provider pinning, and metadata.
        Upload documents under{" "}
        <Link to="/documents" className="underline underline-offset-2 hover:text-ink">Documents</Link>{" "}
        before enabling RAG.
      </DocP>
      <CodeBlock code={nativeChatSnippet(origin)} label="curl" />

      <DocH2 id="retrieve">
        <Badge tone="flame">POST</Badge>{" "}
        <code className="mono text-base">/v1/retrieve</code>
      </DocH2>
      <DocP>Hybrid vector + keyword search over indexed documents (no LLM call).</DocP>

      <DocH2 id="agent">
        <Badge tone="flame">POST</Badge>{" "}
        <code className="mono text-base">/v1/agent</code>
      </DocH2>
      <DocP>
        Multi-step agent with tools. Use when you need tool calling — not yet on{" "}
        <code className="mono text-xs">/chat/completions</code>. See also{" "}
        <Link to="/docs/openai" className="underline underline-offset-2 hover:text-ink">
          OpenAI compatibility
        </Link>.
      </DocP>
    </DocsPage>
  );
}
