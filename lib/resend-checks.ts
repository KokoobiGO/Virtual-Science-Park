/**
 * Live check for Resend (S2), run from /staff/checks with this deploy's
 * RESEND_API_KEY. It sends one email to Resend's test inbox, so no person
 * receives it; the email shows as delivered in the Resend dashboard.
 */
import type { CheckResult } from "./nvidia-checks";
import { RESEND_TEST_INBOX, ResendApiError, sendEmail } from "./resend";

export const RESEND_CHECKS = {
  send: `Send a test email (to ${RESEND_TEST_INBOX})`,
} as const;

export type ResendCheckId = keyof typeof RESEND_CHECKS;

export function isResendCheckId(value: string | null): value is ResendCheckId {
  return value !== null && Object.hasOwn(RESEND_CHECKS, value);
}

const KEY_HINT = "Resend refused RESEND_API_KEY. Copy it again from resend.com/api-keys (it starts with re_).";

export async function runResendCheck(id: ResendCheckId): Promise<CheckResult & { hint?: string }> {
  const feature = RESEND_CHECKS[id];
  if (!process.env.RESEND_API_KEY) return { feature, status: "FAIL", detail: "RESEND_API_KEY is not set." };
  try {
    const { id: emailId } = await sendEmail({
      to: [RESEND_TEST_INBOX],
      subject: "Virtual Science Park service check",
      text: "Sent by the Resend check on /staff/checks. Nobody receives this test email.",
    });
    return { feature, status: "PASS", detail: `email accepted (${emailId}); it shows in the Resend dashboard under Emails` };
  } catch (error) {
    const refused = error instanceof ResendApiError && (error.status === 401 || error.status === 403);
    return { feature, status: "FAIL", detail: (error as Error).message, hint: refused ? KEY_HINT : undefined };
  }
}
