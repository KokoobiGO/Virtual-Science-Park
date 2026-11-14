import { List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { filtersToQuery, type ExploreFilters, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";
import { project, ringPath, type TestbedMap } from "@/lib/explore/map";
import { AREA_LABELS, LAKES, LAND } from "@/lib/explore/sweden-outline";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator, type Translator } from "@/lib/i18n/translate";
import { ItemStatusLabel, MatchNote, NoResults, SourceLink } from "./opportunity-bits";
import { TestbedMapPicker, type PickerPin } from "./testbed-map-picker";

type T = Translator<"explore">;

/**
 * The third view (C15): test facilities as pins on a sketch of southern Sweden. Tag and search apply; the kind is fixed.
 * Words in the reader's language (C19); build `map` with the same locale, so each pin's place line matches.
 */
export function ExploreMap({
  map,
  matches,
  filters,
  locale = DEFAULT_LOCALE,
}: {
  map: TestbedMap;
  matches: Map<string, MatchInfo> | null;
  filters: ExploreFilters;
  locale?: Locale;
}) {
  const t = createTranslator(locale, "explore");
  const shown = map.pins.length + map.unplaced.length;
  const noPlace = map.unplaced.filter((u) => !u.outsideTown);
  const outside = map.unplaced.filter((u) => u.outsideTown);
  const listHref = (item: ExploreItem) =>
    `/explore${filtersToQuery(filters, { view: "list", kind: "testbed", due: null })}#opportunity-${item.id}`;
  const cardFor = (item: ExploreItem, place: { town: string; source: string } | null) => (
    <TestbedCard item={item} match={matches?.get(item.id) ?? null} place={place} listHref={listHref(item)} t={t} />
  );

  const pins: PickerPin[] = map.pins.map((pin) => ({
    id: pin.id,
    title: pin.title,
    town: pin.town,
    verified: pin.verified,
    left: (pin.x / map.width) * 100,
    top: (pin.y / map.height) * 100,
  }));
  const cards = Object.fromEntries(map.pins.map((pin) => [pin.id, cardFor(pin.item, { town: pin.town, source: pin.placeSource })]));

  const facilities =
    shown === map.total ? t("map.facilitiesAll", { total: map.total }) : t("map.facilitiesSome", { shown, total: map.total });
  const placed = map.unplaced.length
    ? t("map.placedAndBelow", { facilities, pins: map.pins.length, below: map.unplaced.length })
    : t("map.placed", { facilities, pins: map.pins.length });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {placed}
        </p>
        <p className="text-muted-foreground">{t("map.notice")}</p>
      </div>

      <h2 className="sr-only">{t("map.heading")}</h2>
      <TestbedMapPicker label={t("map.mapLabel", { count: map.pins.length })} drawing={<SwedenSketch map={map} t={t} />} pins={pins} cards={cards} />

      <Legend t={t} />

      {shown === 0 ? <NoResults filters={filters} filtered={t("map.emptyFiltered")} empty={t("map.empty")} locale={locale} /> : null}

      {noPlace.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="no-location-heading">
          <div className="flex flex-col gap-1">
            <h2 id="no-location-heading" className="text-heading">
              {t("map.noLocationTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("map.noLocationIntro")}</p>
          </div>
          <div className="stagger grid gap-3 md:grid-cols-2">
            {noPlace.map(({ item }) => (
              <div key={item.id}>{cardFor(item, null)}</div>
            ))}
          </div>
        </section>
      ) : null}

      {outside.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="outside-heading">
          <h2 id="outside-heading" className="text-heading">
            {t("map.outsideTitle")}
          </h2>
          <div className="stagger grid gap-3 md:grid-cols-2">
            {outside.map(({ item, outsideTown }) => (
              <div key={item.id}>{cardFor(item, { town: outsideTown!, source: t("map.outsideSource") })}</div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** The outline, the two big lakes, the reference towns and the lines from each spread pin to its town. Decorative: the pins carry the content. */
function SwedenSketch({ map, t }: { map: TestbedMap; t: T }) {
  const { frame } = map;
  return (
    <svg viewBox={`0 0 ${map.width} ${map.height.toFixed(1)}`} className="block h-auto w-full" aria-hidden="true" focusable="false">
      {LAND.map((ring, i) => (
        <path key={i} d={ringPath(frame, ring)} className="fill-card stroke-muted-foreground/60" strokeWidth={1} strokeLinejoin="round" />
      ))}
      {LAKES.map((ring, i) => (
        <path key={i} d={ringPath(frame, ring)} className="fill-info-soft stroke-muted-foreground/40" strokeWidth={0.75} strokeLinejoin="round" />
      ))}
      {AREA_LABELS.map((area) => {
        const at = project(frame, area.at);
        return (
          <text key={area.id} x={at.x} y={at.y} fontSize={12} className="fill-muted-foreground italic">
            {t(`map.areas.${area.id}`)}
          </text>
        );
      })}
      {map.pins.map((pin) =>
        pin.x === pin.anchor.x && pin.y === pin.anchor.y ? null : (
          <line key={pin.id} x1={pin.anchor.x} y1={pin.anchor.y} x2={pin.x} y2={pin.y} className="stroke-muted-foreground" strokeWidth={1} />
        ),
      )}
      {map.towns.map((town) => (
        <g key={town.name}>
          <circle cx={town.x} cy={town.y} r={2.5} className="fill-foreground" />
          <text
            x={town.label.x}
            y={town.label.y}
            textAnchor={town.label.anchor}
            fontSize={13}
            paintOrder="stroke"
            strokeWidth={3}
            strokeLinejoin="round"
            className="fill-foreground stroke-card"
          >
            {town.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Legend({ t }: { t: T }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:gap-6" aria-label={t("map.legendLabel")}>
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-4 shrink-0 rounded-full border-2 border-primary bg-primary" />
        {t("map.legendVerified")}
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-4 shrink-0 rounded-full border-2 border-primary bg-background" />
        {t("map.legendNotVerified")}
      </li>
    </ul>
  );
}

/** A test facility's card: what it is, where it is and why, the member's match note, and links to the source and the list. */
function TestbedCard({
  item,
  match,
  place,
  listHref,
  t,
}: {
  item: ExploreItem;
  match: MatchInfo | null;
  place: { town: string; source: string } | null;
  listHref: string;
  t: T;
}) {
  const verified = item.verified === true;
  const notVerifiedWhy = t("map.notVerifiedWhy");
  return (
    <article className="flex h-full min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-card">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{createTranslator(t.locale, "common")("kinds.testbed")}</Badge>
        <ItemStatusLabel item={item} locale={t.locale} />
        {verified ? null : (
          <Badge variant="muted" title={notVerifiedWhy}>
            {t("map.notVerified")}
          </Badge>
        )}
        <span className="break-words text-muted-foreground">{item.source}</span>
      </div>
      <h3 className="text-base">
        <SourceLink url={item.url} title={item.title} locale={t.locale} />
      </h3>
      {place ? (
        <p className="text-sm break-words">
          <span className="font-medium">{place.town}.</span> <span className="text-muted-foreground">{place.source}</span>
        </p>
      ) : null}
      {item.description ? <p className="line-clamp-4 text-sm break-words text-muted-foreground">{item.description}</p> : null}
      {verified ? null : <p className="text-xs text-muted-foreground">{notVerifiedWhy}</p>}
      {match ? <MatchNote match={match} locale={t.locale} /> : null}
      {/* A plain <a>, not <Link>: a client-side navigation does not set :target, so the row would not be highlighted. */}
      <a href={listHref} className="inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
        <List aria-hidden className="size-4" />
        {t("map.showInList")}
      </a>
    </article>
  );
}
