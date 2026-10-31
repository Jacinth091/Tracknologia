import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The form's action state is set per test; the default is no state yet.
const { useActionState } = vi.hoisted(() => ({ useActionState: vi.fn() }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState,
}));
vi.mock("../actions", () => ({ registerAction: vi.fn() }));

import { RegisterForm } from "./register-form";

beforeEach(() => {
  useActionState.mockReturnValue([null, vi.fn(), false]);
});

describe("RegisterForm initial state", () => {
  it("preselects Shop Staff and collapses the code when an invite arrives", () => {
    const html = renderToStaticMarkup(<RegisterForm initialInvite="tok_abc" />);

    expect(html).toMatch(/<input[^>]*value="STAFF"[^>]*checked=""[^>]*>/);
    expect(html).toContain("Invite code added ✓");
    expect(html).toContain("Change");
    expect(html).toMatch(/<input[^>]*name="inviteToken"[^>]*value="tok_abc"/);
    expect(html).toMatch(/<div[^>]*hidden=""[^>]*>/);
    expect(html).toContain("Join shop");
  });

  it("starts on Independent without an invite and shows no code field", () => {
    const html = renderToStaticMarkup(<RegisterForm />);

    expect(html).toMatch(/<input[^>]*value="INDEPENDENT"[^>]*checked=""[^>]*>/);
    expect(html).not.toContain('name="inviteToken"');
    expect(html).not.toContain("Invite code added");
    expect(html).toContain("Create account");
  });

  it("names each role by its title alone, with the description linked", () => {
    const html = renderToStaticMarkup(<RegisterForm />);

    for (const id of [
      "intent-INDEPENDENT-title",
      "intent-SHOP-title",
      "intent-STAFF-title",
    ]) {
      expect(html).toContain(`aria-labelledby="${id}"`);
    }
    expect(html).toContain('id="intent-SHOP-title"');
    expect(html).toContain("Shop Owner");
    expect(html).toContain("Shop Staff");
  });
});

describe("RegisterForm invite errors", () => {
  it("shows the code field and its error when the server rejects a prefilled invite", () => {
    useActionState.mockReturnValue([
      { fieldErrors: { inviteToken: "This invite has expired." } },
      vi.fn(),
      false,
    ]);

    const html = renderToStaticMarkup(<RegisterForm initialInvite="tok_old" />);

    expect(html).toContain("This invite has expired.");
    expect(html).toMatch(/<input[^>]*name="inviteToken"[^>]*value="tok_old"/);
    expect(html).not.toContain("Invite code added");
    // Nothing in the form is hidden, so the field and its error are visible.
    expect(html).not.toContain('hidden=""');
  });
});
