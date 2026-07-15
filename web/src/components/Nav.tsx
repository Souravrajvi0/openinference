import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, Menu, X, ChevronDown, Building2, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { type AuthUser, type Membership, switchOrg, createOrg } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { PixelLogo } from "@/components/pixel/icons";
import { CtaButton } from "@/components/marketing/shared";

type NavItem = { to: string; label: string; exact?: boolean; pro?: boolean; admin?: boolean; manage?: boolean };
type NavGroup = { label: string; items: NavItem[]; pro?: boolean; admin?: boolean; manage?: boolean };
type NavEntry = NavItem | NavGroup;

const PRIMARY_NAV: NavEntry[] = [
  { to: "/", label: "Overview", exact: true },
  { to: "/playground", label: "Playground" },
  { to: "/inference", label: "Inference" },
  { to: "/models", label: "Models" },
  { to: "/docs", label: "Docs" },
  { to: "/cli", label: "CLI" },
  { to: "/updates", label: "Updates" },
];

const PRO_NAV: NavEntry[] = [
  {
    label: "Monitor",
    pro: true,
    items: [
      { to: "/traces", label: "Traces" },
      { to: "/sessions", label: "Sessions" },
    ],
  },
  {
    label: "Build",
    pro: true,
    items: [{ to: "/agent", label: "Agent runner" }],
  },
  {
    label: "Agents",
    pro: true,
    items: [
      { to: "/agents", label: "Registry" },
      { to: "/approvals", label: "Approvals" },
    ],
  },
  {
    label: "Govern",
    pro: true,
    items: [
      { to: "/guardrails", label: "Guardrails" },
      { to: "/budgets", label: "Budgets" },
      { to: "/mcp", label: "MCP" },
      { to: "/regression", label: "Regression" },
    ],
  },
];

function isGroup(e: NavEntry): e is NavGroup {
  return "items" in e;
}

function canSee(
  e: { pro?: boolean; admin?: boolean; manage?: boolean },
  isPro: boolean,
  isPlatformAdmin: boolean,
  canManage: boolean,
): boolean {
  if (e.admin) return isPlatformAdmin;
  if (e.manage) return canManage;
  if (e.pro) return isPro;
  return true;
}

function NavLink({
  to,
  label,
  exact,
  className,
}: {
  to: string;
  label: string;
  exact?: boolean;
  className?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = exact ? pathname === to : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={cn(
        "flex h-full items-center px-4 text-sm font-medium transition",
        active ? "bg-ink text-cream" : "text-ink/70 hover:bg-muted/60 hover:text-ink",
        className,
      )}
    >
      {label}
    </Link>
  );
}

function Dropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeInGroup = group.items.some((i) => pathname.startsWith(i.to));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div ref={ref} className="relative h-full border-r border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-full items-center gap-1.5 px-4 text-sm font-medium transition cursor-pointer",
          activeInGroup ? "bg-ink text-cream" : "text-ink/70 hover:bg-muted/60 hover:text-ink",
        )}
      >
        {group.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 min-w-[180px] border border-border bg-cream shadow-lg rounded-b-md overflow-hidden">
          {group.items.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center px-4 py-2.5 text-sm transition",
                  active ? "bg-ink text-cream" : "text-ink/70 hover:bg-surface hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StartBuildingDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  const links = [
    { to: "/cli", label: "CLI setup" },
    { to: "/updates", label: "What we shipped" },
    { to: "/playground", label: "Playground" },
    { to: "/docs", label: "Knowledge base" },
    { to: "/models", label: "Model catalogue" },
    { href: "/api-docs", label: "API reference" },
  ];

  return (
    <div ref={ref} className="relative hidden h-full border-l border-border sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-full items-center gap-1.5 px-4 text-sm font-medium text-ink/70 transition hover:bg-muted/60 hover:text-ink cursor-pointer"
      >
        Get started
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 min-w-[200px] border border-border bg-cream shadow-lg rounded-b-md overflow-hidden">
          {links.map((link) =>
            "to" in link && link.to ? (
              <Link
                key={link.label}
                to={link.to}
                className="block px-4 py-2.5 text-sm text-ink/70 transition hover:bg-surface hover:text-ink"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="block px-4 py-2.5 text-sm text-ink/70 transition hover:bg-surface hover:text-ink"
              >
                {link.label}
              </a>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function OrgSwitcher({
  memberships,
  activeOrgId,
  onSwitched,
}: {
  memberships: Membership[];
  activeOrgId?: string;
  onSwitched: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const active = memberships.find((m) => m.tenant_id === activeOrgId);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSwitch(tenantId: string) {
    if (tenantId === activeOrgId) {
      setOpen(false);
      return;
    }
    try {
      await switchOrg(tenantId);
      onSwitched();
      setOpen(false);
      toast.success("Workspace switched");
      window.location.reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to switch workspace");
    }
  }

  async function handleCreate() {
    if (!name.trim()) return toast.error("Name required");
    try {
      await createOrg(name.trim());
      setCreating(false);
      setName("");
      setOpen(false);
      onSwitched();
      toast.success("Workspace created");
      window.location.reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create workspace");
    }
  }

  if (!active && memberships.length === 0) return null;

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[160px] items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-ink/80 transition hover:bg-muted cursor-pointer"
        title="Switch workspace"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{active?.name ?? "Workspace"}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-md border border-border bg-cream shadow-lg">
          {memberships.map((m) => (
            <button
              key={m.tenant_id}
              onClick={() => handleSwitch(m.tenant_id)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition hover:bg-surface cursor-pointer"
            >
              <span className="truncate">
                <span className="font-medium">{m.name}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{m.role}</span>
              </span>
              {m.tenant_id === activeOrgId && <Check className="h-3.5 w-3.5 shrink-0 text-good" />}
            </button>
          ))}
          <div className="border-t border-border p-2">
            {creating ? (
              <div className="space-y-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Workspace name"
                  className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-flame-red"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <div className="flex gap-1">
                  <button onClick={handleCreate} className="flex-1 rounded-md bg-ink px-2 py-1 text-xs font-medium text-cream cursor-pointer">Create</button>
                  <button onClick={() => setCreating(false)} className="flex-1 rounded-md border border-border px-2 py-1 text-xs cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:text-ink cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Create workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Nav({
  user,
  memberships = [],
  activeOrg,
  isPro = false,
  isPlatformAdmin = false,
  canManage = false,
  onOrgChange,
}: {
  user?: AuthUser | null;
  memberships?: Membership[];
  activeOrg?: { id: string; name: string } | null;
  isPro?: boolean;
  isPlatformAdmin?: boolean;
  canManage?: boolean;
  onOrgChange?: () => void;
}) {
  const { theme, toggle } = useTheme();
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const proNav = PRO_NAV
    .filter((e) => canSee(e, isPro, isPlatformAdmin, canManage))
    .map((e) =>
      isGroup(e)
        ? { ...e, items: e.items.filter((i) => canSee(i, isPro, isPlatformAdmin, canManage)) }
        : e,
    )
    .filter((e) => !isGroup(e) || e.items.length > 0);

  const membersLink = user && canManage ? { to: "/members", label: "Members" } : null;
  const consoleLabel = user ? (isPlatformAdmin ? "Admin" : "Account") : "Sign in";
  const consoleTo = "/admin";

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  useEffect(() => {
    let alive = true;
    api("/health")
      .then(() => alive && setHealth("ok"))
      .catch(() => alive && setHealth("down"));
    return () => { alive = false; };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-cream/95 backdrop-blur">
        <div className="flex h-12 items-stretch justify-between">
          {/* Logo + primary nav */}
          <div className="flex min-w-0 flex-1 items-stretch">
            <Link
              to="/"
              className="flex shrink-0 items-center gap-2.5 border-r border-border px-4 transition hover:bg-muted/40"
            >
              <PixelLogo size={18} />
              <span className="hidden text-sm font-semibold tracking-tight sm:inline">OpenInference</span>
            </Link>

            <nav className="hidden min-w-0 items-stretch overflow-x-auto md:flex">
              {PRIMARY_NAV.map((entry) =>
                isGroup(entry) ? null : (
                  <div key={entry.to} className="h-full shrink-0 border-r border-border">
                    <NavLink to={entry.to} label={entry.label} exact={entry.exact} className="h-12" />
                  </div>
                ),
              )}
              {proNav.map((entry, i) =>
                isGroup(entry) ? (
                  <Dropdown key={i} group={entry} />
                ) : (
                  <div key={entry.to} className="h-full shrink-0 border-r border-border">
                    <NavLink to={entry.to} label={entry.label} exact={entry.exact} className="h-12" />
                  </div>
                ),
              )}
              {membersLink && (
                <div className="h-full shrink-0 border-r border-border">
                  <NavLink to={membersLink.to} label={membersLink.label} className="h-12" />
                </div>
              )}
            </nav>
          </div>

          {/* Right actions */}
          <div className="flex shrink-0 items-stretch">
            <StartBuildingDropdown />

            <div className="flex items-center gap-1 border-l border-border px-2 sm:gap-2 sm:px-3 md:border-l">
              {user && (
                <OrgSwitcher
                  memberships={memberships}
                  activeOrgId={activeOrg?.id ?? user.tenant_id}
                  onSwitched={() => onOrgChange?.()}
                />
              )}
              <span
                className={cn(
                  "hidden h-1.5 w-1.5 rounded-full sm:inline-block",
                  health === "ok" ? "bg-good" : health === "down" ? "bg-bad" : "bg-muted-foreground",
                )}
                title={health === "ok" ? "Gateway online" : health === "down" ? "Gateway down" : "Checking…"}
              />
              <button
                onClick={toggle}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-ink cursor-pointer"
                title="Toggle theme"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>

            <Link
              to={consoleTo}
              className="hidden items-center gap-1.5 border-l border-border bg-ink px-4 text-sm font-medium text-cream transition hover:opacity-90 md:flex"
            >
              {consoleLabel}
              <span aria-hidden>›</span>
            </Link>

            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="flex h-12 w-12 items-center justify-center border-l border-border text-muted-foreground transition hover:bg-muted md:hidden cursor-pointer"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] md:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-x-0 top-12 z-50 max-h-[calc(100dvh-3rem)] overflow-y-auto border-b border-border bg-cream shadow-lg md:hidden">
          <nav className="flex flex-col py-2">
            <div className="px-5 pb-2 pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Get started
            </div>
            {[
              { to: "/cli", label: "CLI setup" },
              { to: "/playground", label: "Playground" },
              { to: "/docs", label: "Knowledge base" },
              { to: "/models", label: "Model catalogue" },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="px-5 py-2.5 text-sm text-ink/80 transition hover:bg-surface"
              >
                {link.label}
              </Link>
            ))}
            <a href="/api-docs" className="px-5 py-2.5 text-sm text-ink/80 transition hover:bg-surface">
              API reference
            </a>
            <div className="my-2 border-t border-border" />
            {[...PRIMARY_NAV, ...proNav, ...(membersLink ? [membersLink] : [])].map((entry, i) =>
              isGroup(entry) ? (
                <div key={i}>
                  <div className="px-5 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {entry.label}
                  </div>
                  {entry.items.map((item) => {
                    const active = pathname.startsWith(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center px-7 py-2.5 text-sm transition",
                          active ? "bg-ink text-cream" : "text-ink/70 hover:bg-surface",
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Link
                  key={entry.to}
                  to={entry.to}
                  className={cn(
                    "flex items-center px-5 py-2.5 text-sm transition",
                    ("exact" in entry && entry.exact ? pathname === entry.to : pathname.startsWith(entry.to))
                      ? "bg-ink text-cream"
                      : "text-ink/70 hover:bg-surface",
                  )}
                >
                  {entry.label}
                </Link>
              ),
            )}
            <div className="border-t border-border p-4">
              <CtaButton to={consoleTo} className="w-full justify-center">{consoleLabel} →</CtaButton>
            </div>
          </nav>
        </div>
        </>
      )}
    </>
  );
}
