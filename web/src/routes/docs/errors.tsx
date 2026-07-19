import { Badge } from "@/components/ui/primitives";
import { DocH2, DocP, DocsPage } from "@/components/docs/shared";

const TOC = [
  { id: "http", label: "HTTP status codes" },
  { id: "rate", label: "Rate limits" },
  { id: "budget", label: "Budgets" },
  { id: "allowlist", label: "Model allowlists" },
];

const ERRORS = [
  { code: "401", meaning: "Missing, revoked, or expired API key." },
  { code: "402", meaning: "Monthly spend budget exceeded (tenant- or key-level)." },
  { code: "403", meaning: "Plan tier, model allowlist, or missing scope blocked the request." },
  { code: "404", meaning: "Unknown model — no configured provider serves it. Call GET /v1/models." },
  { code: "429", meaning: "Rate limit exceeded (requests/min or tokens/min on this key)." },
  { code: "400", meaning: "Invalid body, or content blocked by guardrails." },
];

export function DocsErrors() {
  return (
    <DocsPage
      title="Errors & limits"
      description="How the gateway signals failures, rate limits, budgets, and allowlists."
      toc={TOC}
    >
      <DocH2 id="http">HTTP status codes</DocH2>
      <DocP>
        OpenAI-compatible routes wrap errors as{" "}
        <code className="mono text-xs">{"{ error: { message, type, code } }"}</code>.
        Native <code className="mono text-xs">/v1/chat</code> often returns a simpler{" "}
        <code className="mono text-xs">{"{ error: \"…\" }"}</code> shape.
      </DocP>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Status</th>
              <th className="py-2 font-normal">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {ERRORS.map((e) => (
              <tr key={e.code} className="border-b border-border last:border-0">
                <td className="py-2 pr-3"><Badge tone="bad">{e.code}</Badge></td>
                <td className="py-2 text-muted-foreground">{e.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocH2 id="rate">Rate limits</DocH2>
      <DocP>
        Each API key has a requests-per-minute limit (set at creation, default 60). Exceeding it returns{" "}
        <code className="mono text-xs">429</code>. Create a dedicated key with a higher RPM for busy services.
      </DocP>

      <DocH2 id="budget">Budgets</DocH2>
      <DocP>
        Tenant and per-key monthly spend budgets (USD) are enforced before the LLM call. When exhausted,
        the gateway returns <code className="mono text-xs">402</code>. Admins manage budgets under Admin → Budget
        and the Budgets page.
      </DocP>

      <DocH2 id="allowlist">Model allowlists</DocH2>
      <DocP>
        Keys may optionally restrict which model IDs they can call. Requests (including fallbacks) to any
        other model return <code className="mono text-xs">403</code>. Leave unrestricted to allow every model
        your plan tier permits. Configure when creating a key in Admin → Keys.
      </DocP>
    </DocsPage>
  );
}
