import { parseExpression } from "cron-parser";

export function getNextCronTick(expression: string, timezone = "UTC"): Date {
  try {
    const interval = parseExpression(expression, { tz: timezone });
    return interval.next().toDate();
  } catch {
    throw new Error("Invalid cron expression or timezone");
  }
}
