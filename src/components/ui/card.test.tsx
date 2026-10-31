import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CardContent } from "./card";

describe("CardContent", () => {
  it("adds top padding when it is the first child, for cards without a header", () => {
    const html = renderToStaticMarkup(<CardContent>Thanks!</CardContent>);

    expect(html).toContain("first:pt-6");
  });
});
