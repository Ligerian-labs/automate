import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isAuthenticated } from "./lib/auth";
import { AuthPage } from "./pages/auth-page";
import { DashboardPage } from "./pages/dashboard";
import { NewSchedulePage } from "./pages/new-schedule";
import { PipelineEditorPage } from "./pages/pipeline-editor";
import { PipelinesListPage } from "./pages/pipelines-list";
import { RunDetailPage } from "./pages/run-detail";
import { RunsListPage } from "./pages/runs-list";
import { SchedulesPage } from "./pages/schedules";
import { SettingsPage } from "./pages/settings";
import "./styles.css";

const queryClient = new QueryClient();

function RootLayout() {
  return <Outlet />;
}

const rootRoute = createRootRoute({ component: RootLayout });

function requireAuth() {
  if (!isAuthenticated()) throw redirect({ to: "/login" });
}

function redirectIfAuth() {
  if (isAuthenticated()) throw redirect({ to: "/dashboard" });
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    if (isAuthenticated()) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/login" });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: redirectIfAuth,
  component: () => <AuthPage mode="login" />,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  beforeLoad: redirectIfAuth,
  component: () => <AuthPage mode="register" />,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  beforeLoad: requireAuth,
  component: DashboardPage,
});

const pipelinesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pipelines",
  beforeLoad: requireAuth,
  component: PipelinesListPage,
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pipelines/$pipelineId/edit",
  beforeLoad: requireAuth,
  component: PipelineEditorPage,
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  beforeLoad: requireAuth,
  component: RunsListPage,
});

const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  beforeLoad: requireAuth,
  component: RunDetailPage,
});

const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schedules",
  beforeLoad: requireAuth,
  component: SchedulesPage,
});

const newScheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schedules/new",
  beforeLoad: requireAuth,
  component: NewSchedulePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  beforeLoad: requireAuth,
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  dashboardRoute,
  pipelinesRoute,
  editorRoute,
  runsRoute,
  runRoute,
  schedulesRoute,
  newScheduleRoute,
  settingsRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
