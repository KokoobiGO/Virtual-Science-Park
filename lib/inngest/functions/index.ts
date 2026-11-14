import { fetchSnapshotJob } from "./fetch-snapshot";
import { heartbeat } from "./heartbeat";

/**
 * Every Inngest function the app serves. Add new jobs here, and sync the app
 * after the deploy (PUT /api/inngest) so Inngest Cloud knows the new one.
 */
export const functions = [heartbeat, fetchSnapshotJob];
