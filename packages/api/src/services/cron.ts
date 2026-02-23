import { CronExpressionParser } from "cron-parser";

export function getNextCronTick(expression: string, timezone = "UTC"): Date {
  try {
    const interval = CronExpressionParser.parse(expression, { tz: timezone });
    return interval.next().toDate();
  } catch {
    throw new Error(`Invalid cron expression: ${expression}`);
  }
}
