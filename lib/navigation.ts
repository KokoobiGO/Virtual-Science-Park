/**
 * The menu for each role (S7, C2), the landing page per role, and which paths
 * need a signed-in user or one role. proxy.ts makes its redirects from these
 * lists; the pages check again on the server.
 */
import type { AppRole } from "./schemas";

export type NavItem = {
  href: string;
  label: string;
  /** Backlog item that builds the screen. */
  backlog: string;
  /** One line for the start page. */
  description: string;
};

export const NAV: Record<AppRole, NavItem[]> = {
  member: [
    { href: "/week", label: "Your week", backlog: "C3", description: "This week's potential matches, each with its source." },
    { href: "/profile", label: "Company profile", backlog: "C5", description: "What the public pages say about you. Correct it here." },
    { href: "/explore", label: "Explore", backlog: "C14", description: "Search every funding call, testbed and event." },
    { href: "/scout", label: "Scout", backlog: "C10", description: "Ask for a short brief on a market, partner or call." },
    { href: "/trust", label: "Trust report", backlog: "C12", description: "How well the profiles and matches hold up." },
  ],
  staff: [
    { href: "/staff/compare", label: "Compare", backlog: "C9", description: "Two members side by side, from public data." },
    { href: "/staff/ecosystem", label: "Ecosystem map", backlog: "C17", description: "Members by technology area, with suggested connections." },
    { href: "/staff/handoffs", label: "Handoffs", backlog: "C11", description: "Questions members sent to BSP staff." },
    { href: "/explore", label: "Explore", backlog: "C14", description: "Search every funding call, testbed and event." },
    { href: "/trust", label: "Trust report", backlog: "C12", description: "How well the profiles and matches hold up." },
    { href: "/staff/checks", label: "Service checks", backlog: "S3", description: "Test calls to the hosted services and jobs." },
  ],
};

/** Links every signed-in user gets, in the footer. */
export const SHARED_NAV: NavItem[] = [
  { href: "/sources", label: "Data status", backlog: "C13", description: "Every data source: live, cached or hand-entered." },
];

/** Where each role lands after signing in. */
export const HOME: Record<AppRole, string> = {
  member: "/week",
  staff: "/staff/compare",
};

/** Paths only one role may open. Anything else signed-in users share. */
export const ROLE_ONLY: { prefix: string; role: AppRole }[] = [
  { prefix: "/staff", role: "staff" },
  { prefix: "/week", role: "member" },
  { prefix: "/profile", role: "member" },
  { prefix: "/scout", role: "member" },
];

/** Paths that need a signed-in user. */
export const SIGNED_IN_ONLY = ["/week", "/profile", "/explore", "/scout", "/staff", "/trust", "/sources"];

/** True when `pathname` is `href` or a page below it, for marking the current menu item. */
export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
