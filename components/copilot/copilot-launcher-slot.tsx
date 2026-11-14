import { CopilotLauncher } from "@/components/copilot/copilot-launcher";
import { getViewer, type Viewer } from "@/lib/auth";

/** Members with a company get the Copilot launcher; staff and signed-out visitors do not (/api/chat refuses them). */
export function showsCopilotLauncher(viewer: Pick<Viewer, "role" | "companyId"> | null): boolean {
  return viewer?.role === "member" && Boolean(viewer.companyId);
}

/**
 * Reads the session, so the root layout renders it inside a <Suspense>
 * boundary and the page never waits for it. Keyed by user, so a chat is never
 * carried over to a different account.
 */
export async function CopilotLauncherSlot() {
  const viewer = await getViewer();
  if (!viewer || !showsCopilotLauncher(viewer)) return null;
  return <CopilotLauncher key={viewer.userId} />;
}
