import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs orientation", () => {
  it("passes vertical orientation to the native tablist semantics", () => {
    const html = renderToStaticMarkup(
      <Tabs orientation="vertical" defaultValue="profile">
        <TabsList aria-label="Settings sections">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">Your profile</TabsContent>
      </Tabs>,
    );
    const tablist = html.match(/<[^>]*role="tablist"[^>]*>/)?.[0];
    expect(tablist).toContain('aria-orientation="vertical"');
    expect(tablist).toContain('data-orientation="vertical"');
    expect(html).toContain("Your profile");
  });
});
