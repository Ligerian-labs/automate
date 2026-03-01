import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { trackScheduleDeleted } from "../lib/analytics";
import {
  ApiError,
  type PipelineRecord,
  type RunRecord,
  apiFetch,
} from "../lib/api";

type ScheduleRecord = {
  id: string;
  name?: string;
  description?: string | null;
  pipelineId?: string;
  pipeline_id?: string;
  cronExpression?: string;
  cron_expression?: string;
  timezone?: string;
  enabled?: boolean;
  nextRunAt?: string;
  next_run_at?: string;
};

type ScheduleRow = {
  id: string;
  title: string;
  cron: string;
  pipeline: string;
  frequency: string;
  nextRun: string;
  nextRunAt: string | null;
  status: "active" | "paused" | "failed";
};

export function SchedulesPage() {
  const queryClient = useQueryClient();
  const pipelinesQ = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => apiFetch<PipelineRecord[]>("/api/pipelines"),
  });

  const schedulesQ = useQuery({
    queryKey: ["schedules", ...(pipelinesQ.data ?? []).map((p) => p.id).sort()],
    enabled: (pipelinesQ.data ?? []).length > 0,
    queryFn: async () => {
      const pipelines = pipelinesQ.data ?? [];
      const rows = await Promise.all(
        pipelines.map(async (pipeline) => {
          const schedules = await apiFetch<ScheduleRecord[]>(
            `/api/pipelines/${pipeline.id}/schedules`,
          );
          return schedules.map((schedule) => ({ schedule, pipeline }));
        }),
      );
      return rows.flat();
    },
  });

  const runsQ = useQuery({
    queryKey: ["runs", "schedules-dashboard"],
    queryFn: () => apiFetch<RunRecord[]>("/api/runs?limit=100"),
  });

  const deleteMut = useMutation({
    mutationFn: (scheduleId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/schedules/${scheduleId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, scheduleId) => {
      trackScheduleDeleted(scheduleId);
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });

  const rows: ScheduleRow[] = (() => {
    return (schedulesQ.data ?? []).map(({ schedule, pipeline }) => {
      const cron =
        schedule.cronExpression || schedule.cron_expression || "* * * * *";
      const title = toTitleCase(
        (schedule.name || pipeline.name || "Pipeline schedule").replace(
          /[-_]+/g,
          " ",
        ),
      );
      const status: ScheduleRow["status"] =
        schedule.enabled === false ? "paused" : "active";
      const nextRunAt = schedule.nextRunAt || schedule.next_run_at || null;
      return {
        id: schedule.id,
        title,
        cron,
        pipeline: pipeline.name,
        frequency: cronToFrequency(cron),
        nextRun: relativeUntil(nextRunAt),
        nextRunAt,
        status,
      };
    });
  })();

  const activeSchedules = rows.filter((row) => row.status === "active").length;
  const now = Date.now();
  const nextRow =
    rows
      .filter((row) => row.nextRunAt)
      .sort((a, b) => {
        const aTs = new Date(a.nextRunAt || "").getTime();
        const bTs = new Date(b.nextRunAt || "").getTime();
        return aTs - bTs;
      })
      .find((row) => {
        const ts = new Date(row.nextRunAt || "").getTime();
        return !Number.isNaN(ts) && ts >= now;
      }) || null;

  const scheduleRuns = (runsQ.data ?? []).filter(
    (run) => (run.triggerType || run.trigger_type) === "schedule",
  );
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthScheduleRuns = scheduleRuns.filter((run) => {
    const created = run.createdAt || run.created_at;
    if (!created) return false;
    const createdAt = new Date(created);
    return !Number.isNaN(createdAt.getTime()) && createdAt >= monthStart;
  });
  const successfulScheduleRuns = monthScheduleRuns.filter(
    (run) => run.status === "completed",
  ).length;
  const failedScheduleRuns = monthScheduleRuns.filter(
    (run) => run.status === "failed",
  ).length;
  const successRate =
    monthScheduleRuns.length > 0
      ? Math.round((successfulScheduleRuns / monthScheduleRuns.length) * 100)
      : null;

  const actions = (
    <Link
      to="/schedules/new"
      className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-[18px] py-2.5 text-sm font-semibold text-[var(--bg-primary)]"
    >
      <span className="text-base leading-none">+</span> New schedule
    </Link>
  );

  return (
    <AppShell
      title="Schedules"
      subtitle="Automate your pipeline runs with cron-based schedules"
      actions={actions}
    >
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard
          label="ACTIVE SCHEDULES"
          value={String(activeSchedules)}
          sub={`${rows.length - activeSchedules} paused`}
          subColor="var(--accent)"
        />
        <StatCard
          label="RUNS TRIGGERED"
          value={String(monthScheduleRuns.length)}
          sub="this month"
          subColor="var(--text-tertiary)"
        />
        <StatCard
          label="SUCCESS RATE"
          value={successRate === null ? "—" : `${successRate}%`}
          sub={
            monthScheduleRuns.length === 0
              ? "No scheduled runs yet"
              : `${failedScheduleRuns} failures this month`
          }
          subColor="#F87171"
        />
        <StatCard
          label="NEXT TRIGGER"
          value={nextRow ? compactRelative(nextRow.nextRun) : "—"}
          sub={nextRow ? toKebab(nextRow.pipeline) : "No upcoming run"}
          subColor="var(--text-tertiary)"
        />
      </section>

      <section className="rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]">
        {pipelinesQ.isLoading || schedulesQ.isLoading ? (
          <p className="p-5 text-sm text-[var(--text-tertiary)]">
            Loading schedules...
          </p>
        ) : null}
        {pipelinesQ.isError || schedulesQ.isError ? (
          <p className="p-5 text-sm text-red-300">Failed to load schedules.</p>
        ) : null}
        {deleteMut.isError ? (
          <p className="p-5 text-sm text-red-300">
            {deleteMut.error instanceof ApiError
              ? deleteMut.error.message
              : "Failed to delete schedule"}
          </p>
        ) : null}

        {/* Desktop table */}
        <div className="hidden md:block">
          <div
            className="grid items-center bg-[var(--bg-inset)] px-5 py-3.5"
            style={{
              gridTemplateColumns:
                "240px minmax(200px,1fr) minmax(200px,1fr) 120px 100px 110px",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Schedule
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Pipeline
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Frequency
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Next Run
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Status
            </span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">
              Actions
            </span>
          </div>
          <div className="divide-y divide-[var(--divider)]">
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid items-center px-5 py-4"
                style={{
                  gridTemplateColumns:
                    "240px minmax(200px,1fr) minmax(200px,1fr) 120px 100px 110px",
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{row.title}</p>
                  <p
                    className="text-[11px] text-[var(--text-tertiary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {row.cron}
                  </p>
                </div>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  {row.pipeline}
                </p>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  {row.frequency}
                </p>
                <p
                  className="text-[13px] text-[var(--text-secondary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {row.nextRun}
                </p>
                <ScheduleStatusBadge status={row.status} />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(row.id)}
                    disabled={deleteMut.isPending}
                    className="cursor-pointer rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile card list */}
        <div className="divide-y divide-[var(--divider)] md:hidden">
          {rows.map((row) => (
            <div key={row.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p
                    className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {row.cron}
                  </p>
                </div>
                <ScheduleStatusBadge status={row.status} />
              </div>
              <div
                className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-secondary)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <span className="truncate">{row.pipeline}</span>
                <span className="text-[var(--text-muted)]">·</span>
                <span>{row.frequency}</span>
                <span className="text-[var(--text-muted)]">·</span>
                <span>Next: {row.nextRun}</span>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(row.id)}
                  disabled={deleteMut.isPending}
                  className="cursor-pointer rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {rows.length === 0 && !pipelinesQ.isLoading && !schedulesQ.isLoading ? (
          <p className="p-8 text-center text-sm text-[var(--text-tertiary)]">
            No schedules yet — create one to automate your pipelines.
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  subColor,
}: { label: string; value: string; sub: string; subColor: string }) {
  return (
    <div
      className="rounded-[10px] border border-[var(--divider)] bg-[var(--bg-surface)] p-5"
      style={{ gap: 8 }}
    >
      <p
        className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "1.5px" }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-xl font-bold leading-none md:text-[28px]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </p>
      <p
        className="mt-2 truncate text-[11px] font-medium md:text-xs"
        style={{ fontFamily: "var(--font-mono)", color: subColor }}
      >
        {sub}
      </p>
    </div>
  );
}

function ScheduleStatusBadge({
  status,
}: { status: "active" | "paused" | "failed" }) {
  let bg = "#22C55E20";
  let fg = "#22C55E";
  let text = "Active";
  if (status === "paused") {
    bg = "#FBBF2420";
    fg = "#FBBF24";
    text = "Paused";
  }
  if (status === "failed") {
    bg = "#F8717120";
    fg = "#F87171";
    text = "Failed";
  }
  return (
    <span
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: bg, color: fg, fontFamily: "var(--font-mono)" }}
    >
      <span
        className="inline-block size-1.5 rounded-full"
        style={{ background: fg }}
      />
      {text}
    </span>
  );
}

function cronToFrequency(cron: string): string {
  const [min, hour, dayOfMonth, _month, dayOfWeek] = cron.split(/\s+/);
  const hh = hour?.padStart(2, "0");
  const mm = min?.padStart(2, "0");

  if (dayOfMonth === "*" && dayOfWeek === "*" && hour === "*" && min === "0") {
    return "Every hour";
  }
  if (dayOfMonth === "*" && dayOfWeek === "*") return `Every day ${hh}:${mm}`;
  if (dayOfMonth === "*" && dayOfWeek && dayOfWeek !== "*") {
    return `Every ${dayOfWeek} ${hh}:${mm}`;
  }
  if (dayOfMonth && dayOfMonth !== "*" && dayOfWeek === "*") {
    return `Day ${dayOfMonth} each month ${hh}:${mm}`;
  }
  return cron;
}

function relativeUntil(dateString?: string | null): string {
  if (!dateString) return "—";
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return "—";
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return "now";

  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `in ${diffMin} minutes`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `in ${diffHours} hours`;
  const diffDays = Math.floor(diffHours / 24);
  return `in ${diffDays} days`;
}

function toTitleCase(input: string): string {
  return input
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function toKebab(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function compactRelative(input: string): string {
  if (!input.startsWith("in ")) return input;
  return input
    .replace("in ", "")
    .replace(" hours", "h")
    .replace(" hour", "h")
    .replace(" minutes", "m")
    .replace(" minute", "m")
    .replace(" days", "d")
    .replace(" day", "d");
}
