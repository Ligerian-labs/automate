import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@stepiq/ui";
import { clearToken } from "../lib/auth";
const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: "⊞" },
    { to: "/pipelines", label: "Pipelines", icon: "◇" },
    { to: "/runs", label: "Runs", icon: "▷" },
    { to: "/schedules", label: "Schedules", icon: "◷" },
    { to: "/templates", label: "Templates", icon: "▤" },
];
export function AppShell({ title, subtitle, actions, children, }) {
    const location = useLocation();
    const navigate = useNavigate();
    return (_jsxs("div", { className: "flex min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]", children: [_jsxs("aside", { className: "flex w-[260px] shrink-0 flex-col border-r border-[var(--divider)] bg-[var(--bg-inset)] px-5 py-6", style: { gap: 32 }, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "grid size-7 place-items-center rounded-[6px] bg-[var(--accent)] text-[10px] font-bold text-[var(--bg-primary)]", children: "sQ" }), _jsx("span", { className: "font-[var(--font-mono)] text-base font-bold tracking-tight", style: { fontFamily: "var(--font-mono)" }, children: "stepIQ" })] }), _jsx("nav", { className: "flex flex-col gap-1", children: navItems.map((item) => {
                            const active = item.to && location.pathname.startsWith(item.to);
                            const isPlaceholder = item.to !== "/dashboard" && item.to !== "/pipelines" && item.to !== "/runs";
                            if (isPlaceholder) {
                                return (_jsxs("span", { className: "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] opacity-60", children: [_jsx("span", { className: "w-[18px] text-center text-[var(--text-tertiary)]", children: item.icon }), item.label] }, item.label));
                            }
                            return (_jsxs(Link, { to: item.to, className: cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors", active
                                    ? "bg-[var(--bg-surface)] font-medium text-[var(--text-primary)]"
                                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"), children: [_jsx("span", { className: cn("w-[18px] text-center", active ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"), children: item.icon }), item.label] }, item.to));
                        }) }), _jsx("div", { className: "flex-1" }), _jsx("nav", { className: "flex flex-col gap-1", children: _jsxs(Link, { to: "/settings", className: cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors", location.pathname.startsWith("/settings")
                                ? "bg-[var(--bg-surface)] font-medium text-[var(--text-primary)]"
                                : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"), children: [_jsx("span", { className: cn("w-[18px] text-center", location.pathname.startsWith("/settings") ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"), children: "\u2699" }), "Settings"] }) }), _jsx("div", { className: "-mx-5 h-px bg-[var(--divider)]" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bg-surface)] text-[11px] font-semibold text-[var(--text-secondary)]", style: { fontFamily: "var(--font-mono)" }, children: "VD" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-[13px] font-medium", children: "Valentin D." }), _jsx("p", { className: "truncate text-[11px] text-[var(--text-tertiary)]", style: { fontFamily: "var(--font-mono)" }, children: "Pro plan" })] }), _jsx("button", { type: "button", title: "Log out", className: "rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-secondary)]", onClick: () => {
                                    clearToken();
                                    navigate({ to: "/login" });
                                }, children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", role: "img", "aria-label": "Log out", children: [_jsx("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }), _jsx("polyline", { points: "16 17 21 12 16 7" }), _jsx("line", { x1: "21", y1: "12", x2: "9", y2: "12" })] }) })] })] }), _jsxs("main", { className: "flex flex-1 flex-col overflow-auto px-10 py-8", style: { gap: 32 }, children: [_jsxs("header", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("h1", { className: "text-2xl font-bold", children: title }), subtitle ? (_jsx("p", { className: "text-sm text-[var(--text-tertiary)]", children: subtitle })) : null] }), actions ? _jsx("div", { className: "flex items-center gap-3", children: actions }) : null] }), children] })] }));
}
//# sourceMappingURL=app-shell.js.map