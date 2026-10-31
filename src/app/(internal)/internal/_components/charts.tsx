// Server-rendered charts for the internal metrics. The pages wrap each chart
// in a Card; the data is the same as the count tables below it.

// viewBox units per day. Columns cap at 24 and sit centred in their slot.
const DAY_SLOT = 32;
const COLUMN_MAX = 24;
const CORNER = 6;
const LEFT = 28;
const TOP = 16;
const PLOT_HEIGHT = 112;
const BASELINE = TOP + PLOT_HEIGHT;
const HEIGHT = BASELINE + 24;

type Unit = { singular: string; plural: string };

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function countWithUnit(value: number, unit: Unit) {
  const noun = value === 1 ? unit.singular : unit.plural;
  return `${value.toLocaleString("en-PH")} ${noun}`;
}

export function DailyColumns({
  title,
  days,
  unit,
}: {
  title: string;
  days: { date: string; value: number }[];
  unit: Unit;
}) {
  const max = Math.max(0, ...days.map((day) => day.value));
  const peak = days.findIndex((day) => day.value === max);
  const first = dayLabel(days[0].date);
  const last = dayLabel(days[days.length - 1].date);
  const width = LEFT + days.length * DAY_SLOT;
  const barWidth = Math.min(COLUMN_MAX, DAY_SLOT - 2);
  const ticks = max > 0 ? [...new Set([Math.ceil(max / 2), max])] : [];
  const summary =
    max > 0
      ? `${title}, ${first} to ${last}, peak ${max} on ${dayLabel(days[peak].date)}`
      : `${title}, ${first} to ${last}, no activity in this period`;
  const yFor = (value: number) => BASELINE - (value / max) * PLOT_HEIGHT;
  const middle = Math.floor((days.length - 1) / 2);
  const labelled = [...new Set([0, middle, days.length - 1])];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={summary}
        className="block h-auto"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={LEFT}
              x2={width}
              y1={yFor(tick)}
              y2={yFor(tick)}
              className="stroke-border"
            />
            <text
              x={LEFT - 6}
              y={yFor(tick) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-xs tabular-nums"
            >
              {tick}
            </text>
          </g>
        ))}
        <line
          x1={LEFT}
          x2={width}
          y1={BASELINE}
          y2={BASELINE}
          className="stroke-border"
        />
        <text
          x={LEFT - 6}
          y={BASELINE + 4}
          textAnchor="end"
          className="fill-muted-foreground text-xs tabular-nums"
        >
          0
        </text>
        {days.map((day, index) => {
          if (day.value === 0) return null;
          const x = LEFT + index * DAY_SLOT + (DAY_SLOT - barWidth) / 2;
          const top = yFor(day.value);
          const radius = Math.min(CORNER, barWidth / 2, BASELINE - top);
          return (
            <path
              key={day.date}
              d={`M${x} ${BASELINE} V${top + radius} A${radius} ${radius} 0 0 1 ${x + radius} ${top} H${x + barWidth - radius} A${radius} ${radius} 0 0 1 ${x + barWidth} ${top + radius} V${BASELINE} Z`}
              className="fill-chart-2"
            />
          );
        })}
        {max > 0 ? (
          <text
            x={LEFT + peak * DAY_SLOT + DAY_SLOT / 2}
            y={yFor(max) - 6}
            textAnchor="middle"
            className="fill-foreground text-xs font-medium tabular-nums"
          >
            {max}
          </text>
        ) : null}
        {labelled.map((index) => (
          <text
            key={index}
            x={LEFT + index * DAY_SLOT + DAY_SLOT / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            {dayLabel(days[index].date)}
          </text>
        ))}
        {days.map((day, index) => (
          <rect
            key={day.date}
            x={LEFT + index * DAY_SLOT}
            y={0}
            width={DAY_SLOT}
            height={BASELINE}
            className="fill-transparent"
          >
            <title>
              {`${dayLabel(day.date)}: ${countWithUnit(day.value, unit)}`}
            </title>
          </rect>
        ))}
      </svg>
      {max === 0 ? (
        <p className="text-sm text-muted-foreground">
          No activity in this period.
        </p>
      ) : null}
    </div>
  );
}

export function CategoryBars({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  const largest = rows.find((row) => row.value === max);
  const summary =
    max > 0 && largest
      ? `${title}, largest ${largest.label} at ${largest.value}`
      : `${title}, no activity in this period`;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div role="img" aria-label={summary} className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            title={`${row.label}: ${row.value}`}
            className="flex items-center gap-3 text-sm"
          >
            <span className="w-28 shrink-0 text-muted-foreground">
              {row.label}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className="h-5 rounded-r-sm bg-chart-2"
                style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }}
              />
              <span className="font-medium tabular-nums">{row.value}</span>
            </span>
          </div>
        ))}
      </div>
      {max === 0 ? (
        <p className="text-sm text-muted-foreground">
          No activity in this period.
        </p>
      ) : null}
    </div>
  );
}
