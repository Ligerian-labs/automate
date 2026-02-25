import { CronExpressionParser } from "cron-parser";

function hasFiveCronFields(expression: string): boolean {
  return /^(\S+\s+){4}\S+$/.test(expression.trim());
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function assertValidCron(expression: string, timezone = "UTC"): void {
  if (!hasFiveCronFields(expression)) {
    throw new Error("Cron expression must have exactly 5 fields");
  }
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  try {
    CronExpressionParser.parse(expression, { tz: timezone }).next();
  } catch {
    throw new Error(`Invalid cron expression: ${expression}`);
  }
}

export function getNextCronTick(expression: string, timezone = "UTC"): Date {
  assertValidCron(expression, timezone);
  return CronExpressionParser.parse(expression, { tz: timezone })
    .next()
    .toDate();
}
