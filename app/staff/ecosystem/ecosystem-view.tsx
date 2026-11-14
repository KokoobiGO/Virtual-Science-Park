"use client";

import { useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONNECTION_DISCLAIMER } from "@/lib/connections";
import { evidenceFor, fieldLabel, GRAPH_SIZE, layoutGraph, type EcoConnection } from "@/lib/staff-views/ecosystem";

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", year: "numeric" });

/**
 * The graph and the list of pairs. Clicking a line, or a pair in the list,
 * opens the stated basis of that possible collaboration.
 */
export function EcosystemView({ connections, openId = null }: { connections: EcoConnection[]; openId?: string | null }) {
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardContent className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${GRAPH_SIZE.width} ${GRAPH_SIZE.height}`}
              className="h-auto w-full min-w-[36rem]"
              role="group"
              aria-label={`Graph of ${nodes.length} members linked by ${edges.length} possible collaborations`}
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
                    aria-label={`${pair.aName} and ${pair.bName}`}
                    onClick={() => setSelectedId(edge.id)}
                    onKeyDown={onKey(edge.id)}
                    className="group cursor-pointer outline-none"
                  >
                    <title>{`${pair.aName} and ${pair.bName}: ${pair.sharedOn.join(", ")}`}</title>
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
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Possible collaborations ({connections.length})</h2>
          <ul className="flex flex-col gap-1.5">
            {connections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${c.id === selectedId ? "border-primary bg-muted" : ""}`}
                >
                  <span className="font-medium">
                    {c.aName} and {c.bName}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.sharedOn.join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {selected ? (
        <PairDetail connection={selected} />
      ) : (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          Click a line in the graph, or a pair in the list, to see why the two members might talk.
        </p>
      )}
    </div>
  );
}

function PairDetail({ connection }: { connection: EcoConnection }) {
  const sides = [
    { id: connection.aId, name: connection.aName },
    { id: connection.bId, name: connection.bName },
  ];
  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle>
          {connection.aName} and {connection.bName}
        </CardTitle>
        <CardDescription>{CONNECTION_DISCLAIMER}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Stated basis</h3>
          <p>{connection.basis}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Shared on</h3>
          <div className="flex flex-wrap gap-1.5">
            {connection.sharedOn.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {sides.map((side) => (
            <div key={side.id} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                What {side.name}&apos;s public profile says
              </h3>
              <ul className="flex flex-col gap-2">
                {evidenceFor(connection, side.id).map((e) => (
                  <li key={e.claimId} className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{fieldLabel(e.field)}</span>
                    <span>{e.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          From public profile claims only. Found on {dayFormat.format(new Date(connection.computedAt))}.
        </p>
      </CardContent>
    </Card>
  );
}
