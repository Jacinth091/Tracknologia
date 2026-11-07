import { describe, expect, it } from "vitest";

import { maskEmail } from "./mask-email";

describe("maskEmail", () => {
  it("keeps the first character and the whole domain", () => {
    expect(maskEmail("beth@example.com")).toBe("b•••@example.com");
  });

  it("falls back to a neutral label when there is no usable address", () => {
    expect(maskEmail(undefined)).toBe("your account");
    expect(maskEmail(null)).toBe("your account");
    expect(maskEmail("no-at-sign")).toBe("your account");
    expect(maskEmail("@example.com")).toBe("your account");
  });
});
