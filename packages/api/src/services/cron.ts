import { parseExpression } from "cron-parser";

export function getNextCronTick(expression: string, timezone = "UTC"): Date {
  const interval = parseExpression(expression, { tz: timezone });
  return interval.next().toDate();
}
