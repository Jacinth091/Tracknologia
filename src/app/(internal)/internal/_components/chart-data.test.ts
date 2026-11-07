import { describe, expect, it } from "vitest";

import { categorical, seriesConfig } from "./chart-data";

describe("seriesConfig", () => {
  it("gives every series a text label, so legends never show colour alone", () => {
    const rows = categorical([
      { key: "SHOP", label: "Shop", value: 12 },
      { key: "INDEPENDENT", label: "Independent", value: 9 },
    ]);

    const config = seriesConfig(rows);

    expect(config.SHOP).toEqual({ label: "Shop", color: "var(--chart-cat-1)" });
    expect(config.INDEPENDENT).toEqual({
      label: "Independent",
      color: "var(--chart-cat-2)",
    });
    for (const row of rows) {
      expect(config[row.key].label).toBeTruthy();
    }
  });
});
