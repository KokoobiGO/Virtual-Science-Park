/**
 * The matcher's retrieval and score (A15): one SQL statement ranks the
 * opportunity pool for one company and keeps the top 20.
 *
 *   const rows = await rankCompany(getDb(), companyId, "personal");
 *   const rows = await withUserDb(claims, (tx) => rankCompany(tx, claims.companyId, "personal"));
 *
 * It only reads, and only what a signed-in member may read under the policies
 * in drizzle/0002_rls.sql: companies (with every company's PUBLIC embedding)
 * and opportunities (every signed-in user), and the company's own
 * company_private, feedback, saved_items and matches. So a member's own
 * transaction can call it right after an edit and get the new order at once
 * (A18), without waiting for the job to store it. For another company's
 * personal ranking the private row is hidden, and the result is empty.
 *
 * The pool leaves out fixtures, closed funding, past events, news older than
 * 45 days, news whose title names the company itself, items the judge
 * rejected and (personal) items the company marked not relevant.
 *
 * The five parts, each rounded to 3 decimals:
 *   similarity      cosine similarity to the company's embedding (personal:
 *                   company_private.personal_embedding, public:
 *                   companies.public_embedding), minus the opportunity's
 *                   average similarity to every company's public embedding
 *                   (so an item close to everyone gains nothing), then
 *                   rescaled to 0..1 inside this company's pool:
 *                   (adj - min) / (max - min)
 *   tagOverlap      shared tags / all distinct tags of the two (Jaccard)
 *   priorityBoost   personal only: the rescaled similarity when the kind
 *                   answers a switched-on priority, else 0 (a priority lifts
 *                   its kind in proportion to fit)
 *   urgency         1 - days / 60 for a deadline or event date in the next 60 days
 *   feedback        personal only: 1 for an item the company marked useful or
 *                   saved, else the average of sign x tag Jaccard over its
 *                   feedback on other items (useful, saved +1; not relevant -1)
 * The score is the weighted sum (SCORE_WEIGHTS, passed in as parameters),
 * clamped to 0..1 and rounded to 3 decimals, the same as combineScore().
 *
 * Public mode never reads company_private, feedback or saved_items: those two
 * parts are 0 there.
 */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import type { UserTx } from "../db/user";
import { SCORE_WEIGHTS, type MatchMode } from "../schemas";
import {
  FIXTURE_PREFIX,
  NEWS_MAX_AGE_DAYS,
  PRIORITY_KINDS,
  TOP_N,
  URGENCY_DAYS,
  toRankedMatch,
  type RankedMatch,
  type RankingRow,
} from "./score";

/** The service client, a transaction on it, or a member's own transaction from withUserDb. */
export type Executor = Db | UserTx;

export type RankOptions = {
  /** The moment the pool and urgency are judged at. Default: now. */
  now?: Date;
  /** Rows to return. Default: TOP_N (20). */
  limit?: number;
};

const float = (value: number) => sql`${value}::float8`;

/** Rounds to 3 decimals the way combineScore does (Math.round(x * 1000) / 1000), in float8. */
const round3 = (value: SQL) => sql`(floor((${value}) * 1000 + 0.5) / 1000)`;

/** Shared tags / all distinct tags of the two arrays; 0 when either is empty. */
const jaccard = (a: SQL, b: SQL) => sql`coalesce(
      cardinality(array(select unnest(${a}) intersect select unnest(${b})))::float8
        / nullif(cardinality(array(select unnest(${a}) union select unnest(${b}))), 0),
      0)`;

/** The ranking statement. Exported so the tests can read the SQL it builds. */
export function rankingQuery(companyId: string, mode: MatchMode, { now = new Date(), limit = TOP_N }: RankOptions = {}): SQL {
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`limit must be a positive whole number, got ${limit}.`);
  const personal = mode === "personal";
  const company = sql`${companyId}::uuid`;

  // The company: its tags, the embedding for this mode and, in personal mode,
  // the kinds its switched-on priorities boost.
  const me = personal
    ? sql`select c.id, c.name, c.tags, cp.personal_embedding as embedding, ${now.toISOString()}::timestamptz as now,
          array(
            select pk.kind
            from (values ${sql.join(
              Object.entries(PRIORITY_KINDS).map(([priority, kind]) => sql`(${priority}::text, ${kind}::text)`),
              sql`, `,
            )}) as pk(priority, kind)
            where pk.priority = any(cp.user_priorities)
          ) as boost_kinds
        from companies c
        join company_private cp on cp.company_id = c.id
        where c.id = ${company} and cp.personal_embedding is not null`
    : sql`select c.id, c.name, c.tags, c.public_embedding as embedding, ${now.toISOString()}::timestamptz as now
        from companies c
        where c.id = ${company} and c.public_embedding is not null`;

  // Personal mode only: the company's own feedback and saved items, as signs.
  const signals = personal
    ? sql`, signals as (
        select f.opportunity_id, (case when f.kind = 'not_relevant' then -1 else 1 end)::float8 as sign, o.tags
        from feedback f
        join opportunities o on o.id = f.opportunity_id
        where f.company_id = ${company}
        union all
        select s.opportunity_id, 1::float8 as sign, o.tags
        from saved_items s
        join opportunities o on o.id = s.opportunity_id
        where s.company_id = ${company}
      )`
    : sql``;

  const notDismissed = personal
    ? sql`and not exists (select 1 from signals s where s.opportunity_id = o.id and s.sign < 0)`
    : sql``;

  const priorityBoost = personal ? sql`(case when p.kind::text = any(me.boost_kinds) then p.similarity else 0 end)::float8` : sql`0::float8`;

  const feedback = personal
    ? round3(sql`case
          when exists (select 1 from signals s where s.opportunity_id = p.id and s.sign > 0) then 1
          else coalesce((select avg(s.sign * ${jaccard(sql`s.tags`, sql`p.tags`)}) from signals s where s.opportunity_id <> p.id), 0)
        end`)
    : sql`0::float8`;

  const urgencyDays = sql`${URGENCY_DAYS}::int`;

  return sql`
    with me as (${me})
    ${signals},
    -- The mean of every company's normalised PUBLIC embedding. An opportunity's
    -- dot product with it is its average cosine similarity to all companies,
    -- in one step instead of one per company.
    centre as (
      select avg(l2_normalize(public_embedding)) as v from companies where public_embedding is not null
    ),
    pool as (
      select o.id, o.kind, o.tags,
        1 - (o.embedding <=> me.embedding) as sim,
        -- How close the opportunity is to companies in general.
        -(l2_normalize(o.embedding) <#> centre.v) as typical,
        -- The nearest date still ahead: a deadline or an event date.
        least(
          case when o.deadline >= me.now then o.deadline end,
          case when o.event_date >= me.now then o.event_date end
        ) as due
      from me
      cross join centre
      join opportunities o on o.embedding is not null
      where o.external_id not like ${`${FIXTURE_PREFIX}%`}
        and (o.kind <> 'funding' or o.deadline is null or o.deadline >= me.now)
        and (o.kind <> 'event' or o.event_date is null or o.event_date >= me.now)
        and (o.kind <> 'news' or o.published_at is null or o.published_at >= me.now - make_interval(days => ${NEWS_MAX_AGE_DAYS}::int))
        -- News about the company itself is not an opportunity for it.
        and (o.kind <> 'news' or strpos(lower(o.title), lower(me.name)) = 0)
        and not exists (
          select 1 from matches m
          where m.company_id = me.id and m.opportunity_id = o.id and m.mode = ${mode}::match_mode and m.rejected
        )
        ${notDismissed}
    ),
    bounds as (select min(sim - typical) as lo, max(sim - typical) as hi from pool),
    fit as (
      select p.*, ${round3(sql`coalesce((p.sim - p.typical - b.lo) / nullif(b.hi - b.lo, 0), 1)`)} as similarity
      from pool p
      cross join bounds b
    ),
    parts as (
      select p.id, p.sim, p.similarity,
        ${round3(jaccard(sql`me.tags`, sql`p.tags`))} as tag_overlap,
        ${priorityBoost} as priority_boost,
        ${round3(sql`case
            when p.due < me.now + make_interval(days => ${urgencyDays})
              then 1 - extract(epoch from (p.due - me.now))::float8 / 86400 / ${urgencyDays}
            else 0
          end`)} as urgency,
        ${feedback} as feedback_score,
        array(select t from unnest(p.tags) as t where t = any(me.tags) order by t) as matched_on
      from fit p
      cross join me
    ),
    scored as (
      select parts.*,
        ${round3(sql`least(1, greatest(0,
          ${float(SCORE_WEIGHTS.similarity)} * similarity
          + ${float(SCORE_WEIGHTS.tagOverlap)} * tag_overlap
          + ${float(SCORE_WEIGHTS.priorityBoost)} * priority_boost
          + ${float(SCORE_WEIGHTS.urgency)} * urgency
          + ${float(SCORE_WEIGHTS.feedback)} * feedback_score
        ))`)} as score
      from parts
    )
    select id as opportunity_id,
      (row_number() over (order by score desc, sim desc, id))::int as rank,
      score, similarity, tag_overlap, priority_boost, urgency, feedback_score, matched_on
    from scored
    order by rank
    limit ${limit}::int`;
}

/**
 * The ranked top `limit` (default 20) for one company and mode. Empty when the
 * company has no embedding for the mode, or when the caller may not read the
 * company's private row (personal mode under RLS).
 */
export async function rankCompany(db: Executor, companyId: string, mode: MatchMode, options: RankOptions = {}): Promise<RankedMatch[]> {
  const rows = await db.execute<RankingRow>(rankingQuery(companyId, mode, options));
  return Array.from(rows, (row) => toRankedMatch(row, mode));
}
