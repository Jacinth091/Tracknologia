"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { seriesConfig } from "./chart-data";

// Plain serialisable props from the Server Component pages. The caller decides
// when to show an empty state instead of a chart; no data is fetched here.

type Slice = { key: string; label: string; value: number; color: string };

// One horizontal bar row is about 32px, plus room for the axis.
const ROW_HEIGHT = 32;
const ROW_PADDING = 24;

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
      config={{ value: { label: seriesLabel, color: "var(--chart-cat-1)" } }}
      role="img"
      aria-label={summary}
      className="aspect-auto h-[180px] w-full"
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
// series can use one hue or a fixed sequence. The height follows the row count.
export function CategoryBarChart({
  summary,
  data,
}: {
  summary: string;
  data: Slice[];
}) {
  return (
    <ChartContainer
      config={seriesConfig(data)}
      role="img"
      aria-label={summary}
      className="aspect-auto w-full"
      style={{ height: data.length * ROW_HEIGHT + ROW_PADDING }}
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

// Categorical donut: every slice has a value label, and the legend names each
// slice by its config label, so identity never rests on colour alone. The
// caller passes only non-zero slices.
export function DonutChart({
  summary,
  data,
}: {
  summary: string;
  data: Slice[];
}) {
  return (
    <ChartContainer
      config={seriesConfig(data)}
      role="img"
      aria-label={summary}
      className="aspect-auto h-[180px] w-full"
    >
      <PieChart>
        <ChartTooltip
          content={<ChartTooltipContent hideLabel nameKey="key" />}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="key"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
        >
          {data.map((row) => (
            <Cell key={row.key} fill={`var(--color-${row.key})`} />
          ))}
          <LabelList
            dataKey="value"
            className="fill-foreground text-xs font-medium tabular-nums"
          />
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" />} />
      </PieChart>
    </ChartContainer>
  );
}

// Half-ring gauge for a 0–100 share. The percentage is printed in the middle
// as text, so the value does not depend on the arc alone.
export function GaugeChart({
  summary,
  label,
  percent,
}: {
  summary: string;
  label: string;
  percent: number;
}) {
  return (
    <div className="relative">
      <ChartContainer
        config={{ value: { label, color: "var(--chart-cat-1)" } }}
        role="img"
        aria-label={summary}
        className="aspect-auto h-[160px] w-full"
      >
        <RadialBarChart
          data={[{ name: label, value: percent }]}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={180}
          endAngle={0}
          barSize={18}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            fill="var(--color-value)"
            background
            cornerRadius={9}
          />
        </RadialBarChart>
      </ChartContainer>
      <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-3xl font-semibold tabular-nums">
        {percent}%
      </p>
    </div>
  );
}
