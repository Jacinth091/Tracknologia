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

// Plain serialisable props from the Server Component pages. The caller decides
// when to show an empty state instead of a chart; no data is fetched here.

type Slice = { key: string; label: string; value: number; color: string };

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
  data: Slice[];
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

// Categorical donut: every slice has a value label and the legend names each
// slice, so identity never rests on colour alone.
export function DonutChart({
  summary,
  data,
}: {
  summary: string;
  data: Slice[];
}) {
  const config = Object.fromEntries(
    data.map((row) => [row.key, { label: row.label, color: row.color }]),
  );

  return (
    <ChartContainer
      config={config}
      role="img"
      aria-label={summary}
      className="aspect-auto h-[240px] w-full"
    >
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
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
        <ChartLegend content={<ChartLegendContent />} />
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
        className="aspect-auto h-[200px] w-full"
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
      <p className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-3xl font-semibold tabular-nums">
        {percent}%
      </p>
    </div>
  );
}
