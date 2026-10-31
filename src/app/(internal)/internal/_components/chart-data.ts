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

// Categorical slots are assigned in the order given and never cycled.
export function categorical(
  rows: { key: string; label: string; value: number }[],
) {
  return rows.map((row, index) => ({
    ...row,
    color: `var(--chart-cat-${index + 1})`,
  }));
}

export function breakdownSummary(title: string, rows: ChartRow[]) {
  if (!hasActivity(rows)) {
    return `${title}, no activity in this period`;
  }

  const parts = rows.map((row) => `${row.label} ${row.value}`).join(", ");
  return `${title}, ${parts}`;
}

export function percentSummary(title: string, percent: number | null) {
  return percent === null ? `${title}, N/A` : `${title}, ${percent}%`;
}

// The ChartConfig for a series: each key carries its text label (for legends
// and tooltips) and its colour token.
export function seriesConfig(rows: { key: string; label: string; color: string }[]) {
  return Object.fromEntries(
    rows.map((row) => [row.key, { label: row.label, color: row.color }]),
  );
}
