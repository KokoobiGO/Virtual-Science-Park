/**
 * Paper for the staff session (D7): rating sheets built from the database,
 * written as Markdown to data/staff-session/ for printing.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/session-sheets.ts
 *
 * - claims-<slug>.md, one per gold member: every ACTIVE, PUBLIC claim with
 *   its status, its quotes in the page's own language and their source, and
 *   boxes for right / wrong / unsure. Private claims are never read.
 * - top5-<slug>.md, one per gold member: the first five rows of the PUBLIC
 *   ranking (ranked, not rejected, by rank) with the judge's why and next
 *   step, and boxes for relevant / not relevant.
 * - think-aloud.md: neutral questions for staff using the Your-week screen.
 *
 * Reads the database; writes only the files, and replaces the ones there.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { claims, companies, evidence, matches, opportunities } from "../lib/db/schema";
import { FIELD_LABELS } from "../lib/embeddings/text";
import { ProfileField, type ClaimStatus, type OpportunityKind, type QuoteLang } from "../lib/schemas";

const OUT_DIR = path.join("data", "staff-session");
const TOP = 5;

const STATUS_TEXT: Record<ClaimStatus, string> = {
  stated: "stated (the page says it)",
  inferred: "inferred (read from the page, not said outright)",
  missing: "missing (not found on the public pages)",
  user_confirmed: "confirmed by the member",
  user_corrected: "corrected by the member",
};

const KIND_TEXT: Record<OpportunityKind, string> = { funding: "Funding call", testbed: "Testbed", event: "Event", news: "News" };
const LANG_TEXT: Record<QuoteLang, string> = { sv: "Swedish", en: "English", other: "original language" };

const LINE = "____________________";
const NOTES = "Notes: ______________________________________________________________";

const swedishDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" });
const longDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric" });
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function header(title: string, generated: string, howTo: string): string[] {
  return [
    `# ${title}`,
    "",
    `Staff session rating sheet. Generated ${generated} from the database by \`scripts/session-sheets.ts\`.`,
    "",
    `Rated by: ${LINE}  Date: ${LINE}`,
    "",
    howTo,
    "",
  ];
}

type SheetCompany = { id: string; slug: string; name: string; website: string | null };

async function claimsSheet(company: SheetCompany, generated: string): Promise<{ text: string; count: number }> {
  const db = getDb();
  const rows = await db
    .select({ id: claims.id, field: claims.field, status: claims.status, value: claims.value })
    .from(claims)
    .where(and(eq(claims.companyId, company.id), eq(claims.reviewState, "active"), eq(claims.visibility, "public")));
  const quotes = rows.length
    ? await db
        .select({ claimId: evidence.claimId, quote: evidence.quote, quoteLang: evidence.quoteLang, url: evidence.url })
        .from(evidence)
        .where(inArray(evidence.claimId, rows.map((r) => r.id)))
        .orderBy(asc(evidence.url), asc(evidence.quote))
    : [];
  const order = (field: ProfileField) => ProfileField.options.indexOf(field);
  rows.sort((a, b) => order(a.field) - order(b.field));

  const out = header(
    `Profile claims: ${company.name}`,
    generated,
    'How to rate: read each claim and its quote, open the source when you need to, and tick one box. "Right" means the quote supports the value. For a "missing" claim, "right" means the company\'s public pages really do not say it. Only public claims are on this sheet: private data is never printed.',
  );
  out.push(`Company: ${company.name}. Website: ${company.website ?? "none listed"}. Public claims: ${rows.length}.`, "");

  rows.forEach((row, i) => {
    out.push("---", "", `## ${i + 1}. ${FIELD_LABELS[row.field]}`, "");
    if (row.value === null) out.push("- **Value:** none");
    else if (typeof row.value === "string") out.push(`- **Value:** ${oneLine(row.value)}`);
    else out.push("- **Value:**", ...row.value.map((item) => `  - ${oneLine(item)}`));
    out.push(`- **Status:** ${STATUS_TEXT[row.status]}`, "");
    const own = quotes.filter((q) => q.claimId === row.id);
    if (!own.length) out.push(row.status === "missing" ? "No quote: nothing on the pages supported this field." : "No quote stored.", "");
    for (const q of own) out.push(`Quote (${LANG_TEXT[q.quoteLang]}):`, "", `> ${oneLine(q.quote)}`, "", `Source: ${q.url}`, "");
    out.push("[ ] right    [ ] wrong    [ ] unsure", "", NOTES, "");
  });
  return { text: `${out.join("\n").trimEnd()}\n`, count: rows.length };
}

async function top5Sheet(company: SheetCompany, generated: string): Promise<{ text: string; count: number }> {
  const rows = await getDb()
    .select({
      why: matches.why,
      nextStep: matches.nextStep,
      title: opportunities.title,
      kind: opportunities.kind,
      source: opportunities.source,
      url: opportunities.url,
      opensAt: opportunities.opensAt,
      deadline: opportunities.deadline,
      eventDate: opportunities.eventDate,
      simulated: opportunities.simulated,
    })
    .from(matches)
    .innerJoin(opportunities, eq(opportunities.id, matches.opportunityId))
    .where(and(eq(matches.companyId, company.id), eq(matches.mode, "public"), isNotNull(matches.rank), eq(matches.rejected, false)))
    .orderBy(asc(matches.rank))
    .limit(TOP);

  const out = header(
    `Top ${TOP} public matches: ${company.name}`,
    generated,
    "How to rate: would this be worth this company's time this week? Tick one box and say why in the notes. These are the first rows of the public ranking, built from public data only (never the member's private priorities or feedback). Each one is a potential match, not a decision about who may apply.",
  );
  if (rows.length < TOP) out.push(`Only ${rows.length} ranked rows that the judge did not reject.`, "");

  const now = new Date();
  rows.forEach((row, i) => {
    // A call that has not opened yet says so: the ranking keeps such calls in the pool.
    const opens = row.opensAt && row.opensAt > now ? [`- **Opens:** ${longDay.format(row.opensAt)} (not open yet)`] : [];
    const date = row.deadline
      ? `- **Deadline:** ${longDay.format(row.deadline)}`
      : row.eventDate
        ? `- **Event date:** ${longDay.format(row.eventDate)}`
        : null;
    out.push(
      "---",
      "",
      `## ${i + 1}. ${oneLine(row.title)}`,
      "",
      `- **Kind:** ${KIND_TEXT[row.kind]}, from ${row.source}${row.simulated ? " (entered by hand by the team)" : ""}`,
      `- **Link:** ${row.url}`,
      ...opens,
      ...(date ? [date] : []),
      `- **Why it fits:** ${row.why ? oneLine(row.why) : "not judged yet"}`,
      `- **Next step:** ${row.nextStep ? oneLine(row.nextStep) : "not judged yet"}`,
      "",
      "[ ] relevant    [ ] not relevant",
      "",
      NOTES,
      "",
    );
  });
  return { text: `${out.join("\n").trimEnd()}\n`, count: rows.length };
}

const THINK_ALOUD_QUESTIONS = [
  "Please look at this screen and tell me what you see.",
  "What do you think this page is for?",
  "Pick any one card. In your own words, what is it telling you?",
  "What would you do next with that card, if anything?",
  "Before you passed a card like this on to a member, what would you want to check, and how would you check it?",
  "Is there anything you expected to find on this screen that you did not find?",
  "What, if anything, was unclear or surprising?",
  "Is there anything else you would like to say about this screen?",
];

function thinkAloudSheet(generated: string): string {
  const out = header(
    "Think-aloud questions: the Your-week screen",
    generated,
    "For the facilitator. Ask the person to say out loud what they look at and what they think while they use the screen. Do not explain the screen and do not answer questions about it during the task: write the question down instead. When they go quiet, ask: \"What are you thinking now?\"",
  );
  out.push(
    "Setup: the Your-week screen belongs to a member company, and staff accounts have none. Sign in with a member demo account (for example `embeddedart@demo.vsp.test`) before the session.",
    "",
    "Ask the questions in this order. Read them as written.",
    "",
  );
  THINK_ALOUD_QUESTIONS.forEach((question, i) => out.push(`${i + 1}. ${question}`, "", `   ${NOTES}`, ""));
  out.push(
    "---",
    "",
    "## Exact quotes",
    "",
    'Write the person\'s words exactly as said. Before anyone uses a quote outside the team, ask: "May we quote you on this, without your name?" and tick the answer.',
    "",
  );
  for (let i = 1; i <= 4; i++) out.push(`${i}. "______________________________________________________________"`, "", "   Permission to quote: [ ] yes    [ ] no", "");
  return `${out.join("\n").trimEnd()}\n`;
}

async function main() {
  const generated = swedishDay.format(new Date());
  const gold = await getDb()
    .select({ id: companies.id, slug: companies.slug, name: companies.name, website: companies.website })
    .from(companies)
    .where(eq(companies.isGold, true))
    .orderBy(asc(companies.slug));
  if (!gold.length) throw new Error("No gold members (companies.is_gold) in the database.");

  mkdirSync(OUT_DIR, { recursive: true });
  const write = (name: string, text: string) => {
    const filePath = path.join(OUT_DIR, name);
    writeFileSync(filePath, text, "utf8");
    return filePath.replaceAll("\\", "/");
  };

  for (const company of gold) {
    const c = await claimsSheet(company, generated);
    console.log(`${write(`claims-${company.slug}.md`, c.text)}  ${c.count} public claims`);
    const t = await top5Sheet(company, generated);
    console.log(`${write(`top5-${company.slug}.md`, t.text)}  ${t.count} matches`);
  }
  console.log(`${write("think-aloud.md", thinkAloudSheet(generated))}  ${THINK_ALOUD_QUESTIONS.length} questions`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
