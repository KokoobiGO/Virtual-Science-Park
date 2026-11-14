/**
 * Send one company's weekly digest email (C18) to one address:
 *
 *   await inngest.send({ name: "app/digest.requested", data: { slug: "embeddedart", to: "someone@example.org" } })
 *
 * Same as `tsx scripts/digest.ts <slug> --to <address>`. There is no member
 * email list yet, so there is no schedule: the event always names the one
 * recipient. The week is the one the event was sent in; with no cards that
 * week, nothing is sent. Resend refusing the address (no verified domain:
 * only the Resend account owner's own address) or the key fails the run
 * without retries; a rate limit or an outage is tried again.
 */
import { NonRetriableError } from "inngest";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { prepareDigest, UnknownCompanyError } from "@/lib/email/load";
import { DigestRequest, DigestSendError, digestSiteUrl, sendDigest } from "@/lib/email/send";
import { inngest } from "../client";

export type SendDigestResult = {
  company: string;
  weekOf: string;
  cards: number;
  sent: boolean;
  /** Resend's id for the email, when it was sent. */
  emailId: string | null;
};

export const sendDigestJob = inngest.createFunction(
  {
    id: "send-digest",
    name: "Send one company's weekly digest",
    retries: 2,
    triggers: [{ event: "app/digest.requested" }],
  },
  async ({ event, step }): Promise<SendDigestResult> => {
    const request = DigestRequest.safeParse(event.data);
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const { slug, to } = request.data;
    // The function body runs again for every step, so the event's time is the stable "now".
    const requestedAt = new Date(event.ts ?? Date.now());

    const prepared = await step.run("build the email", async () => {
      try {
        return await prepareDigest(slug, { now: requestedAt, siteUrl: digestSiteUrl() });
      } catch (error) {
        if (error instanceof UnknownCompanyError) throw new NonRetriableError(error.message);
        throw error;
      }
    });

    const email = prepared.email;
    const emailId = email
      ? await step.run("send", async () => {
          try {
            return (await sendDigest(to, email)).id;
          } catch (error) {
            if (error instanceof DigestSendError && !error.retryable) throw new NonRetriableError(error.message, { cause: error });
            throw error;
          }
        })
      : null;

    const result: SendDigestResult = { company: prepared.slug, weekOf: prepared.weekOf, cards: prepared.cards, sent: emailId !== null, emailId };

    await step.run("record run", async () => {
      // The address stays out of job_runs: Resend's dashboard has it, under the email id.
      await getDb()
        .insert(jobRuns)
        .values({
          job: "send-digest",
          trigger: event.name,
          status: "succeeded",
          startedAt: requestedAt,
          finishedAt: new Date(),
          stats: result,
        });
    });

    return result;
  },
);
