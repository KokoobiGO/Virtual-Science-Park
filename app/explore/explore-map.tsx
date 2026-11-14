import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { filtersToQuery, type ExploreFilters, type ExploreItem, type MatchInfo } from "@/lib/explore/filter";
import { project, ringPath, type TestbedMap } from "@/lib/explore/map";
import { AREA_LABELS, LAKES, LAND } from "@/lib/explore/sweden-outline";
import { ItemStatusLabel, MatchNote, NoResults, SourceLink } from "./opportunity-bits";
import { TestbedMapPicker, type PickerPin } from "./testbed-map-picker";

/** The third view (C15): test facilities as pins on a sketch of southern Sweden. Tag and search apply; the kind is fixed. */
export function ExploreMap({ map, matches, filters }: { map: TestbedMap; matches: Map<string, MatchInfo> | null; filters: ExploreFilters }) {
  const shown = map.pins.length + map.unplaced.length;
  const noPlace = map.unplaced.filter((u) => !u.outsideTown);
  const outside = map.unplaced.filter((u) => u.outsideTown);
  const listHref = (item: ExploreItem) =>
    `/explore${filtersToQuery(filters, { view: "list", kind: "testbed", due: null })}#opportunity-${item.id}`;
  const cardFor = (item: ExploreItem, place: { town: string; source: string } | null) => (
    <TestbedCard item={item} match={matches?.get(item.id) ?? null} place={place} listHref={listHref(item)} />
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {shown === map.total ? `All ${map.total} test facilities` : `${shown} of ${map.total} test facilities`}: {map.pins.length} on the map
          {map.unplaced.length ? `, ${map.unplaced.length} listed below it` : ""}.
        </p>
        <p className="text-muted-foreground">
          A locator sketch, not a survey map: the outline is simplified and each pin sits on its town, with pins in the same town spread
          around it.
        </p>
      </div>

      <h2 className="sr-only">Test facilities on the map</h2>
      <TestbedMapPicker
        label={`Sketch map of southern Sweden with ${map.pins.length} test ${map.pins.length === 1 ? "facility" : "facilities"}`}
        drawing={<SwedenSketch map={map} />}
        pins={pins}
        cards={cards}
      />

      <Legend />

      {shown === 0 ? (
        <NoResults
          filters={filters}
          filtered="No test facility fits these filters."
          empty="No test facilities are stored yet. They appear here once BSP staff have added them."
        />
      ) : null}

      {noPlace.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="no-location-heading">
          <div className="flex flex-col gap-1">
            <h2 id="no-location-heading" className="text-heading">
              Location not stored
            </h2>
            <p className="text-sm text-muted-foreground">The stored text for these does not say where they are, so they have no pin.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {noPlace.map(({ item }) => (
              <div key={item.id}>{cardFor(item, null)}</div>
            ))}
          </div>
        </section>
      ) : null}

      {outside.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="outside-heading">
          <h2 id="outside-heading" className="text-heading">
            Outside the area drawn
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {outside.map(({ item, outsideTown }) => (
              <div key={item.id}>{cardFor(item, { town: outsideTown!, source: "Outside the area this sketch covers." })}</div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** The outline, the two big lakes, the reference towns and the lines from each spread pin to its town. Decorative: the pins carry the content. */
function SwedenSketch({ map }: { map: TestbedMap }) {
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
          <text key={area.text} x={at.x} y={at.y} fontSize={12} className="fill-muted-foreground italic">
            {area.text}
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

function Legend() {
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:gap-6" aria-label="Pin key">
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-4 shrink-0 rounded-full border-2 border-primary bg-primary" />
        Verified: an official page confirms it and that outside companies can use it.
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-4 shrink-0 rounded-full border-2 border-primary bg-background" />
        Not verified.
      </li>
    </ul>
  );
}

const NOT_VERIFIED = "Not verified: no official page has been found yet that confirms outside companies can use it.";

/** A test facility's card: what it is, where it is and why, the member's match note, and links to the source and the list. */
function TestbedCard({
  item,
  match,
  place,
  listHref,
}: {
  item: ExploreItem;
  match: MatchInfo | null;
  place: { town: string; source: string } | null;
  listHref: string;
}) {
  const verified = item.verified === true;
  return (
    <article className="flex h-full min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-card">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">Test facility</Badge>
        <ItemStatusLabel item={item} />
        {verified ? null : (
          <Badge variant="muted" title={NOT_VERIFIED}>
            Not verified
          </Badge>
        )}
        <span className="break-words text-muted-foreground">{item.source}</span>
      </div>
      <h3 className="text-base">
        <SourceLink url={item.url} title={item.title} />
      </h3>
      {place ? (
        <p className="text-sm break-words">
          <span className="font-medium">{place.town}.</span> <span className="text-muted-foreground">{place.source}</span>
        </p>
      ) : null}
      {item.description ? <p className="line-clamp-4 text-sm break-words text-muted-foreground">{item.description}</p> : null}
      {verified ? null : <p className="text-xs text-muted-foreground">{NOT_VERIFIED}</p>}
      {match ? <MatchNote match={match} /> : null}
      <Link href={listHref} className="w-fit text-sm text-primary underline-offset-4 hover:underline">
        Show it in the list
      </Link>
    </article>
  );
}
