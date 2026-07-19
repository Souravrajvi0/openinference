import { Link } from "@tanstack/react-router";
import {
  CodeBlock,
  DocH2,
  DocP,
  DocsPage,
  LangTabs,
  useLang,
  useOrigin,
} from "@/components/docs/shared";
import { envKeySnippet, quickstart, streamingSnippet } from "./snippets";

const TOC = [
  { id: "api-key", label: "Create an API key" },
  { id: "env", label: "Set up your key" },
  { id: "first-call", label: "First chat completion" },
  { id: "streaming", label: "Streaming" },
  { id: "tools", label: "IDE tools" },
];

export function DocsQuickstart() {
  const origin = useOrigin();
  const [lang, setLang] = useLang();

  return (
    <DocsPage
      title="Quickstart"
      description="From zero to a working chat completion against the gateway."
      toc={TOC}
    >
      <DocH2 id="api-key">Create an API key</DocH2>
      <DocP>
        Sign in, open{" "}
        <Link to="/admin" className="underline underline-offset-2 hover:text-ink">Admin → Keys</Link>,
        and create a key with the <code className="mono text-xs">chat</code> scope.
        The raw key is shown once — copy it immediately.
      </DocP>

      <DocH2 id="env">Set up your API key (recommended)</DocH2>
      <DocP>
        Prefer environment variables over hardcoding. Never commit keys to git.
      </DocP>
      <CodeBlock code={envKeySnippet().replace("https://YOUR_GATEWAY", origin)} label="shell" />

      <DocH2 id="first-call">Requesting your first chat completion</DocH2>
      <DocP>
        Use the official OpenAI SDK with <code className="mono text-xs">base_url</code> pointed at this gateway.
        This is <code className="mono text-xs">chat.completions</code> — not the newer Responses API.
      </DocP>
      <LangTabs lang={lang} setLang={setLang} />
      <CodeBlock code={quickstart(lang, origin)} label={lang.toLowerCase()} />

      <DocH2 id="streaming">Streaming</DocH2>
      <DocP>
        Pass <code className="mono text-xs">stream: true</code>. Chunks are OpenAI-shaped SSE ending with{" "}
        <code className="mono text-xs">data: [DONE]</code>.
      </DocP>
      <LangTabs lang={lang} setLang={setLang} />
      <CodeBlock code={streamingSnippet(lang, origin)} label={lang.toLowerCase()} />

      <DocH2 id="tools">Using third-party libraries and SDKs</DocH2>
      <DocP>
        Any client that accepts an OpenAI-compatible base URL works — Cursor, Continue, Cline, Aider,
        Open WebUI, LibreChat. Set base URL to{" "}
        <code className="mono text-xs">{origin}/v1</code> (include <code className="mono text-xs">/v1</code>).
        Details on the{" "}
        <Link to="/docs/openai" className="underline underline-offset-2 hover:text-ink">
          OpenAI compatibility
        </Link>{" "}
        page.
      </DocP>
    </DocsPage>
  );
}
