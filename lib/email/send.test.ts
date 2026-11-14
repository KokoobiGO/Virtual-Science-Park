import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DigestRequest, DigestSendError, KEY_MESSAGE, OWNER_ONLY_MESSAGE, sendDigest } from "./send";

const email = { subject: "Your week", html: "<p>Hi</p>", text: "Hi" };

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function failure(promise: Promise<unknown>): Promise<DigestSendError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DigestSendError);
  return error as DigestSendError;
}

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendDigest", () => {
  it("posts one email to the one address, HTML and text, and returns Resend's id", async () => {
    const fetchMock = answer(200, { id: "email-123" });
    await expect(sendDigest("member@example.org", email)).resolves.toEqual({ id: "email-123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ to: ["member@example.org"], subject: "Your week", html: "<p>Hi</p>", text: "Hi" });
    expect(body.from).toContain("onboarding@resend.dev");
  });

  it("explains the 403 Resend gives without a verified domain, and does not retry it", async () => {
    answer(403, {
      statusCode: 403,
      name: "validation_error",
      message: "You can only send testing emails to your own email address (owner@example.org). To send emails to other recipients, please verify a domain at resend.com/domains.",
    });
    const error = await failure(sendDigest("someone-else@example.org", email));
    expect(error.message).toBe(OWNER_ONLY_MESSAGE);
    expect(error.retryable).toBe(false);
    expect((error.cause as Error).message).toContain("only send testing emails");
  });

  it("explains a refused key", async () => {
    answer(401, { statusCode: 401, name: "validation_error", message: "API key is invalid" });
    const error = await failure(sendDigest("member@example.org", email));
    expect(error.message).toBe(KEY_MESSAGE);
    expect(error.retryable).toBe(false);
  });

  it("retries a rate limit or an outage, but not a used-up quota", async () => {
    answer(429, { statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests." });
    expect((await failure(sendDigest("member@example.org", email))).retryable).toBe(true);
    answer(503, { statusCode: 503, name: "service_unavailable", message: "API is temporarily unavailable" });
    expect((await failure(sendDigest("member@example.org", email))).retryable).toBe(true);
    answer(429, { statusCode: 429, name: "daily_quota_exceeded", message: "You have exceeded your daily email sending quota." });
    expect((await failure(sendDigest("member@example.org", email))).retryable).toBe(false);
  });
});

describe("DigestRequest", () => {
  it("needs a slug and one email address", () => {
    expect(DigestRequest.safeParse({ slug: "embeddedart", to: "member@example.org" }).success).toBe(true);
    expect(DigestRequest.safeParse({ slug: "embeddedart" }).success).toBe(false);
    expect(DigestRequest.safeParse({ slug: "embeddedart", to: "not an address" }).success).toBe(false);
    expect(DigestRequest.safeParse({ slug: "", to: "member@example.org" }).success).toBe(false);
  });
});
