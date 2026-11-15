"use client";

import { useState, type KeyboardEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18n/client";
import { formatDay } from "@/lib/i18n/format";
import type { Translator } from "@/lib/i18n/translate";
import { evidenceFor, fieldLabel, GRAPH_SIZE, layoutGraph, type EcoConnection } from "@/lib/staff-views/ecosystem";

/** A claim field's name: the catalogue's when it has one, else "applicationAreas" as "Application areas". */
function fieldName(t: Translator<"ecosystem">, field: string): string {
  const key = `fields.${field}` as Parameters<Translator<"ecosystem">>[0];
  const text = t(key);
  return text === `ecosystem.${key}` ? fieldLabel(field) : text;
}

/**
 * The graph and the list of pairs. Clicking a line, or a pair in the list,
 * opens the stated basis of that possible collaboration. Words in the
 * reader's language (C19); names, basis and claims as stored.
 */
export function EcosystemView({ connections, openId = null }: { connections: EcoConnection[]; openId?: string | null }) {
  const t = useT("ecosystem");
  const [selectedId, setSelectedId] = useState<string | null>(openId);
  const { nodes, edges } = layoutGraph(connections);
  const selected = connections.find((c) => c.id === selectedId) ?? null;
  const onKey = (id: string) => (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(id);
    }
  };
  const isEnd = (id: string) => selected !== null && (selected.aId === id || selected.bId === id);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 overflow-x-auto">
            <svg
              viewBox={`0 0 ${GRAPH_SIZE.width} ${GRAPH_SIZE.height}`}
              className="h-auto w-full min-w-[36rem]"
              role="group"
              aria-label={t("graphLabel", { members: nodes.length, links: edges.length })}
            >
              {edges.map((edge) => {
                const active = edge.id === selectedId;
                const pair = connections.find((c) => c.id === edge.id)!;
                return (
                  <g
                    key={edge.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    aria-label={t("pair", { a: pair.aName, b: pair.bName })}
                    onClick={() => setSelectedId(edge.id)}
                    onKeyDown={onKey(edge.id)}
                    className="group cursor-pointer outline-none"
                  >
                    <title>{t("pairTitle", { a: pair.aName, b: pair.bName, shared: pair.sharedOn.join(", ") })}</title>
                    <line
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      strokeLinecap="round"
                      className={
                        active
                          ? "stroke-primary [stroke-width:4]"
                          : "stroke-muted-foreground/60 [stroke-width:2] group-hover:stroke-foreground group-focus-visible:stroke-ring group-focus-visible:[stroke-width:4]"
                      }
                    />
                    {/* A wide, invisible line on top, so a thin line is easy to hit. */}
                    <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} strokeLinecap="round" className="stroke-transparent [stroke-width:16]" />
                  </g>
                );
              })}
              {nodes.map((node) => (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={6 + 2 * node.degree}
                    className={isEnd(node.id) ? "fill-primary stroke-background [stroke-width:2]" : "fill-background stroke-foreground [stroke-width:2]"}
                  />
                  <text
                    x={node.labelX}
                    y={node.labelY}
                    textAnchor={node.anchor}
                    className={`fill-foreground text-[13px] ${isEnd(node.id) ? "font-semibold" : ""}`}
                  >
                    {node.name}
                  </text>
                </g>
              ))}
            </svg>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="px-3 text-sm font-medium">{t("listTitle", { count: connections.length })}</h2>
          <ul className="flex flex-col gap-0.5 stagger">
            {connections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${c.id === selectedId ? "bg-muted" : ""}`}
                >
                  <span className="font-medium break-words">{t("pair", { a: c.aName, b: c.bName })}</span>
                  <span className="text-xs break-words text-muted-foreground">{c.sharedOn.join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Always in the page, so a screen reader hears which pair opened. */}
      <p role="status" className="sr-only">
        {selected ? t("showing", { a: selected.aName, b: selected.bName }) : ""}
      </p>
      {selected ? (
        <PairDetail key={selected.id} connection={selected} />
      ) : (
        <p className="animate-fade text-sm text-muted-foreground">{t("pickHint")}</p>
      )}
    </div>
  );
}

function PairDetail({ connection }: { connection: EcoConnection }) {
  const t = useT("ecosystem");
  const sides = [
    { id: connection.aId, name: connection.aName },
    { id: connection.bId, name: connection.bName },
  ];
  return (
    <Card className="animate-rise">
      <CardHeader>
        <CardTitle>
          <h2 className="text-heading break-words">{t("pair", { a: connection.aName, b: connection.bName })}</h2>
        </CardTitle>
        <CardDescription>{t("disclaimer")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("basis")}</h3>
          <p className="break-words">{connection.basis}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("sharedOn")}</h3>
          <p className="break-words">{connection.sharedOn.join(", ")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {sides.map((side) => (
            <div key={side.id} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("says", { name: side.name })}</h3>
              <ul className="flex flex-col gap-2">
                {evidenceFor(connection, side.id).map((e) => (
                  <li key={e.claimId} className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{fieldName(t, e.field)}</span>
                    <span className="break-words">{e.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("footer", { date: formatDay(connection.computedAt, t.locale) })}</p>
      </CardContent>
    </Card>
  );
}
