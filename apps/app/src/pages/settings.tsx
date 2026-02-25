import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/app-shell";
import { apiFetch, type UsageRecord, type UserMe } from "../lib/api";

const tabs = ["Profile", "API Keys", "Secrets", "Billing"] as const;

export function SettingsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Profile");
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => apiFetch<UserMe>("/api/user/me") });
  const usageQ = useQuery({ queryKey: ["usage"], queryFn: () => apiFetch<UsageRecord>("/api/user/usage") });
  const usage = useMemo(() => usageQ.data, [usageQ.data]);

  return (
    <AppShell title="Settings" subtitle="Manage your account, API keys, and billing">
      <div className="flex gap-6">
        {/* Tabs — left column, 200px per design */}
        <div className="w-[200px] shrink-0 space-y-1">
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
          <div className="!mt-4 h-px bg-[var(--divider)]" />
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10"
          >
            Danger Zone
          </button>
        </div>

        {/* Panel — right */}
        <div className="flex-1 space-y-5">
          {tab === "Profile" ? (
            <>
              {/* Profile card */}
              <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
                <h2 className="mb-4 text-[15px] font-semibold">Profile Information</h2>
                {meQ.isLoading ? (
                  <p className="text-sm text-[var(--text-tertiary)]">Loading...</p>
                ) : null}
                {meQ.data ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-[var(--text-secondary)]">Name</span>
                        <input
                          className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                          defaultValue={meQ.data.name || ""}
                          placeholder="Your name"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-[var(--text-secondary)]">Email</span>
                        <input
                          className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] focus:border-[var(--accent)] focus:outline-none"
                          defaultValue={meQ.data.email}
                          readOnly
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)]"
                    >
                      Save changes
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Plan card */}
              <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[15px] font-semibold">Current Plan</h2>
                    <span className="rounded-full bg-[var(--accent)]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
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
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Credit usage</span>
                    <span className="text-[var(--text-primary)]">
                      {usage?.credits_used ?? 0} / {(usage?.credits_used ?? 0) + (usage?.credits_remaining ?? 0)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-inset)]">
                    <div
                      className="h-2 rounded-full bg-[var(--accent)]"
                      style={{
                        width:
                          (usage?.credits_used ?? 0) + (usage?.credits_remaining ?? 0) > 0
                            ? `${(((usage?.credits_used ?? 0) / ((usage?.credits_used ?? 0) + (usage?.credits_remaining ?? 0))) * 100).toFixed(0)}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Danger zone */}
              <div className="rounded-xl border border-red-500/30 bg-[var(--bg-surface)] p-5">
                <h2 className="mb-2 text-[15px] font-semibold text-red-400">Danger Zone</h2>
                <p className="mb-4 text-sm text-[var(--text-tertiary)]">
                  Permanently delete your account and all pipeline data. This cannot be undone.
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
              <p className="mb-4 text-sm text-[var(--text-tertiary)]">Manage your API credentials for programmatic access.</p>
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
              <p className="mb-4 text-sm text-[var(--text-tertiary)]">Store provider tokens and secure variables for use in pipelines.</p>
              <button
                type="button"
                className="rounded-lg border border-[var(--divider)] px-4 py-2 text-sm text-[var(--text-secondary)]"
              >
                Add secret (coming soon)
              </button>
            </div>
          ) : null}

          {tab === "Billing" ? (
            <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
              <h2 className="mb-2 text-[15px] font-semibold">Billing</h2>
              <p className="mb-4 text-sm text-[var(--text-tertiary)]">View usage and manage your subscription.</p>
              <div className="grid grid-cols-4 gap-4">
                <Tile label="Credits used" value={String(usage?.credits_used ?? 0)} />
                <Tile label="Credits left" value={String(usage?.credits_remaining ?? 0)} />
                <Tile label="Runs today" value={String(usage?.runs_today ?? 0)} />
                <Tile label="Total cost" value={`€${((usage?.total_cost_cents ?? 0) / 100).toFixed(2)}`} />
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
    <div className="rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  );
}
