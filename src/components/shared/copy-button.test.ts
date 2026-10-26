import { describe, expect, it, vi } from "vitest";

import { copyText } from "./copy-button";

describe("copyText", () => {
  it("uses the Clipboard API when it accepts the write", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fallback = vi.fn();

    await expect(
      copyText("TRK-1", { clipboard: { writeText }, fallback }),
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("TRK-1");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back when the Clipboard API rejects the write", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    const fallback = vi.fn().mockReturnValue(true);

    await expect(
      copyText("REQ-1", { clipboard: { writeText }, fallback }),
    ).resolves.toBe(true);
    expect(fallback).toHaveBeenCalledWith("REQ-1");
  });

  it("falls back when there is no Clipboard API", async () => {
    const fallback = vi.fn().mockReturnValue(true);

    await expect(copyText("REQ-1", { fallback })).resolves.toBe(true);
    expect(fallback).toHaveBeenCalledWith("REQ-1");
  });

  it("reports failure when every copy method fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    const fallback = vi.fn().mockReturnValue(false);

    await expect(
      copyText("TN-1", { clipboard: { writeText }, fallback }),
    ).resolves.toBe(false);
  });
});
