import { describe, expect, it } from "vitest";

import { looksLikeContactDetails } from "./contact-details";

describe("looksLikeContactDetails", () => {
  it.each([
    "write to jane.doe@example.com please",
    "call 0917 123 4567",
    "0917.123.4567",
    "+63 917-123-4567",
    "+63 9171234567",
    "reach me on +44 20 7946 0958",
  ])("flags contact details in %j", (text) => {
    expect(looksLikeContactDetails(text)).toBe(true);
  });

  it.each([
    "My iPhone 15 screen cracked",
    "Galaxy A52 battery drains fast",
    "Order total 2,000 pesos",
    "Released in 2026",
    "IMEI 356938035643809",
    "Version 1.2.3 is slow",
    "Plain message with no contact details",
  ])("does not flag device or number text in %j", (text) => {
    expect(looksLikeContactDetails(text)).toBe(false);
  });
});
