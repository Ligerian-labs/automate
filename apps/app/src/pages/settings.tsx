import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/app-shell";
import { apiFetch, type UsageRecord, type UserMe } from "../lib/api";

const tabs = ["Profile", "API Keys", "Secrets", "Billing", "Danger Zone"] as const;

export function SettingsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Profile");
  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => apiFetch<UserMe>("/api/user/me") });
  const usageQuery = useQuery({ queryKey: ["usage"], queryFn: () => apiFetch<UsageRecord>("/api/user/usage") });

  const usage = useMemo(() => usageQuery.data, [usageQuery.data]);

  return (
    <AppShell title="Settings" subtitle="Manage your account, API keys, and billing">
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-2">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm ${
                tab === item ? "bg-[var(--bg-inset)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {tab === "Profile" ? (
            <section className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4">
              <h2 className="font-semibold">Profile</h2>
              {meQuery.isLoading ? <p className="mt-2 text-sm text-[var(--text-tertiary)]">Loading profile...</p> : null}
              {meQuery.data ? (
                <dl className="mt-4 grid gap-2 text-sm">
                  <div>
                    <dt className="text-[var(--text-tertiary)]">Name</dt>
                    <dd>{meQuery.data.name || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-tertiary)]">Email</dt>
                    <dd>{meQuery.data.email}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-tertiary)]">Plan</dt>
                    <dd className="capitalize">{meQuery.data.plan}</dd>
                  </div>
                </dl>
              ) : null}
            </section>
          ) : null}

          {tab === "API Keys" ? (
            <section className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4">
              <h2 className="font-semibold">API Keys</h2>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">Manage your API credentials.</p>
              <button type="button" className="mt-4 rounded-md border border-[var(--divider)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                Generate key (coming soon)
              </button>
            </section>
          ) : null}

          {tab === "Secrets" ? (
            <section className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4">
              <h2 className="font-semibold">Secrets</h2>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">Store provider tokens and secure variables.</p>
              <button type="button" className="mt-4 rounded-md border border-[var(--divider)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                Add secret (coming soon)
              </button>
            </section>
          ) : null}

          {tab === "Billing" ? (
            <section className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-4">
              <h2 className="font-semibold">Billing</h2>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">Manage billing</p>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile label="Credits used" value={String(usage?.credits_used ?? 0)} />
                <Tile label="Credits remaining" value={String(usage?.credits_remaining ?? 0)} />
                <Tile label="Runs today" value={String(usage?.runs_today ?? 0)} />
                <Tile label="Cost" value={`${((usage?.total_cost_cents ?? 0) / 100).toFixed(2)}€`} />
              </div>
              <div className="mt-4 rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Credit usage</span>
                  <span className="text-[var(--text-primary)]">
                    {(usage?.credits_used ?? 0) + (usage?.credits_remaining ?? 0) > 0
                      ? `${usage?.credits_used ?? 0} / ${(usage?.credits_used ?? 0) + (usage?.credits_remaining ?? 0)}`
                      : "0 / 0"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--divider)]">
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
            </section>
          ) : null}

          {tab === "Danger Zone" ? (
            <section className="rounded-xl border border-red-500/40 bg-[var(--bg-surface)] p-4">
              <h2 className="font-semibold text-red-300">Danger Zone</h2>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Permanently delete your account and all pipeline data. This action cannot be undone.
              </p>
              <button type="button" className="mt-4 rounded-md border border-red-500/50 px-3 py-2 text-sm text-red-200 opacity-70" disabled>
                Delete account (unavailable)
              </button>
            </section>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--divider)] bg-[var(--bg-inset)] p-3">
      <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
