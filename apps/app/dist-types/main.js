import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider, redirect, } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { DashboardPage } from "./pages/dashboard";
import { PipelineEditorPage } from "./pages/pipeline-editor";
import { RunDetailPage } from "./pages/run-detail";
import { SettingsPage } from "./pages/settings";
import { AuthPage } from "./pages/auth-page";
import { isAuthenticated } from "./lib/auth";
import "./styles.css";
const queryClient = new QueryClient();
function RootLayout() {
    return (_jsxs(_Fragment, { children: [_jsx(Outlet, {}), _jsx(TanStackRouterDevtools, {})] }));
}
const rootRoute = createRootRoute({ component: RootLayout });
function requireAuth() {
    if (!isAuthenticated())
        throw redirect({ to: "/login" });
}
function redirectIfAuth() {
    if (isAuthenticated())
        throw redirect({ to: "/dashboard" });
}
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: () => {
        if (isAuthenticated())
            throw redirect({ to: "/dashboard" });
        throw redirect({ to: "/login" });
    },
});
const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    beforeLoad: redirectIfAuth,
    component: () => _jsx(AuthPage, { mode: "login" }),
});
const registerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/register",
    beforeLoad: redirectIfAuth,
    component: () => _jsx(AuthPage, { mode: "register" }),
});
const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/dashboard",
    beforeLoad: requireAuth,
    component: DashboardPage,
});
const editorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pipelines/$pipelineId/edit",
    beforeLoad: requireAuth,
    component: PipelineEditorPage,
});
const runRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/runs/$runId",
    beforeLoad: requireAuth,
    component: RunDetailPage,
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
    editorRoute,
    runRoute,
    settingsRoute,
]);
const router = createRouter({ routeTree });
const rootElement = document.getElementById("root");
if (!rootElement)
    throw new Error("Root element not found");
createRoot(rootElement).render(_jsx(StrictMode, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(RouterProvider, { router: router }) }) }));
//# sourceMappingURL=main.js.map