/**
 * Scout's keyword fallback (B1): what a store search ranks by when Voyage
 * does not answer. Voyage's free tier allows 3 requests a minute, so from
 * about the fourth search of a run the store is searched by keywords, and
 * English words rarely hit Swedish call titles (Energimyndigheten, Vinnova).
 *
 * - A small bilingual term map for the park's domain: a query word in either
 *   language stands for the whole concept, e.g. "grid" also finds "elnät" and
 *   "kraftnät", and carries the concept's opportunity tag.
 * - Swedish-aware normalisation: å, ä and ö are kept; simple plural and
 *   definite endings are stripped ("sensorerna" -> "sensor", "elnätet" ->
 *   "elnät", "testbäddar" -> "testbädd", "batteries" -> "batter").
 * - A stem matches anywhere in a word, so Swedish compounds hit too
 *   ("cybersäkerhet", "undervattenssensorer"); stems of three letters or
 *   fewer ("ai", "sea", "5g") must be a whole word.
 *
 * Ranking happens here, in code, not in SQL: the open pool is a few hundred
 * rows, and this way Postgres' locale cannot change how å, ä and ö compare.
 * No Voyage or model call.
 */
import type { OpportunityTag } from "../schemas";

/** One concept of the term map: words in English and Swedish, and the opportunity tag it stands for. */
export type DomainConcept = {
  key: string;
  words: readonly string[];
  tag?: OpportunityTag;
  /** Words nearly every opportunity has (funding, call, test facility): they only break ties. */
  generic?: boolean;
};

/** The term map. Words are normalised and stemmed when the index is built, so list the plain forms. */
export const DOMAIN_CONCEPTS: readonly DomainConcept[] = [
  { key: "grid", words: ["grid", "power grid", "smart grid", "elnät", "kraftnät", "stamnät", "elsystem"], tag: "energy" },
  {
    key: "electricity",
    words: ["electricity", "electric", "electrical", "elektricitet", "elektrisk", "elektrifiering", "elkraft", "elmarknad", "elförsörjning"],
    tag: "energy",
  },
  { key: "energy", words: ["energy", "energi"], tag: "energy" },
  { key: "battery", words: ["battery", "batteri", "energy storage", "energilagring"], tag: "energy" },
  { key: "wind", words: ["wind", "wind power", "vindkraft"], tag: "energy" },
  { key: "hydrogen", words: ["hydrogen", "vätgas"], tag: "energy" },
  // Not "detector": its stem "detect" also hits every "detection" call.
  { key: "sensor", words: ["sensor", "givare"], tag: "sensor" },
  { key: "underwater", words: ["underwater", "under water", "subsea", "undervatten", "under vatten"], tag: "marine" },
  { key: "marine", words: ["marine", "marin", "maritime", "maritim", "ocean", "sea", "naval", "offshore", "havs", "havet", "sjöfart", "shipping"], tag: "marine" },
  {
    key: "cyber security",
    words: ["cyber security", "cybersecurity", "cyber", "cybersäkerhet", "information security", "informationssäkerhet", "it säkerhet"],
    tag: "cyber",
  },
  { key: "defence", words: ["defence", "defense", "military", "dual use", "försvar", "militär"], tag: "defence" },
  { key: "ai", words: ["ai", "artificial intelligence", "machine learning", "artificiell intelligens", "maskininlärning"], tag: "ai" },
  { key: "safety", words: ["safe", "safer", "safety", "secure", "security", "säker", "säkerhet", "trygg", "trygghet"] },
  { key: "resilience", words: ["resilience", "resilient", "resiliens", "motståndskraft"] },
  { key: "autonomous", words: ["autonomous", "unmanned", "drone", "autonom", "obemannad", "drönare"] },
  { key: "monitoring", words: ["monitoring", "surveillance", "övervakning"] },
  { key: "communication", words: ["communication", "telecom", "connectivity", "5g", "kommunikation", "uppkoppling"] },
  { key: "industry", words: ["industry", "industrial", "industri", "industriell", "manufacturing", "tillverkning"] },
  { key: "electronics", words: ["electronic", "electronics", "elektronik"] },
  { key: "semiconductor", words: ["semiconductor", "chip", "halvledare", "halvledar"] },
  { key: "efficiency", words: ["efficiency", "efficient", "effektiv", "energieffektiv"] },
  { key: "building", words: ["building", "construction", "bygg", "byggnad", "bebyggelse", "fastighet"] },
  { key: "funding", words: ["funding", "fund", "financing", "finance", "grant", "finansiering", "stöd", "bidrag"], generic: true },
  { key: "call", words: ["call", "utlysning"], generic: true },
  {
    key: "test facility",
    words: ["test facility", "test facilities", "testbed", "test bed", "testbädd", "testanläggning", "testmiljö", "test environment"],
    generic: true,
  },
];

/**
 * Left out: function words in both languages, and words nearly every
 * opportunity has ("technology", "innovation"), which on 2026-11-14 ranked
 * battery calls first for "funding for safer electricity grid technology".
 * Words of the term map are looked up before this list, so "funding" and
 * "utlysning" still count as generic concepts.
 */
const STOP_WORDS = new Set(
  [
    "a an and are as at be by can could do does for from get has have how in into is it its of on or our that the their them there these they this those to us use using was we what when where which who will with would you your about any based like such more most other own",
    "och att det som för med på av till är en ett vilka vilken vilket hur kan vi vår våra oss om eller inte från under över mellan inom ska skulle nästa år ny nya hitta hjälp vill finns någon några alla mer mest också samt",
    "test tests testing facility facilities technology technologies tech innovation innovative sweden swedish event events project projects programme program support opportunity opportunities find help want next year fit new open opens close closes closing soon month months week weeks",
    "teknik teknologi innovation innovationer projekt program sverige svensk svenska möjlighet möjligheter öppen öppna stänger snart månad veckan",
  ]
    .join(" ")
    .split(" "),
);

/** Lower case, composed å/ä/ö, and every run of other characters as one space. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const VOWEL = /[aeiouyåäö]/;

/** Endings stripped from a word, longest first; `min` is the shortest stem that may remain. */
const ENDINGS: { end: string; min: number; when?: (stem: string) => boolean }[] = [
  ...["arnas", "ernas", "ornas", "arna", "erna", "orna"].map((end) => ({ end, min: 4 })),
  { end: "ies", min: 5 },
  ...["ens", "ets", "ar", "er", "or", "en", "et", "es"].map((end) => ({ end, min: 5 })),
  // Swedish definite after a vowel: "energin", "sjön".
  { end: "n", min: 5, when: (stem) => VOWEL.test(stem.at(-1) ?? "") },
  { end: "s", min: 4 },
  // "energy" and "energi" meet at "energ"; "battery" and "batteri" at "batter".
  { end: "y", min: 5 },
  { end: "i", min: 5 },
];

function stripOnce(word: string): string {
  for (const { end, min, when } of ENDINGS) {
    if (!word.endsWith(end)) continue;
    const stem = word.slice(0, -end.length);
    if (stem.length >= min && (!when || when(stem))) return stem;
  }
  return word;
}

/**
 * The stem of one normalised word: simple Swedish plural and definite endings
 * and English plurals stripped, at most twice ("batterier" -> "batteri" ->
 * "batter"). The stem is always the start of the word, so it still finds it.
 */
export function stemWord(word: string): string {
  return stripOnce(stripOnce(word));
}

/** How a text is searched: normalised, with spaces around it, so a whole word is " word ". */
export function searchableText(text: string): string {
  return ` ${normalizeText(text)} `;
}

/**
 * Whether a stem or phrase occurs in a searchable text. Four letters or more:
 * anywhere, so compounds and endings match. Shorter: as a whole word, or with
 * an "s" ("sea", "seas"), so "ai" does not match "air".
 */
export function textHas(searchable: string, term: string): boolean {
  if (term.length >= 4) return searchable.includes(term);
  return searchable.includes(` ${term} `) || searchable.includes(` ${term}s `);
}

/** One thing the query asks about: the concept's stems and phrases, or a single word's stem. */
export type PlanConcept = {
  key: string;
  /** Normalised stems and phrases; any one of them matching counts. */
  terms: string[];
  /** From the term map. Plain query words count half. */
  domain: boolean;
  generic: boolean;
};

export type KeywordPlan = { concepts: PlanConcept[]; tags: OpportunityTag[] };

/** Concepts per query, at most. */
export const MAX_CONCEPTS = 10;

type IndexedConcept = { concept: DomainConcept; terms: string[] };

function buildIndex(concepts: readonly DomainConcept[]) {
  const byWord = new Map<string, IndexedConcept>();
  const phrases: { phrase: string; entry: IndexedConcept }[] = [];
  for (const concept of concepts) {
    const terms = new Set<string>();
    const entry: IndexedConcept = { concept, terms: [] };
    for (const word of concept.words) {
      const normal = normalizeText(word);
      if (normal.includes(" ")) {
        terms.add(normal);
        phrases.push({ phrase: normal, entry });
      } else {
        const stem = stemWord(normal);
        terms.add(stem);
        byWord.set(normal, entry);
        byWord.set(stem, entry);
      }
    }
    entry.terms = [...terms];
  }
  // Longest phrase first, so "cyber security" wins over "security".
  phrases.sort((a, b) => b.phrase.length - a.phrase.length);
  return { byWord, phrases };
}

const INDEX = buildIndex(DOMAIN_CONCEPTS);

/**
 * What a query asks about. Phrases of the term map are found first ("cyber
 * security", "test facility"), then each word: a word of the term map stands
 * for its concept, a stop word is left out, any other word of three letters
 * or more counts on its own by its stem. Bare numbers (years) are left out.
 */
export function keywordPlan(query: string): KeywordPlan {
  let text = ` ${normalizeText(query)} `;
  const found: IndexedConcept[] = [];
  const add = (entry: IndexedConcept) => {
    if (!found.includes(entry)) found.push(entry);
  };
  for (const { phrase, entry } of INDEX.phrases) {
    if (!text.includes(` ${phrase} `)) continue;
    add(entry);
    text = text.split(` ${phrase} `).join(" ");
  }

  const concepts: PlanConcept[] = [];
  const plain = new Set<string>();
  for (const word of text.split(" ").filter(Boolean)) {
    const entry = INDEX.byWord.get(word) ?? INDEX.byWord.get(stemWord(word));
    if (entry) add(entry);
    else if (word.length >= 3 && !STOP_WORDS.has(word) && !/^\p{N}+$/u.test(word)) plain.add(stemWord(word));
  }

  for (const { concept, terms } of found) concepts.push({ key: concept.key, terms, domain: true, generic: concept.generic ?? false });
  for (const stem of plain) {
    if (!concepts.some((c) => c.terms.includes(stem))) concepts.push({ key: stem, terms: [stem], domain: false, generic: false });
  }
  // Specific concepts first, so the cap never drops one for a generic word.
  const kept = [...concepts.filter((c) => !c.generic), ...concepts.filter((c) => c.generic)].slice(0, MAX_CONCEPTS);
  const tags = [...new Set(found.filter((f) => kept.some((c) => c.key === f.concept.key)).flatMap((f) => (f.concept.tag ? [f.concept.tag] : [])))];
  return { concepts: kept, tags };
}

/** The words a query is searched by, for the progress line and tests. */
export function keywordTerms(query: string): string[] {
  return keywordPlan(query).concepts.map((c) => c.key);
}

/** True when the plan has something to match besides generic words. */
export function hasSpecific(plan: KeywordPlan): boolean {
  return plan.tags.length > 0 || plan.concepts.some((c) => !c.generic);
}

/** Text of a description that is scored: long EU texts would otherwise match nearly any word. */
export const SCORED_DESCRIPTION_CHARS = 4000;

/** Points per match. A domain concept counts double a plain word; a match in the title adds half again. */
export const KEYWORD_WEIGHTS = { domain: 1, plain: 0.5, titleFactor: 2, tag: 0.5, generic: 0.1 } as const;

export type KeywordRow = { title: string; description: string | null; tags: string[] };

export type KeywordScore = {
  /** Domain concepts, plain words and tags: what the query is about. */
  specific: number;
  /** Specific plus generic words. */
  total: number;
};

/** How well one opportunity fits the plan. */
export function keywordScore(row: KeywordRow, plan: KeywordPlan): KeywordScore {
  const title = searchableText(row.title);
  const body = searchableText((row.description ?? "").slice(0, SCORED_DESCRIPTION_CHARS));
  let specific = 0;
  let generic = 0;
  for (const concept of plan.concepts) {
    const inTitle = concept.terms.some((t) => textHas(title, t));
    const inBody = inTitle || concept.terms.some((t) => textHas(body, t));
    if (!inBody) continue;
    if (concept.generic) {
      generic += KEYWORD_WEIGHTS.generic;
      continue;
    }
    const points = concept.domain ? KEYWORD_WEIGHTS.domain : KEYWORD_WEIGHTS.plain;
    specific += inTitle ? points * KEYWORD_WEIGHTS.titleFactor : points;
  }
  for (const tag of plan.tags) if (row.tags.includes(tag)) specific += KEYWORD_WEIGHTS.tag;
  return { specific, total: specific + generic };
}

/**
 * The best `limit` rows for the plan: rows that match what the query is about,
 * most points first, ties by closeness to the asking company. With `fill`,
 * fewer matches are filled up with the rows closest to the company. A plan
 * with only generic words ranks by them and closeness, and only with `fill`.
 */
export function rankByKeywords<T extends KeywordRow & { closeness: number }>(rows: T[], plan: KeywordPlan, options: { limit: number; fill: boolean }): T[] {
  const scored = rows.map((row) => ({ row, score: keywordScore(row, plan) }));
  const byScore = (a: (typeof scored)[number], b: (typeof scored)[number]) => b.score.total - a.score.total || b.row.closeness - a.row.closeness;
  if (!hasSpecific(plan)) return options.fill ? scored.sort(byScore).slice(0, options.limit).map((s) => s.row) : [];
  const matched = scored.filter((s) => s.score.specific > 0).sort(byScore);
  const picked = matched.slice(0, options.limit).map((s) => s.row);
  if (options.fill && picked.length < options.limit) {
    const rest = scored.filter((s) => s.score.specific <= 0).sort((a, b) => b.row.closeness - a.row.closeness);
    picked.push(...rest.slice(0, options.limit - picked.length).map((s) => s.row));
  }
  return picked;
}
