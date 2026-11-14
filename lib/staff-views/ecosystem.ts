/**
 * The ecosystem map (C17), for BSP staff: members as nodes, the stored
 * possible collaborations (A28, table `connections`) as lines. Pure, with no
 * server imports, so the client component can use it and it is unit-tested.
 *
 * Nodes sit on a circle in the order of a walk through each group of linked
 * members, so linked members sit next to each other and lines rarely cross.
 */
import type { ConnectionEvidence } from "../connections/verify";

export type { ConnectionEvidence };

/** A stored connection with both names. `computedAt` is an ISO string so it can go to the browser. */
export type EcoConnection = {
  id: string;
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  score: number;
  sharedOn: string[];
  basis: string;
  evidence: ConnectionEvidence[];
  computedAt: string;
};

export type EcoNode = {
  id: string;
  name: string;
  degree: number;
  x: number;
  y: number;
  /** Where the label goes: outside the circle, on the node's side. */
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
};

export type EcoEdge = { id: string; aId: string; bId: string; x1: number; y1: number; x2: number; y2: number };

export const GRAPH_SIZE = { width: 760, height: 440, radius: 160, labelGap: 14 } as const;

type Size = { width: number; height: number; radius: number; labelGap: number };

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * The members in drawing order: groups of linked members one after the other,
 * each walked depth-first from its best-linked member, the strongest link first.
 */
export function nodeOrder(connections: readonly EcoConnection[]): string[] {
  const neighbours = new Map<string, { id: string; score: number }[]>();
  const names = new Map<string, string>();
  for (const c of connections) {
    names.set(c.aId, c.aName);
    names.set(c.bId, c.bName);
    neighbours.set(c.aId, [...(neighbours.get(c.aId) ?? []), { id: c.bId, score: c.score }]);
    neighbours.set(c.bId, [...(neighbours.get(c.bId) ?? []), { id: c.aId, score: c.score }]);
  }
  for (const list of neighbours.values()) list.sort((x, y) => y.score - x.score || names.get(x.id)!.localeCompare(names.get(y.id)!, "en"));

  const starts = [...neighbours.keys()].sort(
    (x, y) =>
      neighbours.get(y)!.length - neighbours.get(x)!.length ||
      neighbours.get(y)![0].score - neighbours.get(x)![0].score ||
      names.get(x)!.localeCompare(names.get(y)!, "en"),
  );
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    seen.add(id);
    order.push(id);
    for (const next of neighbours.get(id)!) if (!seen.has(next.id)) walk(next.id);
  };
  for (const id of starts) if (!seen.has(id)) walk(id);
  return order;
}

/** Positions for every linked member and every line. */
export function layoutGraph(connections: readonly EcoConnection[], size: Size = GRAPH_SIZE): { nodes: EcoNode[]; edges: EcoEdge[] } {
  const order = nodeOrder(connections);
  const cx = size.width / 2;
  const cy = size.height / 2;
  const names = new Map<string, string>();
  const degree = new Map<string, number>();
  for (const c of connections) {
    names.set(c.aId, c.aName);
    names.set(c.bId, c.bName);
    degree.set(c.aId, (degree.get(c.aId) ?? 0) + 1);
    degree.set(c.bId, (degree.get(c.bId) ?? 0) + 1);
  }

  const nodes: EcoNode[] = order.map((id, i) => {
    // Start at the top and go clockwise.
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / order.length;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
    const out = size.radius + size.labelGap;
    return {
      id,
      name: names.get(id)!,
      degree: degree.get(id)!,
      x: round(cx + size.radius * cos),
      y: round(cy + size.radius * sin),
      labelX: round(cx + out * cos),
      // Labels above the top node and below the bottom one need room for the text height.
      labelY: round(cy + out * sin + (anchor === "middle" ? (sin > 0 ? 8 : -2) : 4)),
      anchor,
    };
  });

  const at = new Map(nodes.map((n) => [n.id, n]));
  const edges: EcoEdge[] = connections.map((c) => ({
    id: c.id,
    aId: c.aId,
    bId: c.bId,
    x1: at.get(c.aId)!.x,
    y1: at.get(c.aId)!.y,
    x2: at.get(c.bId)!.x,
    y2: at.get(c.bId)!.y,
  }));
  return { nodes, edges };
}

/** Members without any stored connection, by name. */
export function unconnected<T extends { id: string; name: string }>(companies: readonly T[], connections: readonly EcoConnection[]): T[] {
  const linked = new Set(connections.flatMap((c) => [c.aId, c.bId]));
  return companies.filter((c) => !linked.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** The claims a connection rests on, for one of its two companies. */
export function evidenceFor(connection: Pick<EcoConnection, "evidence">, companyId: string): ConnectionEvidence[] {
  return connection.evidence.filter((e) => e.companyId === companyId);
}

/** "applicationAreas" becomes "Application areas". */
export function fieldLabel(field: string): string {
  const words = field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
