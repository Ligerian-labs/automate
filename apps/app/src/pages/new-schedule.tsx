import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { trackScheduleCreated } from "../lib/analytics";
import { ApiError, type PipelineRecord, apiFetch } from "../lib/api";

type FrequencyPreset = "hourly" | "daily" | "weekly" | "monthly" | "custom";

type CreatedSchedule = {
  id: string;
  nextRunAt?: string;
  next_run_at?: string;
};

const DAY_OPTIONS = [
  { label: "Monday", value: "MON" },
  { label: "Tuesday", value: "TUE" },
  { label: "Wednesday", value: "WED" },
  { label: "Thursday", value: "THU" },
  { label: "Friday", value: "FRI" },
  { label: "Saturday", value: "SAT" },
  { label: "Sunday", value: "SUN" },
];

export function NewSchedulePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const pipelinesQ = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => apiFetch<PipelineRecord[]>("/api/pipelines"),
  });

  const pipelines = pipelinesQ.data ?? [];
  const [name, setName] = useState("Weekly blog generation");
  const [description, setDescription] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [preset, setPreset] = useState<FrequencyPreset>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("MON");
  const [timeUtc, setTimeUtc] = useState("09:00");
  const [customCron, setCustomCron] = useState("0 9 * * MON");
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (!pipelineId && pipelines.length > 0) {
      setPipelineId(pipelines[0]?.id ?? "");
    }
  }, [pipelineId, pipelines]);

  const selectedPipeline =
    pipelines.find((pipeline) => pipeline.id === pipelineId) || pipelines[0];

  const cronExpression = buildCronExpression({
    preset,
    dayOfWeek,
    timeUtc,
    customCron,
  });

  const humanFrequency = toHumanFrequency({ preset, dayOfWeek, timeUtc });
  const nextRunPreview = computeNextRunPreview({ preset, dayOfWeek, timeUtc });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedPipeline?.id) {
        throw new Error("Please select a pipeline.");
      }
      return apiFetch<CreatedSchedule>(
        `/api/pipelines/${selectedPipeline.id}/schedules`,
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            cron_expression: cronExpression,
            timezone: "UTC",
            enabled: true,
          }),
        },
      );
    },
    onSuccess: async () => {
      trackScheduleCreated(selectedPipeline?.id ?? "", cronExpression);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schedules"] }),
        queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
      ]);
      navigate({ to: "/schedules" });
    },
  });

  const createError = (() => {
    if (clientError) return clientError;
    const error = createMutation.error;
    if (!error) return null;
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return "Failed to create schedule.";
  })();

  return (
    <AppShell>
      <section className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/schedules"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--divider)] px-2.5 py-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
            aria-label="Back to schedules"
          >
            <ArrowLeftIcon />
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              New Schedule
            </h1>
            <p className="text-sm text-[var(--text-tertiary)]">
              Configure a new automated pipeline schedule
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)_340px] gap-7">
        <div className="flex flex-col gap-5">
          <Card title="Schedule Details">
            <Field label="Name" htmlFor="schedule-name">
              <input
                id="schedule-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setClientError(null);
                }}
                placeholder="e.g. Weekly blog generation"
                className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 font-[var(--font-mono)] text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
              />
            </Field>
            <Field label="Description" htmlFor="schedule-description">
              <textarea
                id="schedule-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional description for this schedule"
                rows={2}
                className="w-full resize-none rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
              />
            </Field>
          </Card>

          <Card title="Pipeline">
            <Field label="Select pipeline" htmlFor="schedule-pipeline">
              <select
                id="schedule-pipeline"
                value={selectedPipeline?.id ?? ""}
                onChange={(event) => setPipelineId(event.target.value)}
                className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 font-[var(--font-mono)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                {pipelines.length === 0 ? (
                  <option value="">No pipeline found</option>
                ) : null}
                {pipelines.map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-[var(--text-muted)]">
              The pipeline that will be triggered on each scheduled run.
            </p>
          </Card>

          <Card title="Schedule Frequency">
            <div className="flex flex-wrap gap-2">
              <PresetButton
                active={preset === "hourly"}
                onClick={() => setPreset("hourly")}
                label="Every hour"
              />
              <PresetButton
                active={preset === "daily"}
                onClick={() => setPreset("daily")}
                label="Daily"
              />
              <PresetButton
                active={preset === "weekly"}
                onClick={() => setPreset("weekly")}
                label="Weekly"
              />
              <PresetButton
                active={preset === "monthly"}
                onClick={() => setPreset("monthly")}
                label="Monthly"
              />
              <PresetButton
                active={preset === "custom"}
                onClick={() => setPreset("custom")}
                label="Custom"
              />
            </div>

            <Field label="Cron expression" htmlFor="schedule-cron">
              <input
                id="schedule-cron"
                value={preset === "custom" ? customCron : cronExpression}
                onChange={(event) => {
                  setCustomCron(event.target.value);
                  setPreset("custom");
                }}
                className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 font-[var(--font-mono)] text-sm font-semibold text-[var(--accent)] outline-none focus:border-[var(--accent)]"
              />
            </Field>

            <p className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
              <ClockIcon />
              {humanFrequency}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Day of week" htmlFor="schedule-day">
                <select
                  id="schedule-day"
                  value={dayOfWeek}
                  onChange={(event) => setDayOfWeek(event.target.value)}
                  disabled={preset !== "weekly"}
                  className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none disabled:opacity-50"
                >
                  {DAY_OPTIONS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Time (UTC)" htmlFor="schedule-time">
                <input
                  id="schedule-time"
                  type="time"
                  value={timeUtc}
                  onChange={(event) => setTimeUtc(event.target.value)}
                  className="w-full rounded-md border border-[var(--divider)] bg-[var(--bg-inset)] px-3.5 py-2.5 font-[var(--font-mono)] text-[13px] text-[var(--text-primary)] outline-none"
                />
              </Field>
            </div>
          </Card>
        </div>

        <aside className="flex min-h-full flex-col gap-6">
          <Card title="Summary" padded>
            <SummaryRow
              label="Pipeline"
              value={selectedPipeline?.name || "—"}
              mono
            />
            <SummaryRow
              label="Frequency"
              value={preset === "custom" ? "Custom" : capitalize(preset)}
            />
            <SummaryRow
              label="Schedule"
              value={`${toShortDay(dayOfWeek)} ${timeUtc} UTC`}
              mono
              accent
            />
          </Card>

          <Card title="Next Scheduled Run" padded>
            <p className="flex items-center gap-2 font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]">
              <CalendarIcon />
              {nextRunPreview.absolute}
            </p>
            <div className="rounded-lg bg-[var(--bg-inset)] px-3.5 py-2.5 text-center font-[var(--font-mono)] text-sm font-semibold text-[var(--accent)]">
              {nextRunPreview.relative}
            </div>
          </Card>

          <div className="mt-auto flex flex-col gap-3">
            <button
              type="button"
              disabled={createMutation.isPending || pipelinesQ.isLoading}
              onClick={() => {
                if (!name.trim()) {
                  setClientError("Name is required.");
                  return;
                }
                if (!selectedPipeline?.id) {
                  setClientError("Please select a pipeline.");
                  return;
                }
                setClientError(null);
                createMutation.mutate();
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-70"
            >
              <CheckIcon />
              {createMutation.isPending ? "Creating..." : "Create schedule"}
            </button>
            <Link
              to="/schedules"
              className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--divider)] px-5 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
            >
              Cancel
            </Link>
            {createError ? (
              <p aria-live="polite" className="text-sm text-red-300">
                {createError}
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}

function Card({
  title,
  children,
  padded = false,
}: {
  title: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--divider)] bg-[var(--bg-surface)] ${
        padded ? "p-6" : "p-5"
      }`}
    >
      <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({
  label,
  value,
  mono = false,
  accent = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t border-[var(--divider)] pt-4 first:border-t-0 first:pt-0">
      <span className="text-[13px] text-[var(--text-tertiary)]">{label}</span>
      <span
        className={`text-[13px] ${mono ? "font-[var(--font-mono)] text-xs" : "font-medium"} ${
          accent
            ? "font-semibold text-[var(--accent)]"
            : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function PresetButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
        active
          ? "border-transparent bg-[var(--accent)] text-[var(--bg-primary)]"
          : "border-[var(--divider)] bg-[var(--bg-inset)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
      }`}
    >
      {label}
    </button>
  );
}

function buildCronExpression({
  preset,
  dayOfWeek,
  timeUtc,
  customCron,
}: {
  preset: FrequencyPreset;
  dayOfWeek: string;
  timeUtc: string;
  customCron: string;
}) {
  if (preset === "custom") return customCron.trim();
  const [hour = "9"] = timeUtc.split(":").slice(0, 1);
  if (preset === "hourly") return "0 * * * *";
  if (preset === "daily") return `0 ${Number(hour)} * * *`;
  if (preset === "weekly") return `0 ${Number(hour)} * * ${dayOfWeek}`;
  return `0 ${Number(hour)} 1 * *`;
}

function toHumanFrequency({
  preset,
  dayOfWeek,
  timeUtc,
}: {
  preset: FrequencyPreset;
  dayOfWeek: string;
  timeUtc: string;
}) {
  if (preset === "hourly") return "Runs every hour at minute 00 UTC";
  if (preset === "daily") return `Runs every day at ${timeUtc} UTC`;
  if (preset === "weekly")
    return `Runs every ${toDayLabel(dayOfWeek)} at ${timeUtc} UTC`;
  if (preset === "monthly")
    return `Runs on day 1 of each month at ${timeUtc} UTC`;
  return "Runs based on custom cron expression (UTC)";
}

function computeNextRunPreview({
  preset,
  dayOfWeek,
  timeUtc,
}: {
  preset: FrequencyPreset;
  dayOfWeek: string;
  timeUtc: string;
}) {
  const next = nextDateForPreset(preset, dayOfWeek, timeUtc);
  if (!next) {
    return {
      absolute: "Preview available after schedule validation",
      relative: "—",
    };
  }
  const absolute = formatUtcDate(next);
  const relative = relativeUntil(next.toISOString());
  return { absolute, relative };
}

function nextDateForPreset(
  preset: FrequencyPreset,
  dayOfWeek: string,
  timeUtc: string,
): Date | null {
  if (preset === "custom") return null;
  const [hoursRaw = "9", minutesRaw = "0"] = timeUtc.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const now = new Date();
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCHours(hours, minutes, 0, 0);

  if (preset === "hourly") {
    next.setUTCMinutes(0, 0, 0);
    if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }

  if (preset === "daily") {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (preset === "weekly") {
    const targetDay = dayOfWeekToIndex(dayOfWeek);
    const delta = (targetDay - next.getUTCDay() + 7) % 7;
    next.setUTCDate(next.getUTCDate() + delta);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  next.setUTCDate(1);
  if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function formatUtcDate(date: Date): string {
  const base = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
  return `${base.replace(",", "")} UTC`;
}

function dayOfWeekToIndex(day: string): number {
  const map: Record<string, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
  };
  return map[day] ?? 1;
}

function toDayLabel(day: string): string {
  return DAY_OPTIONS.find((option) => option.value === day)?.label ?? "Monday";
}

function toShortDay(day: string): string {
  return toDayLabel(day).slice(0, 3);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function relativeUntil(next?: string | null): string {
  if (!next) return "—";
  const diffMs = new Date(next).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return "—";
  if (diffMs <= 0) return "now";
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const chunks: string[] = [];
  if (days > 0) chunks.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours > 0) chunks.push(`${hours} hour${hours > 1 ? "s" : ""}`);
  if (days === 0 && minutes > 0)
    chunks.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
  return `in ${chunks.join(", ")}`;
}

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--text-muted)]"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--accent)]"
    >
      <path d="M8 2v4M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}
