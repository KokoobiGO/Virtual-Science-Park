/**
 * Sends the weekly digest (C18) through Resend, with sendEmail() from
 * lib/resend.ts (plain fetch to https://api.resend.com/emails, RESEND_API_KEY,
 * from onboarding@resend.dev).
 *
 * There is no member email list yet, so nothing here picks recipients: the
 * caller always names the one address (scripts/digest.ts --to, or `to` on the
 * app/digest.requested event).
 *
 * Resend's answers are turned into a DigestSendError with a clear message.
 * The important one: without a verified domain, Resend only delivers to the
 * Resend account owner's own address and answers 403 for anyone else.
 */
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

/** A Resend error as a DigestSendError with a message a person can act on. Other errors come back as they are. */
export function explainSendError(error: unknown): unknown {
  if (!(error instanceof ResendApiError)) return error;
  const { status, message } = error;
  const options = { cause: error };
  if (status === 403 && /only send testing emails to your own email address/i.test(message)) {
    return new DigestSendError(OWNER_ONLY_MESSAGE, false, options);
  }
  if (status === 401 || (status === 403 && /api key/i.test(message))) return new DigestSendError(KEY_MESSAGE, false, options);
  if (status === 429 && /quota/i.test(message)) return new DigestSendError(`Resend's sending quota is used up for now. ${message}`, false, options);
  if (status === 429 || status >= 500) return new DigestSendError(`Resend is busy or down, try again later. ${message}`, true, options);
  return new DigestSendError(`Resend did not accept the email. ${message}`, false, options);
}

/** Sends one digest to one address. Returns Resend's email id; throws DigestSendError when Resend says no. */
export async function sendDigest(to: string, email: DigestEmail): Promise<{ id: string }> {
  try {
    return await sendEmail({ to: [to], subject: email.subject, html: email.html, text: email.text });
  } catch (error) {
    throw explainSendError(error);
  }
}
