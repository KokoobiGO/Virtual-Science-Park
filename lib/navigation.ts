/**
 * The menu for each role (S7). The screens themselves arrive with the
 * Frontend stream; until then each route is a placeholder naming its task.
 */
import type { AppRole } from "./schemas";

export type NavItem = { href: string; label: string; backlog: string };

export const NAV: Record<AppRole, NavItem[]> = {
  member: [
    { href: "/week", label: "Your week", backlog: "C3" },
    { href: "/profile", label: "Company profile", backlog: "C5" },
    { href: "/explore", label: "Explore", backlog: "C14" },
    { href: "/scout", label: "Scout", backlog: "C10" },
  ],
  staff: [
    { href: "/staff/compare", label: "Compare", backlog: "C9" },
    { href: "/staff/ecosystem", label: "Ecosystem map", backlog: "C17" },
    { href: "/explore", label: "Explore", backlog: "C14" },
    { href: "/trust", label: "Trust report", backlog: "C12" },
    { href: "/staff/checks", label: "Service checks", backlog: "S3" },
  ],
};

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
export const SIGNED_IN_ONLY = ["/week", "/profile", "/explore", "/scout", "/staff", "/trust"];
