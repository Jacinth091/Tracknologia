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
  it("preselects Shop Staff and carries a link invitation without a code field", () => {
    const html = renderToStaticMarkup(<RegisterForm initialInvite="tok_abc" />);

    expect(html.match(/<input[^>]*value="STAFF"[^>]*>/)?.[0]).toContain(
      'checked=""',
    );
    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="inviteToken"[^>]*value="tok_abc"/,
    );
    expect(html).not.toContain('id="inviteToken"');
    expect(html).not.toContain("Shop Invitation Code");
    expect(html).toContain("Your invitation will be applied during setup.");
    expect(html).toContain("Create account");
  });

  it("starts on Independent without an invite and shows no code field", () => {
    const html = renderToStaticMarkup(<RegisterForm />);

    expect(html.match(/<input[^>]*value="INDEPENDENT"[^>]*>/)?.[0]).toContain(
      'checked=""',
    );
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
