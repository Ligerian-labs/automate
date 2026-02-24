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
    return (_jsx("div", { className: "grid min-h-screen place-items-center bg-[var(--bg-primary)] p-4", children: _jsxs("div", { className: "w-full max-w-md rounded-2xl border border-[var(--divider)] bg-[var(--bg-surface)] p-8 shadow-xl", children: [_jsxs("div", { className: "mb-8 text-center", children: [_jsx("div", { className: "mx-auto mb-4 grid size-11 place-items-center rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] font-bold", children: "A" }), _jsx("h1", { className: "text-2xl font-bold text-[var(--text-primary)]", children: mode === "login" ? "Welcome back" : "Create account" }), _jsx("p", { className: "mt-2 text-sm text-[var(--text-tertiary)]", children: mode === "login" ? "Sign in to continue" : "Start building AI pipelines" })] }), _jsxs("form", { className: "space-y-4", onSubmit: handleSubmit, children: [mode === "register" ? (_jsxs("label", { className: "block text-sm", children: [_jsx("span", { className: "mb-1 block text-[var(--text-secondary)]", children: "Name" }), _jsx("input", { className: "w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-[var(--text-primary)]", value: name, onChange: (e) => setName(e.target.value), placeholder: "Valentin", required: true })] })) : null, _jsxs("label", { className: "block text-sm", children: [_jsx("span", { className: "mb-1 block text-[var(--text-secondary)]", children: "Email" }), _jsx("input", { className: "w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-[var(--text-primary)]", value: email, onChange: (e) => setEmail(e.target.value), type: "email", placeholder: "you@company.com", required: true })] }), _jsxs("label", { className: "block text-sm", children: [_jsx("span", { className: "mb-1 block text-[var(--text-secondary)]", children: "Password" }), _jsx("input", { className: "w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3 py-2 text-[var(--text-primary)]", value: password, onChange: (e) => setPassword(e.target.value), type: "password", minLength: mode === "register" ? 8 : 1, required: true })] }), error ? _jsx("p", { className: "rounded-md bg-red-500/10 p-2 text-sm text-red-300", children: error }) : null, _jsx("button", { type: "submit", disabled: loading, className: "w-full rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--bg-primary)] disabled:opacity-60", children: loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account" })] }), _jsxs("div", { className: "my-5 flex items-center gap-3", children: [_jsx("div", { className: "h-px flex-1 bg-[var(--divider)]" }), _jsx("span", { className: "text-xs text-[var(--text-muted)]", children: "or" }), _jsx("div", { className: "h-px flex-1 bg-[var(--divider)]" })] }), _jsx("button", { type: "button", className: "w-full rounded-md border border-[var(--text-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]", children: "Continue with GitHub" }), _jsxs("p", { className: "mt-4 text-center text-sm text-[var(--text-tertiary)]", children: [mode === "login" ? "Don't have an account?" : "Already have an account?", " ", _jsx("a", { className: "font-semibold text-[var(--accent)]", href: mode === "login" ? "/register" : "/login", children: mode === "login" ? "Sign up" : "Sign in" })] })] }) }));
}
//# sourceMappingURL=auth-page.js.map