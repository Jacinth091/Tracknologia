import { z } from "zod";

/**
 * Client-safe metrics window schema. The internal barrel is server-only, so
 * import these directly from this file when a future client needs the same
 * validation for its period picker.
 */

const MANILA_DAYS_MAX = 90;
const DAY_MS = 86_400_000;

const manilaDateSchema = z.iso.date();

export const metricsWindowSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("today") }),
  z.object({ mode: z.literal("7d") }),
  z.object({ mode: z.literal("30d") }),
  z.strictObject({
    mode: z.literal("custom"),
    startDate: manilaDateSchema,
    endDateExclusive: manilaDateSchema,
  }),
]);

export type MetricsWindowInput = z.output<typeof metricsWindowSchema>;

export type ResolvedMetricsWindow = {
  startDate: string;
  endDateExclusive: string;
};

export const MAX_METRICS_WINDOW_DAYS = MANILA_DAYS_MAX;

/**
 * Asia/Manila has no daylight saving time, so a fixed +08:00 offset converts
 * its calendar-day boundaries to the UTC instants the database compares with.
 */
export function manilaMidnightUtc(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}

function shiftManilaDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The current Asia/Manila calendar date as YYYY-MM-DD. */
export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
  }).format(new Date());
}

/**
 * Resolves a period into an Asia/Manila calendar-day window with an inclusive
 * start and an exclusive end. `today` covers the current Manila day, `7d` and
 * `30d` cover the trailing 7 and 30 Manila days including today, and `custom`
 * must span 1 to 90 Manila days.
 *
 * @throws when a custom period spans fewer than 1 or more than 90 Manila days.
 */
export function resolveMetricsWindow(
  input: MetricsWindowInput,
): ResolvedMetricsWindow {
  const tomorrow = shiftManilaDays(manilaToday(), 1);

  if (input.mode === "today") {
    return {
      startDate: shiftManilaDays(tomorrow, -1),
      endDateExclusive: tomorrow,
    };
  }
  if (input.mode === "7d") {
    return {
      startDate: shiftManilaDays(tomorrow, -7),
      endDateExclusive: tomorrow,
    };
  }
  if (input.mode === "30d") {
    return {
      startDate: shiftManilaDays(tomorrow, -30),
      endDateExclusive: tomorrow,
    };
  }

  const { startDate, endDateExclusive } = input;
  const days = (Date.parse(endDateExclusive) - Date.parse(startDate)) / DAY_MS;
  if (days < 1 || days > MANILA_DAYS_MAX) {
    throw new Error(
      `Custom metrics periods must cover 1 to ${MANILA_DAYS_MAX} Asia/Manila days`,
    );
  }
  return { startDate, endDateExclusive };
}
