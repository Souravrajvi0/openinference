import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export const LANGS = ["Python", "JavaScript", "curl"] as const;
export type Lang = (typeof LANGS)[number];

export function useOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "https://your-gateway";
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative mt-4 overflow-hidden border border-border bg-surface">
      {label && (
        <div className="border-b border-border px-4 py-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </div>
      )}
      <pre className="mono overflow-x-auto p-4 text-[12px] leading-relaxed">{code}</pre>
      <button
        type="button"
        onClick={() => { navigator.clipboard?.writeText(code); toast.success("Copied"); }}
        className="absolute right-2 top-2 flex items-center gap-1 border border-border bg-cream px-2 py-1 text-[10px] text-muted-foreground transition hover:text-ink cursor-pointer"
        style={label ? { top: 36 } : undefined}
      >
        <Copy className="h-3 w-3" /> Copy
      </button>
    </div>
  );
}

export function LangTabs({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="mt-5 flex items-center gap-1 border-b border-border">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={cn(
            "border-b-2 px-3 py-2 text-xs transition cursor-pointer -mb-px",
            lang === l ? "border-ink text-ink" : "border-transparent text-muted-foreground hover:text-ink",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function DocH2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-24 text-xl font-semibold tracking-[-0.02em] first:mt-0">
      {children}
    </h2>
  );
}

export function DocP({ children }: { children: ReactNode }) {
  return <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

export function DocsPage({
  title,
  description,
  toc,
  children,
}: {
  title: string;
  description?: string;
  toc: { id: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-10">
      <article className="min-w-0 flex-1 pb-16 pt-8 md:pt-10">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{description}</p>
        )}
        <div className="mt-8">{children}</div>
      </article>
      {toc.length > 0 && (
        <aside className="hidden w-44 shrink-0 xl:block">
          <div className="sticky top-20 pt-10">
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">On this page</div>
            <nav className="mt-3 flex flex-col gap-2">
              {toc.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="text-xs leading-snug text-muted-foreground transition hover:text-ink"
                >
                  {t.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  );
}

export function useLang() {
  return useState<Lang>("Python");
}
