// Server-side shaping of metric rows into chart rows and screen-reader summaries.
// Kept out of metric-charts.tsx because that module is a client component.

export type ChartRow = { label: string; value: number };

export function dayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function dailySeries(days: { date: string; value: number }[]) {
  return days.map((day) => ({ label: dayLabel(day.date), value: day.value }));
}

export function hasActivity(rows: ChartRow[]) {
  return rows.some((row) => row.value > 0);
}

export function dailySummary(title: string, rows: ChartRow[]) {
  const first = rows[0]?.label;
  const last = rows[rows.length - 1]?.label;
  if (!hasActivity(rows)) {
    return `${title}, ${first} to ${last}, no activity in this period`;
  }

  const peak = largestRow(rows);
  return `${title}, ${first} to ${last}, peak ${peak.value} on ${peak.label}`;
}

export function rankedSummary(title: string, rows: ChartRow[]) {
  if (!hasActivity(rows)) {
    return `${title}, no activity in this period`;
  }

  const largest = largestRow(rows);
  return `${title}, largest ${largest.label} at ${largest.value}`;
}

function largestRow(rows: ChartRow[]) {
  return rows.reduce((best, row) => (row.value > best.value ? row : best));
}
