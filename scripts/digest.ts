/**
 * Send one company's weekly digest email (C18): this week's "Your week" cards,
 * with the same functions the send-digest job uses.
 *
 *   tsx --env-file-if-exists=.env.local scripts/digest.ts embeddedart --to someone@example.org
 *   tsx --env-file-if-exists=.env.local scripts/digest.ts embeddedart --dry
 *
 * --to sends to that one address and nobody else: there is no member email
 * list yet. --dry sends nothing and writes data/digest-preview/<slug>.html
 * (and .txt, the text version) to open in a browser.
 *
 * Reads DATABASE_URL, RESEND_API_KEY and APP_URL (the site the email links to;
 * http://localhost:3000 when empty) from .env.local. A company with no cards
 * this week gets no email.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { closeDb } from "../lib/db";
import { prepareDigest } from "../lib/email/load";
import { DigestRequest, DigestSendError, digestSiteUrl, sendDigest } from "../lib/email/send";

const PREVIEW_DIR = path.join("data", "digest-preview");
const USAGE = "Usage: scripts/digest.ts <slug> --to <address>   or   scripts/digest.ts <slug> --dry";

function parseArgs(args: string[]): { slug: string; to: string | null; dry: boolean } {
  let to: string | null = null;
  let dry = false;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry") dry = true;
    else if (arg === "--to") to = args[++i] ?? "";
    else if (arg.startsWith("--to=")) to = arg.slice("--to=".length);
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}. ${USAGE}`);
    else rest.push(arg);
  }
  if (rest.length !== 1) throw new Error(`Name one company slug. ${USAGE}`);
  const slug = rest[0];
  // The slug also names the preview file.
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error(`"${slug}" is not a company slug.`);
  if (!dry && to === null) throw new Error(`Say who gets it with --to <address>, or use --dry to write a preview. ${USAGE}`);
  if (to !== null && !DigestRequest.safeParse({ slug, to }).success) throw new Error(`"${to}" is not an email address.`);
  return { slug, to, dry };
}

async function main() {
  const { slug, to, dry } = parseArgs(process.argv.slice(2));
  const siteUrl = digestSiteUrl();
  const prepared = await prepareDigest(slug, { siteUrl });

  console.log(`${prepared.companyName} (${prepared.slug}), week of ${prepared.weekOf}: ${prepared.cards} cards`);
  if (!prepared.email) {
    console.log("No cards this week, so there is no digest: nothing written, nothing sent.");
    return;
  }
  const { subject, html, text } = prepared.email;
  console.log(`Subject: ${subject}`);
  console.log(`HTML ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB, text ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`);
  console.log(`Links to ${siteUrl}/week${process.env.APP_URL?.trim() ? "" : " (APP_URL is empty, so the local site)"}`);

  if (dry) {
    await mkdir(PREVIEW_DIR, { recursive: true });
    const htmlFile = path.join(PREVIEW_DIR, `${prepared.slug}.html`);
    const textFile = path.join(PREVIEW_DIR, `${prepared.slug}.txt`);
    await writeFile(htmlFile, html, "utf8");
    await writeFile(textFile, text, "utf8");
    console.log(`Dry run, nothing sent. Wrote ${htmlFile} and ${textFile}${to ? ` (--to ${to} ignored)` : ""}.`);
    return;
  }

  const { id } = await sendDigest(to!, prepared.email, prepared);
  console.log(`Sent to ${to}. Resend id ${id}; it shows in the Resend dashboard under Emails.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof DigestSendError && error.cause instanceof Error) console.error(`(${error.cause.message})`);
    process.exitCode = 1;
  })
  .finally(closeDb);
