export const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
] as const;

export type Period = (typeof PERIOD_OPTIONS)[number]["value"];

export function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export function nonEmptyParam(value?: string) {
  return value && value.length > 0 ? value : undefined;
}

// Unknown or missing periods fall back to the default 7-day window.
export function selectedPeriod(value?: string): Period {
  const match = PERIOD_OPTIONS.find((option) => option.value === value);
  return match ? match.value : "7d";
}

export function windowInput(period: Period, start?: string, end?: string) {
  if (period === "custom") {
    return { mode: "custom", startDate: start, endDateExclusive: end };
  }
  return { mode: period };
}

export function periodHref(
  basePath: string,
  period: Period,
  start?: string,
  end?: string,
) {
  const params = new URLSearchParams({ period });
  if (period === "custom") {
    if (start) params.set("start", start);
    if (end) params.set("end", end);
  }
  return `${basePath}?${params.toString()}`;
}
