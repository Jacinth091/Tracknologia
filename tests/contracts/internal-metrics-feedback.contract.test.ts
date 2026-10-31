import { describe, expect, it } from "vitest";

import { feedbackSummaryWindowSchema } from "@/features/feedback/schemas";

// Validation metrics split a longer period into Feedback summary batches. This
// pins the Feedback window bound those batches are sized against.
describe("Feedback summary window bound used by validation metrics", () => {
  it("accepts a window of 1 to 31 Asia/Manila days", () => {
    expect(
      feedbackSummaryWindowSchema.safeParse({
        startDate: "2026-07-01",
        endDateExclusive: "2026-07-02",
      }).success,
    ).toBe(true);
    expect(
      feedbackSummaryWindowSchema.safeParse({
        startDate: "2026-07-01",
        endDateExclusive: "2026-08-01",
      }).success,
    ).toBe(true);
  });

  it("rejects a window of 32 Asia/Manila days", () => {
    expect(
      feedbackSummaryWindowSchema.safeParse({
        startDate: "2026-07-01",
        endDateExclusive: "2026-08-02",
      }).success,
    ).toBe(false);
  });
});
