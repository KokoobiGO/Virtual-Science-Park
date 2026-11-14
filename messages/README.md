# Interface texts: English and Swedish (C19)

Every word the interface itself writes lives in two catalogues:

- `messages/en.json`: English, the default. No cookie means English.
- `messages/sv.json`: Swedish. Exactly the same keys (a test fails on a
  missing or extra key, and a missing key is also a type error).

One top-level key per screen or shared piece (`profile`, `compare`, `layout`,
`dataStatus` ...), nested keys below it. The reader picks the language with
the "English / Svenska" switch in the header; the choice is a cookie
(`vsp_locale`), so there are no `/sv/` addresses and it survives sign-in and
sign-out.

What is never translated: quotes from company pages and call texts (they stay
word for word in their own language), and data from the database (company
names, opportunity titles, the judge's why and next step, source messages).
Only the interface's own words are in the catalogues.

## How it works

| Where | Use |
| --- | --- |
| Server component | `const t = await getT("profile")` or `createTranslator(await getLocale(), "profile")` from `lib/i18n/server.ts` |
| Client component | `const t = useT("profile")` from `lib/i18n/client.tsx` |
| Server action | `const t = await getT("profile")`: the action reads the cookie itself |
| Shared component | takes a `locale` prop, English when left out (`ClaimBadge`, `DataStatusLabel`, `DataStatusPanel` ...) |
| Dates | `formatDay(date, locale)` / `formatDateTime(date, locale)` from `lib/i18n/format.ts`, always Swedish time |

- `t("key")`, `t("key", { name: "X" })` for `{name}`, `t("key", { count: 3 })`
  for a plural entry `{ "one": "...", "other": "..." }` (optional `"zero"`).
- `t.rich("key", { link: (chunk) => <Link ...>{chunk}</Link>, date: <time ...>... </time> })`
  for texts with a link, a `<code>` or a `<time>` inside.
- Numbers go into a text as they are. Where a screen wants "1,234", pass
  `formatNumber(n, locale)` as the value.
- Never call a group of keys `other`: an object with an `other` key is read
  as a plural entry.

**The one rule that matters with Cache Components:** reading the cookie is
request-time data. `getT()` / `getLocale()` may only run inside a
`<Suspense>` boundary (like `getViewer()`), in a server action, or in
`generateMetadata` of a page that has such a boundary. The root layout never
reads it. A page therefore looks like this: the static shell holds a
word-free skeleton (`PageShellSkeleton`), a "frame" component behind
`<Suspense>` reads the locale and renders the heading and intro, and the data
part sits in a second `<Suspense>` with a loading text in the reader's
language. Client components below the frame get the language from
`<LocaleProvider locale={locale}>`; without a provider (an `error.tsx`) the
hook reads the cookie in the browser. `<html lang>` is set from the cookie by
an inline script before the first paint and kept in step by the switch.

## Add a text

1. Add the key to `messages/en.json` with the English text.
2. Add the same key to `messages/sv.json` with the Swedish text (see the
   glossary below). Write å, ä and ö as real letters; write look-alike
   characters such as the Swedish quote mark as escapes (`”`).
3. Use it: `t("yourKey")`. `npm run typecheck` fails on a key that does not
   exist; `npx vitest run lib/i18n` fails when the two files differ.

## Translate one of the remaining screens

1. Add a namespace (`"week": { ... }`) to both catalogues with every text of
   the screen, the English exactly as it is on the screen today (the e2e suite
   selects by these English words).
2. Split the page: `export default` renders `<Suspense fallback={<PageShellSkeleton />}><Frame /></Suspense>`;
   `Frame` reads the locale, renders the heading, wraps client parts in
   `<LocaleProvider>`, and keeps the existing data `<Suspense>` inside it
   with a translated loading label.
3. Replace each string with `t(...)`; pass `locale` to shared components
   (`ClaimBadge`, `DataStatusLabel`) and to date helpers.
4. Turn `export const metadata = { title }` into `generateMetadata()` with
   `getT`.
5. Give the screen's `error.tsx` its texts: add `errors.pages.<screen>` and
   use `<RouteError page="<screen>" back={{ href }} />`.

Before and after, from `app/sources/page.tsx`:

```tsx
// Before
export default function SourcesPage() {
  return (
    <section>
      <h1 className="text-title">Data status</h1>
      <Suspense fallback={<DataStatusPanelSkeleton />}>
        <Sources />
      </Suspense>
    </section>
  );
}

// After
export default function SourcesPage() {
  return (
    <section>
      <Suspense fallback={<PageShellSkeleton />}>
        <SourcesFrame />
      </Suspense>
    </section>
  );
}

async function SourcesFrame() {
  const locale = await getLocale();
  const t = createTranslator(locale, "sources");
  return (
    <>
      <h1 className="text-title">{t("title")}</h1>
      <Suspense fallback={<DataStatusPanelSkeleton locale={locale} />}>
        <Sources locale={locale} />
      </Suspense>
    </>
  );
}
```

## Screens still in English

Translated: the header, menu, footer, start page, sign-in, `/profile` (all
views and the editor), `/profile/<slug>`, `/staff/compare`,
`/staff/ecosystem`, `/staff/handoffs`, `/staff/injection-demo`,
`/staff/checks`, `/sources`, not-found and error pages, and the shared
badges, labels and loading states.

Still to do:

- `/week` (`app/week`, `lib/week`): cards, buttons, date labels.
- `/explore` (`app/explore`, `lib/explore`): filters, list, timeline, map.
  The kind names are already in `common.kinds`.
- `/scout` (`app/scout`, `lib/scout`).
- `/copilot` and the Copilot panel and launcher (`app/copilot`,
  `components/copilot`, `lib/copilot`). The fixed out-of-scope reply is
  checked word for word by the e2e suite.
- `/trust` (`app/trust`, `lib/trust`).
- The weekly digest email (`lib/email`).
- Texts that come from other modules and stay English for now: the check
  names in `lib/*-checks.ts` (they carry model ids) and what the services
  answer, the job statuses Inngest sends, and the recorded injection-demo run.
- `/design` stays in English on purpose.

## Glossary (Swedish)

The reader is addressed as the member company: "ni", "er", "ert" ("Er
vecka", "ert företag"). Only the personal login uses "du" ("Ditt konto",
"ditt lösenord").

| English | Svenska |
| --- | --- |
| potential match | möjlig matchning |
| funding call | utlysning |
| test facility, testbed | testbädd |
| event | evenemang |
| stated | angivet |
| inferred | härlett |
| missing | saknas |
| confirmed / corrected by member | bekräftat / rättat av medlem |
| live | live |
| stale | inaktuell |
| cached copy | sparad kopia |
| hand-entered | inlagt för hand |
| simulated | simulerat |
| evidence | belägg |
| quote | citat |
| source | källa |
| priority | prioritering |
| next step | nästa steg |
| confidence | tillförlitlighet |
| suggested update | föreslagen uppdatering |
| your week | er vecka |
| company profile | företagsprofil |
| explore | utforska |
| trust report | förtroenderapport |
| compare | jämför |
| ecosystem map | ekosystemkarta |
| handoff | överlämning |
| service checks | tjänstekontroller |
| data status | datastatus |
| BSP staff | BSP:s personal (badge: BSP-personal) |
| member | medlem |
| sign in / sign out | logga in / logga ut |
| profiler / judge | profileraren / bedömaren |

Never write that a company is "eligible", "berättigad" or "behörig": the
system only says "möjlig matchning", and the decision stays with people.
