import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { AppShell } from "../components/app-shell";
import { ApiError, type AdminDiscountCode, type UserMe, apiFetch } from "../lib/api";

type DiscountForm = {
  code: string;
  active: boolean;
  kind: "percent_off" | "free_cycles";
  percent_off: string;
  free_cycles_count: string;
  free_cycles_interval: "month" | "year";
  applies_to_plan: "" | "starter" | "pro";
  applies_to_interval: "" | "month" | "year";
  allowed_emails: string;
  max_redemptions: string;
  starts_at: string;
  expires_at: string;
};

const initialForm: DiscountForm = {
  code: "",
  active: true,
  kind: "percent_off",
  percent_off: "20",
  free_cycles_count: "1",
  free_cycles_interval: "month",
  applies_to_plan: "",
  applies_to_interval: "",
  allowed_emails: "",
  max_redemptions: "",
  starts_at: "",
  expires_at: "",
};

export function AdminPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<DiscountForm>(initialForm);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/user/me"),
  });

  const codesQ = useQuery({
    queryKey: ["admin-discount-codes"],
    queryFn: () =>
      apiFetch<{ items: AdminDiscountCode[] }>("/api/billing/discount-codes"),
    enabled: Boolean(meQ.data?.isAdmin),
  });

  const upsertMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<{ ok: true; code: string }>("/api/billing/discount-codes", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      setError(null);
      setSuccess(`Saved code ${res.code}`);
      qc.invalidateQueries({ queryKey: ["admin-discount-codes"] });
    },
    onError: (err) => {
      setSuccess(null);
      setError(err instanceof ApiError ? err.message : "Failed to save code");
    },
  });

  const isAdmin = Boolean(meQ.data?.isAdmin);

  const normalizedCodes = useMemo(
    () => [...(codesQ.data?.items || [])].sort((a, b) => a.code.localeCompare(b.code)),
    [codesQ.data?.items],
  );

  function toDatetimeLocal(value: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function loadCodeForEdit(item: AdminDiscountCode) {
    setEditingCode(item.code);
    setForm({
      code: item.code,
      active: item.active,
      kind: item.kind,
      percent_off: item.percentOff != null ? String(item.percentOff) : "20",
      free_cycles_count:
        item.freeCyclesCount != null ? String(item.freeCyclesCount) : "1",
      free_cycles_interval: item.freeCyclesInterval ?? "month",
      applies_to_plan: item.appliesToPlan ?? "",
      applies_to_interval: item.appliesToInterval ?? "",
      allowed_emails: item.allowedEmails.join(", "),
      max_redemptions:
        item.maxRedemptions != null ? String(item.maxRedemptions) : "",
      starts_at: toDatetimeLocal(item.startsAt),
      expires_at: toDatetimeLocal(item.expiresAt),
    });
    setError(null);
    setSuccess(null);
  }

  function resetCreateForm() {
    setEditingCode(null);
    setForm(initialForm);
    setError(null);
    setSuccess(null);
  }

  if (meQ.isLoading) {
    return (
      <AppShell title="Admin" subtitle="Loading admin access...">
        <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5 text-sm text-[var(--text-secondary)]">
          Loading...
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    throw notFound();
  }

  function toIso(value: string): string | undefined {
    if (!value.trim()) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const payload: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      active: form.active,
      kind: form.kind,
      applies_to_plan: form.applies_to_plan || undefined,
      applies_to_interval: form.applies_to_interval || undefined,
      allowed_emails: form.allowed_emails
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      max_redemptions: form.max_redemptions
        ? Number(form.max_redemptions)
        : undefined,
      starts_at: toIso(form.starts_at),
      expires_at: toIso(form.expires_at),
    };

    if (form.kind === "percent_off") {
      payload.percent_off = Number(form.percent_off);
    } else {
      payload.free_cycles_count = Number(form.free_cycles_count);
      payload.free_cycles_interval = form.free_cycles_interval;
    }

    upsertMut.mutate(payload);
  }

  return (
    <AppShell title="Admin" subtitle="Manage billing discount codes">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px,1fr]">
        <form
          className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5"
          onSubmit={submit}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">
              {editingCode ? `Edit Code: ${editingCode}` : "Create Discount Code"}
            </h2>
            {editingCode ? (
              <button
                type="button"
                onClick={resetCreateForm}
                className="rounded-lg border border-[var(--divider)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]"
              >
                Create new code
              </button>
            ) : null}
          </div>
          <div className="space-y-3">
            <Field label="Code">
              <input
                value={form.code}
                onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                placeholder="STARTER20Y"
                disabled={Boolean(editingCode)}
                required
              />
            </Field>

            <Field label="Type">
              <select
                value={form.kind}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    kind: e.target.value as DiscountForm["kind"],
                  }))
                }
                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
              >
                <option value="percent_off">Percent off</option>
                <option value="free_cycles">Free first cycles</option>
              </select>
            </Field>

            {form.kind === "percent_off" ? (
              <Field label="Percent off">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.percent_off}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, percent_off: e.target.value }))
                  }
                  className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                  required
                />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Free cycles">
                  <input
                    type="number"
                    min={1}
                    value={form.free_cycles_count}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, free_cycles_count: e.target.value }))
                    }
                    className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                    required
                  />
                </Field>
                <Field label="Cycle unit">
                  <select
                    value={form.free_cycles_interval}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        free_cycles_interval: e.target.value as "month" | "year",
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                  >
                    <option value="month">month</option>
                    <option value="year">year</option>
                  </select>
                </Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Field label="Plan scope">
                <select
                  value={form.applies_to_plan}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      applies_to_plan: e.target.value as DiscountForm["applies_to_plan"],
                    }))
                  }
                  className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                >
                  <option value="">all</option>
                  <option value="starter">starter</option>
                  <option value="pro">pro</option>
                </select>
              </Field>

              <Field label="Interval scope">
                <select
                  value={form.applies_to_interval}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      applies_to_interval:
                        e.target.value as DiscountForm["applies_to_interval"],
                    }))
                  }
                  className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                >
                  <option value="">all</option>
                  <option value="month">month</option>
                  <option value="year">year</option>
                </select>
              </Field>
            </div>

            <Field label="Allowed emails (comma-separated)">
              <input
                value={form.allowed_emails}
                onChange={(e) =>
                  setForm((s) => ({ ...s, allowed_emails: e.target.value }))
                }
                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                placeholder="vip@company.com, founder@company.com"
              />
            </Field>

            <Field label="Max redemptions">
              <input
                type="number"
                min={1}
                value={form.max_redemptions}
                onChange={(e) =>
                  setForm((s) => ({ ...s, max_redemptions: e.target.value }))
                }
                className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                placeholder="Optional"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Starts at">
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm((s) => ({ ...s, starts_at: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Expires at">
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm((s) => ({ ...s, expires_at: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--divider)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))}
              />
              Active
            </label>

            <button
              type="submit"
              disabled={upsertMut.isPending}
              className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-60"
            >
              {upsertMut.isPending
                ? "Saving..."
                : editingCode
                  ? "Update code"
                  : "Save code"}
            </button>

            {success ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                {success}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}
          </div>
        </form>

        <div className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Existing Codes</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--divider)] text-left text-[var(--text-tertiary)]">
                  <th className="px-2 py-2">Code</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Scope</th>
                  <th className="px-2 py-2">Redeemed</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {normalizedCodes.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--divider)]/70">
                    <td className="px-2 py-2 font-mono">{item.code}</td>
                    <td className="px-2 py-2">
                      {item.kind === "percent_off"
                        ? `${item.percentOff}% off`
                        : `${item.freeCyclesCount} ${item.freeCyclesInterval}(s) free`}
                    </td>
                    <td className="px-2 py-2">
                      {item.appliesToPlan || "all"} / {item.appliesToInterval || "all"}
                    </td>
                    <td className="px-2 py-2">
                      {item.redeemedCount}
                      {item.maxRedemptions ? ` / ${item.maxRedemptions}` : ""}
                    </td>
                    <td className="px-2 py-2">{item.active ? "active" : "inactive"}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => loadCodeForEdit(item)}
                        className="rounded-md border border-[var(--divider)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {codesQ.isLoading ? (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">Loading...</p>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-tertiary)]">
        {label}
      </span>
      {children}
    </div>
  );
}
