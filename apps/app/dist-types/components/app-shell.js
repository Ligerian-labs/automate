import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@automate/ui";
import { clearToken } from "../lib/auth";
const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: "▣" },
    { to: "", label: "Pipelines", icon: "◇" },
    { to: "", label: "Runs", icon: "▷" },
    { to: "", label: "Schedules", icon: "◷" },
    { to: "", label: "Templates", icon: "▤" },
];
export function AppShell({ title, subtitle, children }) {
    const location = useLocation();
    const navigate = useNavigate();
    return (_jsxs("div", { className: "min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] lg:flex", children: [_jsxs("aside", { className: "border-b border-[var(--divider)] bg-[var(--bg-inset)] p-4 lg:flex lg:min-h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r", children: [_jsxs("div", { className: "mb-8 flex items-center gap-2", children: [_jsx("div", { className: "grid size-8 place-items-center rounded-md bg-[var(--accent)] text-[var(--bg-primary)] font-bold", children: "A" }), _jsx("div", { className: "font-semibold tracking-tight", children: "Automate" })] }), _jsx("nav", { className: "space-y-1", children: navItems.map((item) => {
                            const active = item.to && location.pathname.startsWith(item.to);
                            if (!item.to) {
                                return (_jsxs("span", { className: "block rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] opacity-90", children: [_jsx("span", { className: "mr-2 inline-block w-4 text-center text-xs", children: item.icon }), item.label] }, item.label));
                            }
                            return (_jsxs(Link, { to: item.to, className: cn("block rounded-md px-3 py-2 text-sm", active
                                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)]"
                                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"), children: [_jsx("span", { className: "mr-2 inline-block w-4 text-center text-xs", children: item.icon }), item.label] }, item.to));
                        }) }), _jsx("div", { className: "mt-8 rounded-md bg-[var(--bg-surface)] px-2 py-2 text-sm", children: _jsx(Link, { to: "/settings", className: cn("block rounded-md px-2 py-1 text-[var(--text-secondary)]", location.pathname.startsWith("/settings") ? "bg-[var(--bg-inset)] text-[var(--text-primary)]" : ""), children: "\u2699 Settings" }) }), _jsxs("div", { className: "mt-4 border-t border-[var(--divider)] pt-3 lg:mt-auto", children: [_jsx("button", { type: "button", className: "w-full rounded-md border border-[var(--divider)] px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]", onClick: () => {
                                    clearToken();
                                    navigate({ to: "/login" });
                                }, children: "Log out" }), _jsxs("div", { className: "mt-3 flex items-center gap-2 rounded-md border border-[var(--divider)] p-2", children: [_jsx("div", { className: "grid size-7 place-items-center rounded-full bg-[var(--bg-surface)] text-xs font-semibold", children: "VD" }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-xs text-[var(--text-primary)]", children: "Valentin D." }), _jsx("p", { className: "truncate text-[10px] text-[var(--text-tertiary)]", children: "Pro plan" })] })] })] })] }), _jsxs("main", { className: "flex-1 p-4 sm:p-6 lg:p-10", children: [_jsxs("header", { className: "mb-6 border-b border-[var(--divider)] pb-4", children: [_jsx("h1", { className: "text-2xl font-semibold", children: title }), subtitle ? _jsx("p", { className: "mt-1 text-sm text-[var(--text-tertiary)]", children: subtitle }) : null] }), children] })] }));
}
//# sourceMappingURL=app-shell.js.map