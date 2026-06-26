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
    <div className={cn("flex flex-wrap items-end justify-between gap-6", className)}>
      <div>
        {kicker && (
          <Kicker className={dark ? "text-cream/40" : undefined}>{kicker}</Kicker>
        )}
        <h2
          className={cn(
            "mt-3 max-w-3xl text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em]",
            dark && "text-cream",
          )}
        >
          {title}
        </h2>
        {description && (
          <p className={cn("mt-4 max-w-xl text-base leading-relaxed", dark ? "text-cream/60" : "text-muted-foreground")}>
            {description}
          </p>
        )}
      </div>
      {action}
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
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  tag?: string;
  accent?: string;
  className?: string;
  href?: string;
}) {
  const inner = (
  <>
      <div className="mb-auto">
        {icon && <div className="mb-6">{icon}</div>}
        {tag && (
          <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {accent && <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: accent }} />}
            {tag}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-xl font-semibold leading-snug tracking-tight">{title}</h3>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground group-hover:text-cream/70">{description}</p>
        )}
      </div>
    </>
  );

  const cardClass = cn(
    "group flex min-h-[200px] flex-col bg-surface p-8 transition hover:bg-ink hover:text-cream",
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
      <div className={cn("mx-auto max-w-6xl px-6 md:px-10", compact ? "py-8" : "py-10")}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {kicker && <Kicker>{kicker}</Kicker>}
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
            {description && (
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
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
        { label: "Documents", to: "/docs" },
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
        { label: "API docs", href: "/api-docs" },
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
                  {"to" in link && link.to ? (
                    <Link to={link.to} className="text-sm text-muted-foreground transition hover:text-ink">
                      {link.label}
                    </Link>
                  ) : (
                    <a href={(link as { href: string }).href} className="text-sm text-muted-foreground transition hover:text-ink">
                      {link.label}
                    </a>
                  )}
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
