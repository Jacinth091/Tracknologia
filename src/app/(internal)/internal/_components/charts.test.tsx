import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CategoryBars, DailyColumns } from "./charts";

const UNIT = { singular: "active provider", plural: "active providers" };

// Column paths start at "M<x> <baseline> V<top + radius>", so the smallest
// V value is the tallest column and its x identifies the day.
function columnTops(html: string) {
  return [...html.matchAll(/d="M([\d.]+) [\d.]+ V([\d.]+)/g)].map((match) => ({
    x: Number(match[1]),
    top: Number(match[2]),
  }));
}

describe("DailyColumns", () => {
  const days = [
    { date: "2026-10-27", value: 1 },
    { date: "2026-10-28", value: 3 },
    { date: "2026-10-29", value: 2 },
  ];

  it("draws one column and one hover title per day", () => {
    const html = renderToStaticMarkup(
      <DailyColumns title="Active providers per day" days={days} unit={UNIT} />,
    );

    expect(columnTops(html)).toHaveLength(3);
    expect(html.match(/<title>/g)).toHaveLength(3);
    expect(html).toContain("<title>Oct 28: 3 active providers</title>");
    expect(html).toContain("<title>Oct 27: 1 active provider</title>");
  });

  it("makes the tallest column the peak day", () => {
    const html = renderToStaticMarkup(
      <DailyColumns title="Active providers per day" days={days} unit={UNIT} />,
    );

    const tallest = columnTops(html).reduce((best, column) =>
      column.top < best.top ? column : best,
    );
    // Column x = left gutter (28) + index * slot (32) + centring offset (4).
    expect(tallest.x).toBe(28 + 1 * 32 + 4);
    expect(html).toContain(
      'aria-label="Active providers per day, Oct 27 to Oct 29, peak 3 on Oct 28"',
    );
  });

  it("labels only the first, middle and last day and the peak value", () => {
    const html = renderToStaticMarkup(
      <DailyColumns title="Active providers per day" days={days} unit={UNIT} />,
    );

    expect(html).toContain(">Oct 27</text>");
    expect(html).toContain(">Oct 28</text>");
    expect(html).toContain(">Oct 29</text>");
    expect(html).toContain(">3</text>");
    expect(html).not.toContain(">1</text>");
  });

  it("shows the axes and a note when every value is zero", () => {
    const html = renderToStaticMarkup(
      <DailyColumns
        title="Feedback per day"
        days={days.map((day) => ({ ...day, value: 0 }))}
        unit={UNIT}
      />,
    );

    expect(columnTops(html)).toHaveLength(0);
    expect(html).toContain(
      'aria-label="Feedback per day, Oct 27 to Oct 29, no activity',
    );
    expect(html).toContain("No activity in this period.");
    expect(html).toContain("stroke-border");
  });
});

describe("CategoryBars", () => {
  const rows = [
    { label: "Waiting for parts", value: 2 },
    { label: "In progress", value: 8 },
    { label: "Ready", value: 4 },
  ];

  it("keeps the given order rather than sorting by value", () => {
    const html = renderToStaticMarkup(
      <CategoryBars title="Repairs by status (now)" rows={rows} />,
    );

    const waiting = html.indexOf('title="Waiting for parts: 2"');
    const progress = html.indexOf('title="In progress: 8"');
    const ready = html.indexOf('title="Ready: 4"');
    expect(waiting).toBeLessThan(progress);
    expect(progress).toBeLessThan(ready);
  });

  it("makes the widest bar the max value and renders each value as text", () => {
    const html = renderToStaticMarkup(
      <CategoryBars title="Repairs by status (now)" rows={rows} />,
    );

    expect(html).toContain("width:100%");
    expect(html).toContain("width:25%");
    expect(html).toContain(">8</span>");
    expect(html).toContain(">2</span>");
    expect(html).toContain(
      'aria-label="Repairs by status (now), largest In progress at 8"',
    );
  });

  it("notes no activity when every row is zero", () => {
    const html = renderToStaticMarkup(
      <CategoryBars
        title="Feedback by category"
        rows={rows.map((row) => ({ ...row, value: 0 }))}
      />,
    );

    expect(html).toContain(
      'aria-label="Feedback by category, no activity in this period"',
    );
    expect(html).toContain("No activity in this period.");
  });
});
