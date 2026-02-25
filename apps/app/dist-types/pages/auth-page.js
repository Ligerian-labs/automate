import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { apiFetch } from "../lib/api";
import { setToken } from "../lib/auth";
export function AuthPage({ mode }) {
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    async function handleSubmit(event) {
        event.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
            const body = mode === "login" ? { email, password } : { email, password, name };
            const response = await apiFetch(path, { method: "POST", body: JSON.stringify(body) }, false);
            setToken(response.token);
            navigate({ to: "/dashboard" });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Authentication failed");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "grid min-h-screen place-items-center bg-[var(--bg-primary)] p-4", children: _jsxs("div", { className: "w-full max-w-[420px] rounded-2xl border border-[var(--divider)] bg-[var(--bg-surface)] p-8 shadow-2xl", children: [_jsxs("div", { className: "mb-6 flex flex-col items-center gap-3", children: [_jsx("div", { className: "grid size-9 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-[var(--bg-primary)]", children: "sQ" }), _jsxs("div", { children: [_jsx("h1", { className: "text-center text-2xl font-bold text-[var(--text-primary)]", children: mode === "login" ? "Welcome back" : "Create account" }), _jsx("p", { className: "mt-1 text-center text-sm text-[var(--text-tertiary)]", children: mode === "login" ? "Sign in to continue to stepIQ" : "Start building AI pipelines" })] })] }), _jsxs("form", { className: "space-y-4", onSubmit: handleSubmit, children: [mode === "register" ? (_jsxs("label", { className: "block text-sm", children: [_jsx("span", { className: "mb-1.5 block text-xs font-medium text-[var(--text-secondary)]", children: "Name" }), _jsx("input", { className: "w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none", value: name, onChange: (e) => setName(e.target.value), placeholder: "Valentin", required: true })] })) : null, _jsxs("label", { className: "block text-sm", children: [_jsx("span", { className: "mb-1.5 block text-xs font-medium text-[var(--text-secondary)]", children: "Email" }), _jsx("input", { className: "w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none", value: email, onChange: (e) => setEmail(e.target.value), type: "email", placeholder: "you@company.com", required: true })] }), _jsxs("label", { className: "block text-sm", children: [_jsxs("div", { className: "mb-1.5 flex items-center justify-between", children: [_jsx("span", { className: "text-xs font-medium text-[var(--text-secondary)]", children: "Password" }), mode === "login" ? (_jsx("button", { type: "button", className: "text-xs text-[var(--accent)] hover:underline", children: "Forgot?" })) : null] }), _jsx("input", { className: "w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none", value: password, onChange: (e) => setPassword(e.target.value), type: "password", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", minLength: mode === "register" ? 8 : 1, required: true })] }), error ? (_jsx("p", { className: "rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300", children: error })) : null, _jsx("button", { type: "submit", disabled: loading, className: "w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] transition-opacity disabled:opacity-60 hover:opacity-90", children: loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account" })] }), _jsxs("div", { className: "my-5 flex items-center gap-3", children: [_jsx("div", { className: "h-px flex-1 bg-[var(--divider)]" }), _jsx("span", { className: "text-xs text-[var(--text-muted)]", children: "or" }), _jsx("div", { className: "h-px flex-1 bg-[var(--divider)]" })] }), _jsxs("button", { type: "button", className: "flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--text-muted)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]", children: [_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "currentColor", role: "img", "aria-label": "GitHub", children: _jsx("path", { d: "M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" }) }), "Continue with GitHub"] }), _jsxs("p", { className: "mt-5 text-center text-sm text-[var(--text-tertiary)]", children: [mode === "login" ? "Don't have an account?" : "Already have an account?", " ", _jsx("a", { className: "font-semibold text-[var(--accent)] hover:underline", href: mode === "login" ? "/register" : "/login", children: mode === "login" ? "Sign up" : "Sign in" })] })] }) }));
}
//# sourceMappingURL=auth-page.js.map