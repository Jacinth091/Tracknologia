import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { submitFeedbackForm } from "./form";
import { FeedbackError, type FeedbackErrorCode } from "./types";

const NONCE = "5f0c6f7e-3b1a-4c5d-8e9f-0a1b2c3d4e5f";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_TEXT = "db password leaked";

function formDataWith(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

function validFields(overrides: Record<string, string> = {}) {
  return {
    category: "BUG",
    title: "Tracking page",
    message: "The status never updates.",
    submissionNonce: NONCE,
    ...overrides,
  };
}

const accepting = () => vi.fn().mockResolvedValue({ accepted: true });

const rejecting = (code: FeedbackErrorCode) =>
  vi.fn().mockRejectedValue(new FeedbackError("Feedback error", code));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submitFeedbackForm", () => {
  it("accepts the submission and returns a fresh nonce", async () => {
    const state = await submitFeedbackForm(
      formDataWith(validFields()),
      accepting(),
    );

    expect(state).toEqual({
      status: "accepted",
      nextNonce: expect.stringMatching(UUID_PATTERN),
    });
    expect(JSON.stringify(state)).not.toContain(NONCE);
  });

  it("passes only the four form fields to submit", async () => {
    const submit = accepting();
    const formData = formDataWith(
      validFields({
        source: "PROVIDER_WORKSPACE",
        participantClass: "SHOP_OWNER",
        providerId: "00000000-0000-4000-8000-0000000000aa",
        userId: "00000000-0000-4000-8000-0000000000bb",
        role: "OWNER",
      }),
    );

    await submitFeedbackForm(formData, submit);

    expect(submit).toHaveBeenCalledTimes(1);
    const [input] = submit.mock.calls[0];
    expect(Object.keys(input).sort()).toEqual([
      "category",
      "message",
      "submissionNonce",
      "title",
    ]);
    expect(input).toEqual({
      category: "BUG",
      title: "Tracking page",
      message: "The status never updates.",
      submissionNonce: NONCE,
    });
  });

  it("returns field errors and keeps values and the valid nonce on invalid input", async () => {
    const state = await submitFeedbackForm(
      formDataWith(validFields({ message: "" })),
      rejecting("INVALID_INPUT"),
    );

    expect(state).toEqual({
      status: "rejected",
      reason: "INVALID_INPUT",
      message: "Feedback error",
      fieldErrors: { message: "Enter a message before submitting." },
      values: {
        category: "BUG",
        title: "Tracking page",
        message: "",
      },
      nonce: NONCE,
    });
  });

  it.each([
    [
      { message: "a".repeat(2001) },
      "message",
      "Your message is too long. Keep it to 2,000 characters or fewer.",
    ],
    [
      { title: "a".repeat(121) },
      "title",
      "Your title is too long. Keep it to 120 characters or fewer.",
    ],
    [{ category: "" }, "category", "Choose a feedback category"],
  ])(
    "maps invalid %j to the %s field copy",
    async (overrides, field, copy) => {
      const state = await submitFeedbackForm(
        formDataWith(validFields(overrides)),
        rejecting("INVALID_INPUT"),
      );

      expect(state).toMatchObject({
        status: "rejected",
        reason: "INVALID_INPUT",
        fieldErrors: { [field]: copy },
      });
    },
  );

  it("replaces a malformed nonce with a fresh UUID on rejection", async () => {
    const formData = formDataWith(
      validFields({ message: "", submissionNonce: "not-a-uuid" }),
    );

    const state = await submitFeedbackForm(
      formData,
      rejecting("INVALID_INPUT"),
    );

    expect(state).toMatchObject({
      status: "rejected",
      nonce: expect.stringMatching(UUID_PATTERN),
    });
    expect(JSON.stringify(state)).not.toContain("not-a-uuid");
  });

  it.each([
    ["RATE_LIMITED", "Too many submissions. Wait a few minutes and try again."],
    ["FORBIDDEN", "Sign in to your Provider account to send feedback."],
    ["UNAVAILABLE", "Feedback is temporarily unavailable. Try again later."],
  ] as const)(
    "gives %s the fixed copy and keeps the nonce and values",
    async (code, copy) => {
      const state = await submitFeedbackForm(
        formDataWith(validFields()),
        rejecting(code),
      );

      expect(state).toEqual({
        status: "rejected",
        reason: code,
        message: copy,
        fieldErrors: {},
        values: {
          category: "BUG",
          title: "Tracking page",
          message: "The status never updates.",
        },
        nonce: NONCE,
      });
    },
  );

  it("turns an unexpected error into UNAVAILABLE without its text", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const submit = vi.fn().mockRejectedValue(new Error(PRIVATE_TEXT));

    const state = await submitFeedbackForm(
      formDataWith(validFields()),
      submit,
    );

    expect(state).toMatchObject({
      status: "rejected",
      reason: "UNAVAILABLE",
      message: "Feedback is temporarily unavailable. Try again later.",
      fieldErrors: {},
      nonce: NONCE,
    });
    expect(JSON.stringify(state)).not.toContain(PRIVATE_TEXT);
    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(PRIVATE_TEXT);
  });
});
