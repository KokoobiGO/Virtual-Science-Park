import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListSkeleton, ProfileSkeleton } from "./loading-skeleton";
import { errorReference } from "./route-error";

describe("errorReference", () => {
  it("gives the digest Next.js puts on a server error, to quote to the team", () => {
    expect(errorReference(Object.assign(new Error("hidden"), { digest: "123456789" }))).toBe("123456789");
  });

  it("gives nothing for an error without a digest or a thrown non-error", () => {
    expect(errorReference(new Error("client error"))).toBeNull();
    expect(errorReference({ digest: "" })).toBeNull();
    expect(errorReference("a string")).toBeNull();
    expect(errorReference(null)).toBeNull();
  });
});

describe("loading states", () => {
  it("say what is loading to screen readers and hide the grey blocks", () => {
    const html = renderToStaticMarkup(createElement(ListSkeleton, { label: "Loading the handoffs…", rows: 2 }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('<span class="sr-only">Loading the handoffs…</span>');
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2);
  });

  it("shape the profile skeleton like the profile: a header and field cards", () => {
    const html = renderToStaticMarkup(createElement(ProfileSkeleton));
    expect(html).toContain("Loading the profile…");
    expect(html.match(/ring-1/g)?.length).toBe(4);
  });
});
