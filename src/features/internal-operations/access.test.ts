import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeAuthError extends Error {
    constructor(
      message: string,
      public readonly code: string,
    ) {
      super(message);
      this.name = "AuthError";
    }
  }

  return {
    requireUser: vi.fn(),
    findInternalOperator: vi.fn(),
    appendInternalAccessAudit: vi.fn(),
    FakeAuthError,
  };
});

vi.mock("@/features/auth", () => ({
  requireUser: mocks.requireUser,
  AuthError: mocks.FakeAuthError,
}));

vi.mock("./persistence", () => ({
  findInternalOperator: mocks.findInternalOperator,
  appendInternalAccessAudit: mocks.appendInternalAccessAudit,
}));

import {
  recordSensitiveInternalAccess,
  requireInternalOperator,
} from "./access";

function authenticatedUser(id: string) {
  return { id, email: `${id}@example.test`, userMetadata: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("requireInternalOperator", () => {
  it("reports an expected anonymous request as UNAUTHENTICATED", async () => {
    mocks.requireUser.mockRejectedValue(
      new mocks.FakeAuthError("Authentication required", "UNAUTHENTICATED"),
    );

    await expect(requireInternalOperator()).resolves.toEqual({
      status: "UNAUTHENTICATED",
    });
    expect(mocks.findInternalOperator).not.toHaveBeenCalled();
  });

  it.each([
    ["OWNER", "SHOP"],
    ["STAFF", "SHOP"],
    ["OWNER", "INDEPENDENT"],
  ])(
    "denies a Provider %s without a mapping, ignoring metadata",
    async (role, providerType) => {
      mocks.requireUser.mockResolvedValue({
        ...authenticatedUser("user-with-provider"),
        userMetadata: { role, provider_type: providerType },
      });
      mocks.findInternalOperator.mockResolvedValue({ status: "MISSING" });

      await expect(requireInternalOperator()).resolves.toEqual({
        status: "FORBIDDEN",
      });
      expect(mocks.findInternalOperator).toHaveBeenCalledWith(
        "user-with-provider",
      );
    },
  );

  it("ignores forged internal-operator metadata", async () => {
    mocks.requireUser.mockResolvedValue({
      ...authenticatedUser("forged-user"),
      userMetadata: { internal_operator: true },
    });
    mocks.findInternalOperator.mockResolvedValue({ status: "MISSING" });

    await expect(requireInternalOperator()).resolves.toEqual({
      status: "FORBIDDEN",
    });
    expect(mocks.findInternalOperator).toHaveBeenCalledWith("forged-user");
  });

  it("denies a disabled mapping", async () => {
    mocks.requireUser.mockResolvedValue(authenticatedUser("disabled-operator"));
    mocks.findInternalOperator.mockResolvedValue({ status: "DISABLED" });

    await expect(requireInternalOperator()).resolves.toEqual({
      status: "FORBIDDEN",
    });
  });

  it("allows an enabled operator without any Provider", async () => {
    mocks.requireUser.mockResolvedValue(authenticatedUser("ops-user"));
    mocks.findInternalOperator.mockResolvedValue({ status: "ENABLED" });

    await expect(requireInternalOperator()).resolves.toEqual({
      status: "ALLOWED",
      userId: "ops-user",
    });
    expect(mocks.findInternalOperator).toHaveBeenCalledWith("ops-user");
  });

  it("fails closed when authentication infrastructure fails", async () => {
    mocks.requireUser.mockRejectedValue(
      new mocks.FakeAuthError(
        "Authentication service unavailable",
        "INFRASTRUCTURE_FAILURE",
      ),
    );

    await expect(requireInternalOperator()).resolves.toEqual({
      status: "UNAVAILABLE",
    });
  });

  it("fails closed on an unexpected authentication failure", async () => {
    mocks.requireUser.mockRejectedValue(new Error("unexpected auth fault"));

    await expect(requireInternalOperator()).resolves.toEqual({
      status: "UNAVAILABLE",
    });
  });

  it("fails closed when the mapping lookup errors", async () => {
    mocks.requireUser.mockResolvedValue(authenticatedUser("ops-user"));
    mocks.findInternalOperator.mockResolvedValue({ status: "ERROR" });

    await expect(requireInternalOperator()).resolves.toEqual({
      status: "UNAVAILABLE",
    });
  });

  it("fails closed when the mapping lookup throws", async () => {
    mocks.requireUser.mockResolvedValue(authenticatedUser("ops-user"));
    mocks.findInternalOperator.mockRejectedValue(new Error("db offline"));

    await expect(requireInternalOperator()).resolves.toEqual({
      status: "UNAVAILABLE",
    });
  });

  it("reloads the permission on every call instead of caching it", async () => {
    mocks.requireUser.mockResolvedValue(authenticatedUser("ops-user"));
    mocks.findInternalOperator
      .mockResolvedValueOnce({ status: "ENABLED" })
      .mockResolvedValueOnce({ status: "DISABLED" });

    await expect(requireInternalOperator()).resolves.toEqual({
      status: "ALLOWED",
      userId: "ops-user",
    });
    await expect(requireInternalOperator()).resolves.toEqual({
      status: "FORBIDDEN",
    });
    expect(mocks.findInternalOperator).toHaveBeenCalledTimes(2);
  });
});

describe("recordSensitiveInternalAccess", () => {
  it("refuses to append for a non-ALLOWED access outcome", async () => {
    const outcomes = [
      {
        authError: new mocks.FakeAuthError(
          "Authentication required",
          "UNAUTHENTICATED",
        ),
        lookup: null,
      },
      {
        authError: null,
        lookup: { status: "MISSING" },
      },
      {
        authError: null,
        lookup: { status: "DISABLED" },
      },
      {
        authError: null,
        lookup: { status: "ERROR" },
      },
    ];

    for (const outcome of outcomes) {
      vi.clearAllMocks();
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      if (outcome.authError) {
        mocks.requireUser.mockRejectedValue(outcome.authError);
      } else {
        mocks.requireUser.mockResolvedValue(authenticatedUser("ops-user"));
        mocks.findInternalOperator.mockResolvedValue(outcome.lookup);
      }

      await expect(
        recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW"),
      ).resolves.toBe(false);
      expect(mocks.appendInternalAccessAudit).not.toHaveBeenCalled();
    }
  });

  it("appends the fixed category for the verified operator", async () => {
    mocks.requireUser.mockResolvedValue(authenticatedUser("ops-user"));
    mocks.findInternalOperator.mockResolvedValue({ status: "ENABLED" });
    mocks.appendInternalAccessAudit.mockResolvedValue(true);

    await expect(
      recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW"),
    ).resolves.toBe(true);
    expect(mocks.appendInternalAccessAudit).toHaveBeenCalledTimes(1);
    expect(mocks.appendInternalAccessAudit).toHaveBeenCalledWith(
      "ops-user",
      "INTERNAL_ACCESS_VIEW",
    );
  });

  it("fails closed when the audit append fails", async () => {
    mocks.requireUser.mockResolvedValue(authenticatedUser("ops-user"));
    mocks.findInternalOperator.mockResolvedValue({ status: "ENABLED" });
    mocks.appendInternalAccessAudit.mockResolvedValue(false);

    await expect(
      recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW"),
    ).resolves.toBe(false);
  });

  it("fails closed when the audit append throws", async () => {
    mocks.requireUser.mockResolvedValue(authenticatedUser("ops-user"));
    mocks.findInternalOperator.mockResolvedValue({ status: "ENABLED" });
    mocks.appendInternalAccessAudit.mockRejectedValue(new Error("audit down"));

    await expect(
      recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW"),
    ).resolves.toBe(false);
  });
});
