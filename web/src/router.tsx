import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { Nav } from "@/components/Nav";
import { Overview } from "@/routes/overview";
import { Playground } from "@/routes/playground";
import { Admin } from "@/routes/admin";
import { Inference } from "@/routes/inference";
import { Models } from "@/routes/models";

function RootLayout() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Outlet />
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

const routeTree = rootRoute.addChildren([overviewRoute, playgroundRoute, adminRoute, inferenceRoute, modelsRoute]);

// Hash history keeps client routes (/playground, /admin) out of the server's
// path space — the API owns /admin and /v1, so the browser only ever requests "/".
export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
