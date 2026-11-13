/**
 * The demo accounts. Shared by the seed script, the privacy tests and the
 * sign-in page hint. Passwords are not stored here: see DEMO_USER_PASSWORD.
 */
export type DemoAccount =
  | { email: string; role: "member"; companySlug: string; displayName: string }
  | { email: string; role: "staff"; displayName: string };

export const DEMO_ACCOUNTS = [
  { email: "techinova@demo.vsp.test", role: "member", companySlug: "techinova", displayName: "Techinova (demo)" },
  { email: "embeddedart@demo.vsp.test", role: "member", companySlug: "embeddedart", displayName: "EmbeddedArt (demo)" },
  { email: "malvacom@demo.vsp.test", role: "member", companySlug: "malvacom", displayName: "Malvacom (demo)" },
  { email: "staff@demo.vsp.test", role: "staff", displayName: "BSP staff (demo)" },
] as const satisfies readonly DemoAccount[];
