/**
 * The menu for each role (S7, C2), the landing page per role, and which paths
 * need a signed-in user or one role. proxy.ts makes its redirects from these
 * lists; the pages check again on the server.
 */
import type { AppRole } from "./schemas";

/** The key of a menu item's texts in messages/*.json (`nav.<id>.label`, `nav.<id>.description`). */
export type NavId =
  | "week"
  | "profile"
  | "explore"
  | "scout"
  | "copilot"
  | "trust"
  | "compare"
  | "ecosystem"
  | "companyProfiles"
  | "handoffs"
  | "injectionTest"
  | "checks"
  | "sources";

export type NavItem = {
  id: NavId;
  href: string;
  /** The English label; the header shows `nav.<id>.label` in the reader's language. */
  label: string;
  /** Backlog item that builds the screen. */
  backlog: string;
  /** One line for the start page. */
  description: string;
};

export const NAV: Record<AppRole, NavItem[]> = {
  member: [
    { id: "week", href: "/week", label: "Your week", backlog: "C3", description: "This week's potential matches, each with its source." },
    { id: "profile", href: "/profile", label: "Company profile", backlog: "C5", description: "What the public pages say about you. Correct it here." },
    { id: "explore", href: "/explore", label: "Explore", backlog: "C14", description: "Search every funding call, testbed and event." },
    { id: "scout", href: "/scout", label: "Scout", backlog: "C10", description: "Ask for a short brief on a market, partner or call." },
    { id: "copilot", href: "/copilot", label: "Copilot", backlog: "C11", description: "Ask about funding, test facilities, events and your matches, with sources." },
    { id: "trust", href: "/trust", label: "Trust report", backlog: "C12", description: "How well the profiles and matches hold up." },
  ],
  staff: [
    { id: "compare", href: "/staff/compare", label: "Compare", backlog: "C9", description: "Two members side by side, from public data." },
    { id: "ecosystem", href: "/staff/ecosystem", label: "Ecosystem map", backlog: "C17", description: "Members by technology area, with suggested connections." },
    { id: "companyProfiles", href: "/profile", label: "Company profiles", backlog: "C5", description: "Every member's public profile, with its evidence." },
    { id: "handoffs", href: "/staff/handoffs", label: "Handoffs", backlog: "C11", description: "Questions members sent to BSP staff." },
    { id: "explore", href: "/explore", label: "Explore", backlog: "C14", description: "Search every funding call, testbed and event." },
    { id: "injectionTest", href: "/staff/injection-demo", label: "Injection test", backlog: "B13", description: "A page with hidden instructions to AI, and what the system did with them." },
    { id: "trust", href: "/trust", label: "Trust report", backlog: "C12", description: "How well the profiles and matches hold up." },
    { id: "checks", href: "/staff/checks", label: "Service checks", backlog: "S3", description: "Test calls to the hosted services and jobs." },
  ],
};

/** Links every signed-in user gets, in the footer. */
export const SHARED_NAV: NavItem[] = [
  { id: "sources", href: "/sources", label: "Data status", backlog: "C13", description: "Every data source: live, cached or hand-entered." },
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
  { prefix: "/scout", role: "member" },
  { prefix: "/copilot", role: "member" },
];

/** Paths that need a signed-in user. */
export const SIGNED_IN_ONLY = ["/week", "/profile", "/explore", "/scout", "/copilot", "/staff", "/trust", "/sources"];

/** True when `pathname` is `href` or a page below it, for marking the current menu item. */
export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
