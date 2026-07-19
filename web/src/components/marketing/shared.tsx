import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground", className)}>
      {children}
    </div>
  );
}

export function CtaButton({
  to,
  href,
  children,
  variant = "solid",
  className,
  onClick,
}: {
  to?: string;
  href?: string;
  children: ReactNode;
  variant?: "solid" | "outline" | "light";
  className?: string;
  onClick?: () => void;
}) {
  const styles = cn(
    "inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition",
    variant === "solid" && "bg-ink text-cream hover:opacity-90",
    variant === "outline" && "border border-border-strong bg-surface hover:bg-muted",
    variant === "light" && "bg-muted text-ink hover:bg-muted/80",
    className,
  );

  if (to) return <Link to={to} className={styles}>{children}</Link>;
  if (href) return <a href={href} className={styles}>{children}</a>;
  return <button type="button" onClick={onClick} className={styles}>{children}</button>;
}

export function SectionHeading({
  kicker,
  title,
  description,
  action,
  dark = false,
  className,
}: {
  kicker?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6", className)}>
      <div className="min-w-0 flex-1">
        {kicker && (
          <Kicker className={dark ? "text-cream/40" : undefined}>{kicker}</Kicker>
        )}
        <h2
          className={cn(
            "mt-2 text-2xl font-semibold leading-[1.08] tracking-[-0.03em] sm:mt-3 sm:text-[clamp(1.75rem,5vw,3.5rem)]",
            dark && "text-cream",
          )}
        >
          {title}
        </h2>
        {description && (
          <p className={cn("mt-3 max-w-xl text-sm leading-relaxed sm:text-base", dark ? "text-cream/60" : "text-muted-foreground")}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </div>
  );
}

export function FeatureCard({
  icon,
  title,
  description,
  tag,
  accent,
  className,
  href,
  stacked = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  tag?: string;
  accent?: string;
  className?: string;
  href?: string;
  /** Top-align tag, title, and body (default spreads title to card bottom). */
  stacked?: boolean;
}) {
  const tagEl = tag ? (
    <div className={cn("flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground", !stacked && "mb-4")}>
      {accent && <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: accent }} />}
      {tag}
    </div>
  ) : null;

  const titleEl = (
    <>
      <h3 className={cn("text-xl font-semibold leading-snug tracking-tight", stacked && "mt-4")}>{title}</h3>
      {description && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:opacity-100 group-hover:text-cream/70 max-sm:opacity-100">{description}</p>
      )}
    </>
  );

  const inner = stacked ? (
    <>
      {icon && <div className="mb-6">{icon}</div>}
      {tagEl}
      {titleEl}
    </>
  ) : (
    <>
      <div className="mb-auto">
        {icon && <div className="mb-6">{icon}</div>}
        {tagEl}
      </div>
      <div>{titleEl}</div>
    </>
  );

  const cardClass = cn(
    "group flex min-h-0 flex-col bg-surface p-5 transition hover:bg-ink hover:text-cream sm:min-h-[180px] sm:p-8",
    className,
  );

  if (href) {
    return (
      <Link to={href} className={cardClass}>
        {inner}
      </Link>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}

export function PageHeader({
  kicker,
  title,
  description,
  action,
  compact = false,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="border-b border-border bg-surface">
      <div className={cn("mx-auto max-w-6xl px-4 sm:px-6 md:px-10", compact ? "py-6 sm:py-8" : "py-8 sm:py-10")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            {kicker && <Kicker>{kicker}</Kicker>}
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">{title}</h1>
            {description && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
            )}
          </div>
          {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const cols = [
    {
      title: "Product",
      links: [
        { label: "Overview", to: "/" },
        { label: "Playground", to: "/playground" },
        { label: "Inference", to: "/inference" },
        { label: "Models", to: "/models" },
        { label: "API access", to: "/docs" },
        { label: "Documents", to: "/documents" },
        { label: "CLI", to: "/cli" },
        { label: "Updates", to: "/updates" },
      ],
    },
    {
      title: "Monitor",
      links: [
        { label: "Traces", to: "/traces" },
        { label: "Sessions", to: "/sessions" },
      ],
    },
    {
      title: "Govern",
      links: [
        { label: "Guardrails", to: "/guardrails" },
        { label: "Budgets", to: "/budgets" },
        { label: "MCP", to: "/mcp" },
        { label: "Regression", to: "/regression" },
      ],
    },
    {
      title: "Account",
      links: [
        { label: "Sign in", to: "/admin" },
        { label: "API access", to: "/docs" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-4">
        {cols.map((col) => (
          <div key={col.title} className="bg-cream px-8 py-10">
            <div className="mb-4 text-sm font-semibold">{col.title}</div>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="text-sm text-muted-foreground transition hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-8 py-6 text-center text-xs text-muted-foreground">
        OpenInference — self-hosted AI gateway, agents, and observability
      </div>
    </footer>
  );
}
