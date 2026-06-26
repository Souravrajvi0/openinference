import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { Nav } from "@/components/Nav";
import { useAuth } from "@/lib/auth";
import { Overview } from "@/routes/overview";
import { Playground } from "@/routes/playground";
import { Admin } from "@/routes/admin";
import { Inference } from "@/routes/inference";
import { Models } from "@/routes/models";
import { Docs } from "@/routes/docs";
import { Traces } from "@/routes/traces";
import { Sessions } from "@/routes/sessions";
import { Agent } from "@/routes/agent";
import { Guardrails } from "@/routes/guardrails";
import { Agents } from "@/routes/agents";
import { Approvals } from "@/routes/approvals";
import { Regression } from "@/routes/regression";
import { Budgets } from "@/routes/budgets";
import { Mcp } from "@/routes/mcp";

function RootLayout() {
  const { user, loading, isAdmin } = useAuth();

  return (
    <div className="min-h-screen">
      <Nav user={user} isAdmin={isAdmin} />
      {loading ? (
        <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>
      ) : (
        <Outlet />
      )}
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            borderRadius: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
          },
        }}
      />
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Overview });
const playgroundRoute = createRoute({ getParentRoute: () => rootRoute, path: "/playground", component: Playground });
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: Admin });
const inferenceRoute = createRoute({ getParentRoute: () => rootRoute, path: "/inference", component: Inference });
const modelsRoute    = createRoute({ getParentRoute: () => rootRoute, path: "/models",    component: Models });
const docsRoute      = createRoute({ getParentRoute: () => rootRoute, path: "/docs",      component: Docs });
const tracesRoute    = createRoute({ getParentRoute: () => rootRoute, path: "/traces",    component: Traces });
const sessionsRoute    = createRoute({ getParentRoute: () => rootRoute, path: "/sessions",    component: Sessions });
const agentRoute       = createRoute({ getParentRoute: () => rootRoute, path: "/agent",        component: Agent });
const guardrailsRoute  = createRoute({ getParentRoute: () => rootRoute, path: "/guardrails",   component: Guardrails });
const agentsRoute      = createRoute({ getParentRoute: () => rootRoute, path: "/agents",        component: Agents });
const approvalsRoute   = createRoute({ getParentRoute: () => rootRoute, path: "/approvals",     component: Approvals });
const regressionRoute  = createRoute({ getParentRoute: () => rootRoute, path: "/regression",    component: Regression });
const budgetsRoute     = createRoute({ getParentRoute: () => rootRoute, path: "/budgets",        component: Budgets });
const mcpRoute         = createRoute({ getParentRoute: () => rootRoute, path: "/mcp",            component: Mcp });

const routeTree = rootRoute.addChildren([overviewRoute, playgroundRoute, adminRoute, inferenceRoute, modelsRoute, docsRoute, tracesRoute, sessionsRoute, agentRoute, guardrailsRoute, agentsRoute, approvalsRoute, regressionRoute, budgetsRoute, mcpRoute]);

// Browser history gives clean URLs (/playground, /admin) with no "#". The gateway
// owns the API under /v1 (so /admin here never collides with /v1/admin) and serves
// the SPA's index.html for any unmatched HTML GET, so deep-link refreshes resolve.
export const router = createRouter({
  routeTree,
  history: createBrowserHistory(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
