// Turns a ranking (1 = best) into a trade value, and scores trades.
// Pure functions, safe to import from client components.

export const MAX_VALUE = 10000;
/** Decay per rank. 0.0125 → #50 ≈ 5,400, #100 ≈ 2,900, #200 ≈ 830. */
export const DECAY = 0.0125;
/** Each extra asset in a package counts for this fraction of the one before it. */
export const DEPTH_FACTOR = 0.85;

export function rankToValue(rank: number | null | undefined): number {
  if (!rank || rank < 1) return 0;
  return Math.round(MAX_VALUE * Math.exp(-DECAY * (rank - 1)));
}

export interface TradeSide {
  raw: number;
  adjusted: number;
}

/**
 * Raw = plain sum. Adjusted = sorted best-first, where the i-th asset is
 * weighted DEPTH_FACTOR^i. This keeps "two quarters for a dollar" from
 * winning: one star beats a pile of depth pieces, since you only get so many
 * starting slots.
 */
export function scoreSide(values: number[]): TradeSide {
  const sorted = [...values].sort((a, b) => b - a);
  return {
    raw: sorted.reduce((s, v) => s + v, 0),
    adjusted: Math.round(sorted.reduce((s, v, i) => s + v * DEPTH_FACTOR ** i, 0)),
  };
}

export function verdict(a: number, b: number) {
  const total = a + b;
  if (total === 0) return { label: "Add players to evaluate", winner: null as null | "A" | "B", pct: 0 };
  const diff = Math.abs(a - b);
  const pct = Math.round((diff / Math.max(a, b)) * 100);
  if (pct <= 5) return { label: "Fair trade", winner: null, pct };
  const winner = a > b ? ("A" as const) : ("B" as const);
  const label = pct <= 15 ? "Slight edge" : pct <= 30 ? "Clear edge" : "Lopsided";
  return { label, winner, pct };
}
