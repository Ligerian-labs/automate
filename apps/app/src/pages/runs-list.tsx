import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { type RunRecord, apiFetch } from "../lib/api";

export function RunsListPage() {
  const navigate = useNavigate();
  const runsQ = useQuery({
    queryKey: ["runs"],
    queryFn: () => apiFetch<RunRecord[]>("/api/runs?limit=50"),
  });
  const runs = [...(runsQ.data ?? [])].sort((a, b) => {
    const aTime = new Date(a.createdAt || a.created_at || 0).getTime();
    const bTime = new Date(b.createdAt || b.created_at || 0).getTime();
    return bTime - aTime;
  });

  return (
    <AppShell title="Runs" subtitle="View all pipeline execution history">
      <section className="overflow-x-auto rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]">
        <div
          className="grid items-center bg-[var(--bg-inset)] px-5 py-3.5"
          style={{
            gridTemplateColumns:
              "minmax(200px,1fr) 120px 120px 100px 100px 120px",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
            Run ID
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
            Status
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
            Trigger
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
            Steps
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
            Tokens
          </span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
            Cost
          </span>
        </div>

        {runsQ.isLoading ? (
          <p className="p-5 text-sm text-[var(--text-tertiary)]">
            Loading runs...
          </p>
        ) : null}
        {runsQ.isError ? (
          <p className="p-5 text-sm text-red-300">
            {runsQ.error instanceof Error
              ? runsQ.error.message
              : "Failed to load"}
          </p>
        ) : null}

        <div className="divide-y divide-[var(--divider)]">
          {runs.map((run) => {
            const status = run.status || "pending";
            return (
              <button
                key={run.id}
                type="button"
                className="grid w-full items-center px-5 py-4 text-left transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{
                  gridTemplateColumns:
                    "minmax(200px,1fr) 120px 120px 100px 100px 120px",
                }}
                onClick={() =>
                  navigate({ to: "/runs/$runId", params: { runId: run.id } })
                }
              >
                <div className="flex flex-col gap-0.5">
                  <p
                    className="text-sm font-medium"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {run.id.slice(0, 8)}...
                  </p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {run.createdAt || run.created_at
                      ? timeAgo(new Date(run.createdAt || run.created_at || ""))
                      : "-"}
                  </p>
                </div>
                <div>
                  <RunStatusBadge status={status} />
                </div>
                <div
                  className="text-[13px] text-[var(--text-secondary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {run.triggerType || run.trigger_type || "manual"}
                </div>
                <div
                  className="text-[13px] text-[var(--text-secondary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {(run.steps ?? []).length}
                </div>
                <div
                  className="text-[13px] text-[var(--text-secondary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {run.totalTokens ?? run.total_tokens ?? 0}
                </div>
                <div
                  className="text-right text-[13px] text-[var(--text-secondary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  €
                  {(
                    (run.totalCostCents ?? run.total_cost_cents ?? 0) / 100
                  ).toFixed(2)}
                </div>
              </button>
            );
          })}
          {runs.length === 0 && !runsQ.isLoading ? (
            <p className="p-8 text-center text-sm text-[var(--text-tertiary)]">
              No runs yet — execute a pipeline to see results here.
            </p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const isSuccess = status === "completed";
  const isRunning = status === "running";
  const isFailed = status === "failed";
  let bg = "var(--bg-inset)";
  let fg = "var(--text-tertiary)";
  if (isSuccess) {
    bg = "#22C55E20";
    fg = "#22C55E";
  }
  if (isRunning) {
    bg = "#22D3EE20";
    fg = "#22D3EE";
  }
  if (isFailed) {
    bg = "#EF444420";
    fg = "#EF4444";
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: bg, color: fg, fontFamily: "var(--font-mono)" }}
    >
      <span
        className="inline-block size-1.5 rounded-full"
        style={{ background: fg }}
      />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
