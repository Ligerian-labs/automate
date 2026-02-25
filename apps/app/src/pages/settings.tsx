import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "../components/app-shell";
import {
  ApiError,
  type SecretRecord,
  type UsageRecord,
  type UserMe,
  apiFetch,
} from "../lib/api";

const tabs = ["Profile", "API Keys", "Secrets", "Billing"] as const;

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Profile");
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretUpdateName, setSecretUpdateName] = useState<string | null>(null);
  const [secretUpdateValue, setSecretUpdateValue] = useState("");
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretSuccess, setSecretSuccess] = useState<string | null>(null);
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/user/me"),
  });
  const usageQ = useQuery({
    queryKey: ["usage"],
    queryFn: () => apiFetch<UsageRecord>("/api/user/usage"),
  });
  const secretsQ = useQuery({
    queryKey: ["user-secrets"],
    queryFn: () => apiFetch<SecretRecord[]>("/api/user/secrets"),
  });
  const usage = useMemo(() => usageQ.data, [usageQ.data]);

  const createSecretMut = useMutation({
    mutationFn: (payload: { name: string; value: string }) =>
      apiFetch<SecretRecord>("/api/user/secrets", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setSecretName("");
      setSecretValue("");
      setSecretError(null);
      setSecretSuccess("Secret saved");
      queryClient.invalidateQueries({ queryKey: ["user-secrets"] });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to create secret";
      setSecretSuccess(null);
      setSecretError(message);
    },
  });

  const deleteSecretMut = useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ deleted: boolean }>(
        `/api/user/secrets/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      setSecretError(null);
      setSecretSuccess("Secret removed");
      queryClient.invalidateQueries({ queryKey: ["user-secrets"] });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to delete secret";
      setSecretSuccess(null);
      setSecretError(message);
    },
  });

  const updateSecretMut = useMutation({
    mutationFn: (payload: { name: string; value: string }) =>
      apiFetch<SecretRecord>(
        `/api/user/secrets/${encodeURIComponent(payload.name)}`,
        {
          method: "PUT",
          body: JSON.stringify({ value: payload.value }),
        },
      ),
    onSuccess: (_, payload) => {
      setSecretUpdateValue("");
      setSecretUpdateName(null);
      setSecretError(null);
      setSecretSuccess(`Secret "${payload.name}" updated`);
      queryClient.invalidateQueries({ queryKey: ["user-secrets"] });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to update secret";
      setSecretSuccess(null);
      setSecretError(message);
    },
  });

  function submitSecret() {
    setSecretSuccess(null);
    const normalizedName = secretName.trim().toUpperCase();
    if (!normalizedName || !secretValue.trim()) {
      setSecretError("Name and value are required");
      return;
    }
    createSecretMut.mutate({
      name: normalizedName,
      value: secretValue,
    });
  }

  function submitSecretUpdate() {
    if (!secretUpdateName || !secretUpdateValue.trim()) {
      setSecretError("New secret value is required");
      return;
    }
    setSecretSuccess(null);
    updateSecretMut.mutate({
      name: secretUpdateName,
      value: secretUpdateValue,
    });
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Manage your account, API keys, and billing"
    >
      <div className="flex gap-6">
        {/* Tab sidebar — 200px, cornerRadius 8 */}
        <div className="flex w-[200px] shrink-0 flex-col gap-1">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                tab === item
                  ? "bg-[var(--bg-surface)] font-medium text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="flex flex-1 flex-col gap-5">
          {tab === "Profile" ? (
            <>
              {/* Profile card — cornerRadius 12, padding 20 */}
              <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
                <h2 className="mb-4 text-[15px] font-semibold">
                  Profile Information
                </h2>
                {meQ.isLoading ? (
                  <p className="text-sm text-[var(--text-tertiary)]">
                    Loading...
                  </p>
                ) : null}
                {meQ.data ? (
                  <div className="flex flex-col gap-4">
                    {/* Name / Email row — inputs cornerRadius 6 */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-[var(--text-secondary)]">
                          Name
                        </span>
                        <input
                          className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                          defaultValue={meQ.data.name || ""}
                          placeholder="Your name"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-[var(--text-secondary)]">
                          Email
                        </span>
                        <input
                          className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                          defaultValue={meQ.data.email}
                          readOnly
                        />
                      </label>
                    </div>
                    {/* Save button — cornerRadius 8 */}
                    <button
                      type="button"
                      className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)]"
                    >
                      Save changes
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Plan card — cornerRadius 12 */}
              <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[15px] font-semibold">Current Plan</h2>
                    {/* Badge — cornerRadius 100 */}
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize"
                      style={{
                        background: "rgba(34,211,238,0.15)",
                        color: "var(--accent)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {meQ.data?.plan || "Free"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--text-muted)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Upgrade Plan
                  </button>
                </div>
                {/* Usage bar — track cornerRadius 4, fill cornerRadius 4 */}
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">
                      Credit usage
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>
                      {usage?.credits_used ?? 0} /{" "}
                      {(usage?.credits_used ?? 0) +
                        (usage?.credits_remaining ?? 0)}
                    </span>
                  </div>
                  <div className="h-2 rounded bg-[var(--bg-inset)]">
                    <div
                      className="h-2 rounded bg-[var(--accent)]"
                      style={{
                        width:
                          (usage?.credits_used ?? 0) +
                            (usage?.credits_remaining ?? 0) >
                          0
                            ? `${(((usage?.credits_used ?? 0) / ((usage?.credits_used ?? 0) + (usage?.credits_remaining ?? 0))) * 100).toFixed(0)}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Danger zone — cornerRadius 12 */}
              <div className="rounded-xl border border-red-500/30 bg-[var(--bg-surface)] p-5">
                <h2 className="mb-2 text-[15px] font-semibold text-red-400">
                  Danger Zone
                </h2>
                <p className="mb-4 text-sm text-[var(--text-tertiary)]">
                  Permanently delete your account and all pipeline data. This
                  cannot be undone.
                </p>
                <button
                  type="button"
                  className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 opacity-60"
                  disabled
                >
                  Delete account
                </button>
              </div>
            </>
          ) : null}

          {tab === "API Keys" ? (
            <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
              <h2 className="mb-2 text-[15px] font-semibold">API Keys</h2>
              <p className="mb-4 text-sm text-[var(--text-tertiary)]">
                Manage your API credentials for programmatic access.
              </p>
              <button
                type="button"
                className="rounded-lg border border-[var(--divider)] px-4 py-2 text-sm text-[var(--text-secondary)]"
              >
                Generate key (coming soon)
              </button>
            </div>
          ) : null}

          {tab === "Secrets" ? (
            <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
              <h2 className="mb-2 text-[15px] font-semibold">Secrets</h2>
              <p className="mb-4 text-sm text-[var(--text-tertiary)]">
                Store provider tokens and secure variables for use in pipelines.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    Secret name
                  </span>
                  <input
                    className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 font-[var(--font-mono)] text-[13px] uppercase focus:border-[var(--accent)] focus:outline-none"
                    value={secretName}
                    onChange={(e) => setSecretName(e.target.value)}
                    placeholder="OPENAI_API_KEY"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    Secret value
                  </span>
                  <input
                    type="password"
                    className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 font-[var(--font-mono)] text-[13px] focus:border-[var(--accent)] focus:outline-none"
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    placeholder="sk-..."
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={submitSecret}
                  disabled={createSecretMut.isPending}
                  className="cursor-pointer rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createSecretMut.isPending ? "Saving..." : "Save secret"}
                </button>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Use in prompts with{" "}
                  <code className="font-[var(--font-mono)]">
                    {"{{env.SECRET_NAME}}"}
                  </code>
                </p>
              </div>

              {secretError ? (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {secretError}
                </p>
              ) : null}
              {secretSuccess ? (
                <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                  {secretSuccess}
                </p>
              ) : null}

              <div className="mt-5 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-inset)]">
                <div className="flex items-center justify-between border-b border-[var(--divider)] px-4 py-3">
                  <h3 className="text-sm font-semibold">Stored secrets</h3>
                  <span
                    className="text-xs text-[var(--text-tertiary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    values are never returned
                  </span>
                </div>
                {secretsQ.isLoading ? (
                  <p className="px-4 py-4 text-sm text-[var(--text-tertiary)]">
                    Loading secrets...
                  </p>
                ) : null}
                {secretsQ.isError ? (
                  <p className="px-4 py-4 text-sm text-red-300">
                    Failed to load secrets
                  </p>
                ) : null}
                {secretsQ.data && secretsQ.data.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-[var(--text-tertiary)]">
                    No secrets yet
                  </p>
                ) : null}
                {secretsQ.data?.map((secret) => (
                  <div
                    key={secret.id}
                    className="flex items-center justify-between border-t border-[var(--divider)] px-4 py-3 first:border-t-0"
                  >
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {secret.name}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Updated{" "}
                        {new Date(
                          secret.updatedAt ?? secret.updated_at ?? Date.now(),
                        ).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSecretError(null);
                        setSecretSuccess(null);
                        setSecretUpdateValue("");
                        setSecretUpdateName(secret.name);
                      }}
                      className="cursor-pointer rounded-lg border border-[var(--divider)] px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Rotate value
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSecretMut.mutate(secret.name)}
                      disabled={deleteSecretMut.isPending}
                      className="cursor-pointer rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              {secretUpdateName ? (
                <div className="mt-4 rounded-[10px] border border-[var(--divider)] bg-[var(--bg-inset)] p-4">
                  <h3 className="text-sm font-semibold">Rotate secret value</h3>
                  <p
                    className="mt-1 text-xs text-[var(--text-tertiary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {secretUpdateName}
                  </p>
                  <label className="mt-3 flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      New value
                    </span>
                    <input
                      type="password"
                      className="w-full rounded-[6px] border border-[var(--divider)] bg-[var(--bg-surface)] px-3.5 py-2.5 font-[var(--font-mono)] text-[13px] focus:border-[var(--accent)] focus:outline-none"
                      value={secretUpdateValue}
                      onChange={(e) => setSecretUpdateValue(e.target.value)}
                      placeholder="Enter new secret value"
                    />
                  </label>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={submitSecretUpdate}
                      disabled={updateSecretMut.isPending}
                      className="cursor-pointer rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {updateSecretMut.isPending ? "Updating..." : "Update value"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSecretUpdateName(null);
                        setSecretUpdateValue("");
                      }}
                      className="cursor-pointer rounded-lg border border-[var(--divider)] px-4 py-2 text-sm text-[var(--text-secondary)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "Billing" ? (
            <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
              <h2 className="mb-2 text-[15px] font-semibold">Billing</h2>
              <p className="mb-4 text-sm text-[var(--text-tertiary)]">
                View usage and manage your subscription.
              </p>
              <div className="grid grid-cols-4 gap-4">
                <Tile
                  label="Credits used"
                  value={String(usage?.credits_used ?? 0)}
                />
                <Tile
                  label="Credits left"
                  value={String(usage?.credits_remaining ?? 0)}
                />
                <Tile
                  label="Runs today"
                  value={String(usage?.runs_today ?? 0)}
                />
                <Tile
                  label="Total cost"
                  value={`€${((usage?.total_cost_cents ?? 0) / 100).toFixed(2)}`}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--divider)] bg-[var(--bg-inset)] p-4">
      <p
        className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "1.5px" }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-lg font-bold"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </p>
    </div>
  );
}
