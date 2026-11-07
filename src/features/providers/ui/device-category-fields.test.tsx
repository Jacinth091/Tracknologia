import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeviceCategoryFields } from "./device-category-fields";

describe("Provider device categories", () => {
  it("renders native checkboxes and preserves existing custom categories", () => {
    const html = renderToStaticMarkup(
      <DeviceCategoryFields
        selected={["Tablets", "Vintage radios, amplifiers", "Tablets"]}
      />,
    );
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(7);
    expect(inputs.filter((input) => input.includes('checked=""'))).toHaveLength(
      2,
    );
    for (const input of inputs) {
      expect(input).toContain('type="checkbox"');
      expect(input).toContain('name="supportedDevices"');
    }
    expect(html).toContain('value="Vintage radios, amplifiers"');
  });
  it("starts with no selections and disables choices while saving", () => {
    const html = renderToStaticMarkup(
      <DeviceCategoryFields disabled error="Choose fewer categories." />,
    );
    expect(html).not.toContain('checked=""');
    for (const input of html.match(/<input\b[^>]*>/g) ?? [])
      expect(input).toContain('disabled=""');
    expect(html).toContain('aria-describedby="device-categories-error"');
    expect(html).toContain('id="device-categories-error"');
    expect(html).toContain("Choose fewer categories.");
  });
});
