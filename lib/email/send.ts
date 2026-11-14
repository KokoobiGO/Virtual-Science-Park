/**
 * Sends the weekly digest (C18) through Resend, with sendEmail() from
 * lib/resend.ts (plain fetch to https://api.resend.com/emails, RESEND_API_KEY,
 * from onboarding@resend.dev).
 *
 * There is no member email list yet, so nothing here picks recipients: the
 * caller always names the one address (scripts/digest.ts --to, or `to` on the
 * app/digest.requested event).
 *
 * Each send carries an idempotency key built from the company slug, the week
 * and the address (digestIdempotencyKey()), so a retried send cannot go out
 * twice.
 *
 * Resend's answers are turned into a DigestSendError with a clear message.
 * The important one: without a verified domain, Resend only delivers to the
 * Resend account owner's own address and answers 403 for anyone else.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { ResendApiError, sendEmail } from "../resend";
import type { DigestEmail } from "./digest";

/** What the script and the job need: which company, and the one address to send it to. */
export const DigestRequest = z.object({
  slug: z.string().trim().min(1),
  to: z.email(),
});
export type DigestRequest = z.infer<typeof DigestRequest>;

/** Locally the site runs here; APP_URL (.env.example) holds the deployed URL. */
export const LOCAL_SITE_URL = "http://localhost:3000";

/** The base URL the email links to: APP_URL, else the local site. */
export function digestSiteUrl(): string {
  return process.env.APP_URL?.trim() || LOCAL_SITE_URL;
}

export const OWNER_ONLY_MESSAGE =
  "Resend refused the address: without a verified domain, Resend only delivers to the Resend account owner's own email address. " +
  "Send to that address, or verify a domain at resend.com/domains and send from an address on it (RESEND_DEFAULT_FROM in lib/resend.ts).";

export const KEY_MESSAGE = "Resend refused RESEND_API_KEY. Copy it again from resend.com/api-keys (it starts with re_).";

export class DigestSendError extends Error {
  constructor(
    message: string,
    /** True when trying again later may work (rate limit, Resend down). */
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DigestSendError";
  }
}

export const ALREADY_SENT_MESSAGE =
  "Resend refused a second, different digest for the same company, week and address within 24 hours (same idempotency key), so nothing more was sent. " +
  "The first one went out; see Emails in the Resend dashboard.";

/** A Resend error as a DigestSendError with a message a person can act on. Other errors come back as they are. */
export function explainSendError(error: unknown): unknown {
  if (!(error instanceof ResendApiError)) return error;
  const { status, message } = error;
  const options = { cause: error };
  if (status === 403 && /only send testing emails to your own email address/i.test(message)) {
    return new DigestSendError(OWNER_ONLY_MESSAGE, false, options);
  }
  if (status === 401 || (status === 403 && /api key/i.test(message))) return new DigestSendError(KEY_MESSAGE, false, options);
  // The first send with this idempotency key is still going: trying again later gets its answer.
  if (status === 409 && /concurrent/i.test(message)) return new DigestSendError(`Resend is still sending this digest, try again later. ${message}`, true, options);
  if (status === 409) return new DigestSendError(ALREADY_SENT_MESSAGE, false, options);
  if (status === 429 && /quota/i.test(message)) return new DigestSendError(`Resend's sending quota is used up for now. ${message}`, false, options);
  if (status === 429 || status >= 500) return new DigestSendError(`Resend is busy or down, try again later. ${message}`, true, options);
  return new DigestSendError(`Resend did not accept the email. ${message}`, false, options);
}

/**
 * Resend's idempotency key for one company's digest for one week to one
 * address: `digest/<slug>/<week>/<recipient>`. The address is lower-cased and
 * hashed, so the key stays short (Resend allows 256 characters) and the
 * address does not show in it.
 */
export function digestIdempotencyKey({ slug, weekOf, to }: { slug: string; weekOf: string; to: string }): string {
  const recipient = createHash("sha256").update(to.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `digest/${slug}/${weekOf}/${recipient}`;
}

/**
 * Sends one digest to one address. Returns Resend's email id; throws
 * DigestSendError when Resend says no.
 *
 * With `week` (the company slug and the week's Monday, as prepareDigest()
 * returns them) the send carries digestIdempotencyKey(), so a retried send of
 * the same digest within 24 hours does not go out twice.
 */
export async function sendDigest(to: string, email: DigestEmail, week?: { slug: string; weekOf: string }): Promise<{ id: string }> {
  const idempotencyKey = week ? digestIdempotencyKey({ slug: week.slug, weekOf: week.weekOf, to }) : undefined;
  try {
    return await sendEmail({ to: [to], subject: email.subject, html: email.html, text: email.text }, { idempotencyKey });
  } catch (error) {
    throw explainSendError(error);
  }
}
