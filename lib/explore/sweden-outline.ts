/**
 * A hand-drawn locator sketch of southern Sweden for the explorer's map (C15).
 * Each ring is a closed list of [longitude, latitude] points taken from the
 * approximate positions of coastal towns, capes and border crossings, so it is
 * recognisable, not accurate: no small islands, bays or archipelagos. The
 * mainland's northern edge runs past the top of the map frame and is cut off
 * there.
 */
import type { LonLat } from "./map";

/** Mainland southern Sweden, clockwise from the Norwegian border north of the frame. */
export const MAINLAND: readonly LonLat[] = [
  // The border with Norway, north to south.
  [12.4, 61.3],
  [12.3, 60.85],
  [12.4, 60.6],
  [12.55, 60.3],
  [12.45, 60.05],
  [12.25, 59.9],
  [11.95, 59.78],
  [11.72, 59.62],
  [11.8, 59.35],
  [11.68, 59.08],
  [11.47, 59.0],
  [11.25, 59.08],
  // The west coast, north to south: Strömstad, Smögen, Lysekil, Gothenburg, Varberg, Halmstad, Kullen, Helsingborg, Malmö.
  [11.17, 58.94],
  [11.15, 58.7],
  [11.22, 58.38],
  [11.43, 58.27],
  [11.45, 58.1],
  [11.65, 57.9],
  [11.75, 57.7],
  [11.9, 57.58],
  [11.98, 57.4],
  [12.24, 57.1],
  [12.49, 56.9],
  [12.86, 56.66],
  [12.65, 56.45],
  [12.8, 56.3],
  [12.45, 56.29],
  [12.69, 56.05],
  [12.82, 55.87],
  [12.98, 55.61],
  [12.95, 55.55],
  // The south coast, west to east: Falsterbo, Trelleborg, Smygehuk, Ystad, Sandhammaren, Simrishamn.
  [12.83, 55.39],
  [13.15, 55.37],
  [13.36, 55.34],
  [13.82, 55.42],
  [14.2, 55.39],
  [14.36, 55.55],
  [14.2, 55.8],
  // Hanöbukten and Blekinge, west to east: Åhus, Sölvesborg, Karlshamn, Ronneby, Karlskrona, Torhamn.
  [14.3, 55.95],
  [14.58, 56.03],
  [14.86, 56.16],
  [15.25, 56.16],
  [15.59, 56.15],
  [15.85, 56.08],
  // The east coast, south to north: Kalmar, Oskarshamn, Västervik, Valdemarsvik, Arkösund, Oxelösund, Nynäshamn,
  // the Stockholm archipelago, Kapellskär, Grisslehamn, Öregrund, Gävle.
  [15.95, 56.2],
  [16.1, 56.4],
  [16.36, 56.66],
  [16.47, 57.0],
  [16.45, 57.27],
  [16.7, 57.45],
  [16.64, 57.76],
  [16.6, 58.2],
  [16.8, 58.35],
  [16.95, 58.49],
  [17.1, 58.67],
  [17.5, 58.75],
  [17.95, 58.9],
  [18.4, 59.1],
  [18.9, 59.45],
  [19.05, 59.72],
  [18.82, 60.1],
  [18.45, 60.34],
  [18.1, 60.45],
  [17.6, 60.62],
  [17.2, 60.68],
  [17.15, 60.75],
  [17.2, 61.3],
];

export const OLAND: readonly LonLat[] = [
  [16.4, 56.2],
  [16.42, 56.5],
  [16.55, 56.75],
  [16.8, 57.05],
  [17.0, 57.3],
  [17.1, 57.37],
  [17.15, 57.3],
  [17.0, 57.05],
  [16.75, 56.75],
  [16.6, 56.45],
  [16.48, 56.22],
];

export const GOTLAND: readonly LonLat[] = [
  [18.12, 56.92],
  [18.15, 57.2],
  [18.3, 57.65],
  [18.7, 57.92],
  [19.3, 57.98],
  [19.15, 57.75],
  [18.8, 57.65],
  [18.75, 57.35],
  [18.5, 57.1],
];

/** The two large lakes, drawn as water on the mainland. */
export const VANERN: readonly LonLat[] = [
  [12.32, 58.4],
  [12.4, 58.8],
  [12.85, 59.2],
  [13.45, 59.38],
  [14.05, 59.28],
  [13.85, 58.75],
  [13.2, 58.5],
  [12.8, 58.55],
];

export const VATTERN: readonly LonLat[] = [
  [14.15, 57.78],
  [14.3, 58.1],
  [14.55, 58.55],
  [14.85, 58.9],
  [14.75, 58.45],
  [14.55, 58.0],
  [14.3, 57.8],
];

export const LAND: readonly (readonly LonLat[])[] = [MAINLAND, OLAND, GOTLAND];
export const LAKES: readonly (readonly LonLat[])[] = [VANERN, VATTERN];

/** Labels for the areas around the outline. The words are in messages/*.json, `explore.map.areas` (C19). */
export const AREA_LABELS: readonly { id: "norway" | "balticSea"; at: LonLat }[] = [
  { id: "norway", at: [11.35, 60.35] },
  { id: "balticSea", at: [17.6, 56.35] },
];
