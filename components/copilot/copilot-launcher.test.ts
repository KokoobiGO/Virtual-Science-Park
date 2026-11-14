import { createElement, isValidElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/lib/auth";

const state = vi.hoisted(() => ({ pathname: "/week", viewer: null as unknown }));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/auth", () => ({ getViewer: async () => state.viewer }));

const { CopilotLauncher, isCopilotPage } = await import("./copilot-launcher");
const { CopilotLauncherSlot, showsCopilotLauncher } = await import("./copilot-launcher-slot");

function viewer(role: Viewer["role"], companyId: string | null): Viewer {
  return { userId: `user-${role}`, email: null, displayName: null, role, companyId, claims: {} as Viewer["claims"] };
}

describe("who gets the Copilot launcher", () => {
  it("a member with a company does", () => {
    expect(showsCopilotLauncher(viewer("member", "company-1"))).toBe(true);
  });

  it("staff, a member without a company and signed-out visitors do not", () => {
    expect(showsCopilotLauncher(viewer("staff", null))).toBe(false);
    expect(showsCopilotLauncher(viewer("member", null))).toBe(false);
    expect(showsCopilotLauncher(null)).toBe(false);
  });
});

describe("CopilotLauncherSlot", () => {
  beforeEach(() => {
    state.viewer = null;
  });

  it("renders the launcher for a member, keyed by the user so a chat never carries over to another account", async () => {
    state.viewer = viewer("member", "company-1");
    const element = await CopilotLauncherSlot();
    expect(isValidElement(element)).toBe(true);
    expect(element?.type).toBe(CopilotLauncher);
    expect(element?.key).toBe("user-member");
  });

  it("renders nothing for staff or a signed-out visitor", async () => {
    state.viewer = viewer("staff", null);
    expect(await CopilotLauncherSlot()).toBeNull();
    state.viewer = null;
    expect(await CopilotLauncherSlot()).toBeNull();
  });
});

describe("CopilotLauncher", () => {
  it("shows a labelled button that opens a dialog, and no chat until it is opened", () => {
    state.pathname = "/week";
    const html = renderToString(createElement(CopilotLauncher));
    expect(html).toContain('data-testid="copilot-launcher"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Copilot");
    expect(html).not.toContain("Your question");
  });

  it("hides the button on the full-page Copilot", () => {
    state.pathname = "/copilot";
    expect(renderToString(createElement(CopilotLauncher))).not.toContain("copilot-launcher");
  });

  it("knows the Copilot page and the pages below it", () => {
    expect(isCopilotPage("/copilot")).toBe(true);
    expect(isCopilotPage("/copilot/anything")).toBe(true);
    expect(isCopilotPage("/copilots")).toBe(false);
    expect(isCopilotPage("/week")).toBe(false);
    expect(isCopilotPage(null)).toBe(false);
  });
});
