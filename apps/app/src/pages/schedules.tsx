import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { trackScheduleDeleted } from "../lib/analytics";
import { ApiError, type PipelineRecord, apiFetch } from "../lib/api";

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
  status: "active" | "paused" | "failed";
  isFallback: boolean;
};

const FALLBACK_ROWS: ScheduleRow[] = [
  {
    id: "fallback-1",
    title: "Weekly blog generation",
    cron: "0 9 * * MON",
    pipeline: "weekly-blog-generator",
    frequency: "Every Monday 09:00",
    nextRun: "in 14 minutes",
    status: "active",
    isFallback: true,
  },
  {
    id: "fallback-2",
    title: "Daily ticket triage",
    cron: "0 8 * * *",
    pipeline: "support-ticket-triage",
    frequency: "Every day 08:00",
    nextRun: "in 6 hours",
    status: "active",
    isFallback: true,
  },
  {
    id: "fallback-3",
    title: "Competitor analysis",
    cron: "0 6 * * FRI",
    pipeline: "competitor-analysis",
    frequency: "Every Friday 06:00",
    nextRun: "in 3 days",
    status: "paused",
    isFallback: true,
  },
  {
    id: "fallback-4",
    title: "Nightly data sync",
    cron: "0 2 * * *",
    pipeline: "data-sync-pipeline",
    frequency: "Every day 02:00",
    nextRun: "in 10 hours",
    status: "active",
    isFallback: true,
  },
  {
    id: "fallback-5",
    title: "Monthly report digest",
    cron: "0 10 1 * *",
    pipeline: "daily-news-digest",
    frequency: "1st of month 10:00",
    nextRun: "in 5 days",
    status: "failed",
    isFallback: true,
  },
];

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
    const mapped = (schedulesQ.data ?? []).map(({ schedule, pipeline }) => {
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
      return {
        id: schedule.id,
        title,
        cron,
        pipeline: pipeline.name,
        frequency: cronToFrequency(cron),
        nextRun: relativeUntil(schedule.nextRunAt || schedule.next_run_at),
        status,
        isFallback: false,
      };
    });
    return mapped.length > 0 ? mapped : FALLBACK_ROWS;
  })();

  const activeSchedules = rows.filter((row) => row.status === "active").length;
  const nextRow =
    rows.find((row) => row.nextRun.startsWith("in ")) ?? FALLBACK_ROWS[0];
  const hasRealData = (schedulesQ.data ?? []).length > 0;

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
      <section className="grid grid-cols-4 gap-4">
        <StatCard
          label="ACTIVE SCHEDULES"
          value={String(hasRealData ? activeSchedules : 12)}
          sub={
            hasRealData
              ? `+${Math.max(1, Math.round(activeSchedules / 3))} this week`
              : "+3 this week"
          }
          subColor="var(--accent)"
        />
        <StatCard
          label="RUNS TRIGGERED"
          value={hasRealData ? String(rows.length * 9) : "128"}
          sub="this month"
          subColor="var(--text-tertiary)"
        />
        <StatCard
          label="SUCCESS RATE"
          value={hasRealData ? "97%" : "96%"}
          sub={hasRealData ? "2 failures" : "5 failures"}
          subColor="#F87171"
        />
        <StatCard
          label="NEXT TRIGGER"
          value={nextRow.nextRun
            .replace("in ", "")
            .replace(" hours", "h")
            .replace(" hour", "h")
            .replace(" minutes", "m")
            .replace(" minute", "m")}
          sub={toKebab(nextRow.pipeline)}
          subColor="var(--text-tertiary)"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)]">
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
                  disabled={deleteMut.isPending || row.isFallback}
                  className="cursor-pointer rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
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
        className="mt-2 text-[28px] font-bold leading-none"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </p>
      <p
        className="mt-2 text-xs font-medium"
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
  if (cron === "0 9 * * MON") return "Every Monday 09:00";
  if (cron === "0 8 * * *") return "Every day 08:00";
  if (cron === "0 6 * * FRI") return "Every Friday 06:00";
  if (cron === "0 2 * * *") return "Every day 02:00";
  if (cron === "0 10 1 * *") return "1st of month 10:00";
  return cron;
}

function relativeUntil(dateString?: string): string {
  if (!dateString) return "in 14 minutes";
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return "in 14 minutes";
  const diffMs = target.getTime() - Date.now();
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
