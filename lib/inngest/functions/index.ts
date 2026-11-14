import { collectSourcesJob } from "./collect-sources";
import { enrichJob } from "./enrich";
import { fetchSnapshotJob } from "./fetch-snapshot";
import { heartbeat } from "./heartbeat";
import { importMembersJob } from "./import-members";
import { profileAllMembersJob } from "./profile-all-members";
import { profileCompanyJob } from "./profile-company";
import { refreshProfilesJob } from "./refresh-profiles";

/**
 * Every Inngest function the app serves. Add new jobs here, and sync the app
 * after the deploy (PUT /api/inngest) so Inngest Cloud knows the new one.
 */
export const functions = [
  heartbeat,
  fetchSnapshotJob,
  importMembersJob,
  profileCompanyJob,
  profileAllMembersJob,
  collectSourcesJob,
  enrichJob,
  refreshProfilesJob,
];
