import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, Menu, X, ChevronDown, Building2, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { type AuthUser, type Membership, switchOrg, createOrg } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; exact?: boolean; pro?: boolean; admin?: boolean; manage?: boolean };
type NavGroup = { label: string; items: NavItem[]; pro?: boolean; admin?: boolean; manage?: boolean };
type NavEntry = NavItem | NavGroup;

const NAV: NavEntry[] = [
  { to: "/",           label: "Overview",   exact: true },
  { to: "/playground", label: "Playground" },
  { to: "/inference",  label: "Inference" },
  { to: "/models",     label: "Models" },
  { to: "/docs",       label: "Docs" },
  {
    label: "Monitor",
    pro: true,
    items: [
      { to: "/traces",   label: "Traces" },
      { to: "/sessions", label: "Sessions" },
    ],
  },
  {
    label: "Build",
    pro: true,
    items: [
      { to: "/agent", label: "Agent runner" },
    ],
  },
  {
    label: "Agents",
    pro: true,
    items: [
      { to: "/agents",    label: "Registry" },
      { to: "/approvals", label: "Approvals" },
    ],
  },
  {
    label: "Govern",
    pro: true,
    items: [
      { to: "/guardrails", label: "Guardrails" },
      { to: "/budgets",    label: "Budgets" },
      { to: "/mcp",        label: "MCP" },
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition cursor-pointer",
          activeInGroup ? "bg-ink text-cream" : "text-ink/70 hover:text-ink",
        )}
      >
        {group.label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-px min-w-[160px] border border-border bg-cream shadow-lg">
          {group.items.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center px-4 py-2.5 text-xs uppercase tracking-[0.15em] transition",
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
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[180px] items-center gap-1.5 border border-border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-ink/80 transition hover:text-ink cursor-pointer"
        title="Switch workspace"
      >
        <Building2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{active?.name ?? "Workspace"}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-px min-w-[220px] border border-border bg-cream shadow-lg">
          {memberships.map((m) => (
            <button
              key={m.tenant_id}
              onClick={() => handleSwitch(m.tenant_id)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-xs transition hover:bg-surface cursor-pointer"
            >
              <span className="truncate">
                <span className="font-medium">{m.name}</span>
                <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{m.role}</span>
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
                  className="w-full border border-border bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-flame-red"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <div className="flex gap-1">
                  <button onClick={handleCreate} className="flex-1 bg-ink px-2 py-1 text-[10px] uppercase tracking-wider text-cream cursor-pointer">Create</button>
                  <button onClick={() => setCreating(false)} className="flex-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition hover:text-ink cursor-pointer"
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

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 shrink-0">
      <span className="flex h-7 w-7 items-center justify-center bg-ink text-cream">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-label="OpenInference">
          <rect x="1" y="3" width="2" height="10" />
          <rect x="4" y="6" width="2" height="7" />
          <rect x="7" y="3" width="2" height="10" />
          <rect x="10" y="6" width="2" height="7" />
          <rect x="13" y="3" width="2" height="10" />
        </svg>
      </span>
      <span className="text-sm font-semibold tracking-tight">OpenInference</span>
    </Link>
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

  const adminEntry: NavItem = user
    ? { to: "/admin", label: isPlatformAdmin ? "Admin" : "Account" }
    : { to: "/admin", label: "Sign in" };

  const membersEntry: NavItem | null = user && canManage
    ? { to: "/members", label: "Members", manage: true }
    : null;

  const visibleNav: NavEntry[] = [
    ...NAV
      .filter((e) => canSee(e, isPro, isPlatformAdmin, canManage))
      .map((e) =>
        isGroup(e)
          ? { ...e, items: e.items.filter((i) => canSee(i, isPro, isPlatformAdmin, canManage)) }
          : e,
      )
      .filter((e) => !isGroup(e) || e.items.length > 0),
    ...(membersEntry ? [membersEntry] : []),
    adminEntry,
  ];

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    let alive = true;
    api("/health")
      .then(() => alive && setHealth("ok"))
      .catch(() => alive && setHealth("down"));
    return () => { alive = false; };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-cream/90 px-6 py-2 backdrop-blur">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center md:flex">
            {visibleNav.map((entry, i) =>
              isGroup(entry) ? (
                <Dropdown key={i} group={entry} />
              ) : (
                <Link
                  key={entry.to}
                  to={entry.to}
                  className={cn(
                    "px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition",
                    (entry.exact ? pathname === entry.to : pathname.startsWith(entry.to))
                      ? "bg-ink text-cream"
                      : "text-ink/70 hover:text-ink",
                  )}
                >
                  {entry.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <OrgSwitcher
              memberships={memberships}
              activeOrgId={activeOrg?.id ?? user.tenant_id}
              onSwitched={() => onOrgChange?.()}
            />
          )}

          <div className="hidden items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground sm:flex">
            <span className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              health === "ok" ? "bg-good" : health === "down" ? "bg-bad" : "bg-muted-foreground",
            )} />
            {health === "ok" ? "Online" : health === "down" ? "Down" : "…"}
          </div>

          <button
            onClick={toggle}
            className="flex h-7 w-7 items-center justify-center border border-border-strong text-muted-foreground transition hover:bg-muted hover:text-ink cursor-pointer"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-7 w-7 items-center justify-center border border-border-strong text-muted-foreground transition hover:bg-muted hover:text-ink cursor-pointer md:hidden"
          >
            {mobileOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="sticky top-[45px] z-30 border-b border-border bg-cream/95 backdrop-blur md:hidden">
          <nav className="flex flex-col py-1">
            {visibleNav.map((entry, i) =>
              isGroup(entry) ? (
                <div key={i}>
                  <div className="px-6 pt-3 pb-1 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                    {entry.label}
                  </div>
                  {entry.items.map((item) => {
                    const active = pathname.startsWith(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center px-8 py-2 text-xs uppercase tracking-[0.15em] transition",
                          active ? "bg-ink text-cream" : "text-ink/70 hover:bg-surface hover:text-ink",
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
                    "flex items-center px-6 py-2 text-xs uppercase tracking-[0.15em] transition",
                    (entry.exact ? pathname === entry.to : pathname.startsWith(entry.to))
                      ? "bg-ink text-cream"
                      : "text-ink/70 hover:bg-surface hover:text-ink",
                  )}
                >
                  {entry.label}
                </Link>
              ),
            )}
          </nav>
        </div>
      )}
    </>
  );
}
