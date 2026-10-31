"use client";

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// Plain serialisable props from the Server Component pages. The caller decides
// when to show an empty state instead of a chart; no data is fetched here.

export function DayBarChart({
  seriesLabel,
  summary,
  data,
}: {
  seriesLabel: string;
  summary: string;
  data: { label: string; value: number }[];
}) {
  return (
    <ChartContainer
      config={{ value: { label: seriesLabel, color: "var(--chart-1)" } }}
      role="img"
      aria-label={summary}
      className="aspect-auto h-[200px] w-full"
    >
      <BarChart data={data} margin={{ top: 20, right: 4, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
        />
        <YAxis hide />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[6, 6, 0, 0]}
          maxBarSize={24}
        >
          <LabelList
            dataKey="value"
            position="top"
            className="fill-foreground text-xs font-medium tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// Horizontal bars in the order given. Each row names its colour token, so a
// series can use one hue or a fixed sequence.
export function CategoryBarChart({
  summary,
  data,
}: {
  summary: string;
  data: { key: string; label: string; value: number; color: string }[];
}) {
  const config = Object.fromEntries(
    data.map((row) => [row.key, { label: row.label, color: row.color }]),
  );

  return (
    <ChartContainer
      config={config}
      role="img"
      aria-label={summary}
      className="aspect-auto h-[200px] w-full"
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          dataKey="label"
          type="category"
          width={120}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24}>
          {data.map((row) => (
            <Cell key={row.key} fill={`var(--color-${row.key})`} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            className="fill-foreground text-xs font-medium tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
