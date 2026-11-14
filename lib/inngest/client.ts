import { Inngest } from "inngest";

/**
 * Inngest runs every scheduled and fan-out job (collect, profile, re-rank,
 * digest). Locally set INNGEST_DEV=1 and run `npm run inngest:dev`; in
 * production INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY come from Netlify.
 */
export const inngest = new Inngest({ id: "virtual-science-park" });
