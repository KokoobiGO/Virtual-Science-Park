/**
 * Resend email (S2; the weekly digest is C18), called with plain fetch (no SDK
 * to pin). Until we verify our own domain in Resend, mail goes from
 * onboarding@resend.dev, which may only send to the Resend account owner's
 * address and to Resend's test inboxes such as delivered@resend.dev.
 */
export const RESEND_DEFAULT_FROM = "Virtual Science Park <onboarding@resend.dev>";

/** Resend's test inbox: accepts the mail and shows it as delivered; no person gets it. */
export const RESEND_TEST_INBOX = "delivered@resend.dev";

export class ResendApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Resend API ${status}: ${body.slice(0, 300)}`);
  }
}

/** Sends one email. Returns Resend's id; throws ResendApiError on a non-2xx answer. */
export async function sendEmail(email: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
}): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set. See .env.example.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_DEFAULT_FROM, ...email }),
  });
  if (!res.ok) throw new ResendApiError(res.status, await res.text());
  return (await res.json()) as { id: string };
}
