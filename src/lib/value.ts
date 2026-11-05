// Player trade values. Pure functions, safe to import from client components.
//
// Built from the "Ranking Multiplier" values in the FWD/MID/DEF/GK (A) sheets
// of FPL_26-27_Analysis_Sheet.xlsx:
//   - Z keeps the sheet's original value for that position.
//   - F is the sheet's original F value for that position.
//   - Every tier above F is worth TIER_GROWTH (1.7x) more than the one below it.
// GK has no F tier in the sheet, so GK uses 200 (the sheet's GK E/Z value).

export const POSITIONS = ["F", "M", "D", "GK"] as const;
export type Pos = (typeof POSITIONS)[number];
export const POSITION_LABEL: Record<Pos, string> = { F: "FWD", M: "MID", D: "DEF", GK: "GK" };

export const TIERS = ["S", "A", "B", "C", "D", "E", "F", "Z"] as const;
export type Tier = (typeof TIERS)[number];

/** Multiplier between consecutive tiers from F up to S. */
export const TIER_GROWTH = 1.7;

/** Original per-position values from the (A) sheets. */
const SHEET_VALUES = {
  F: { Z: 180, F: 208 },
  M: { Z: 200, F: 250 },
  D: { Z: 195, F: 220 },
  GK: { Z: 200, F: 200 },
} as const;

function buildScale(pos: Pos): Record<Tier, number> {
  const { Z, F } = SHEET_VALUES[pos];
  const up = ["F", "E", "D", "C", "B", "A", "S"] as const; // F → S, ascending
  const scale = { Z } as Record<Tier, number>;
  up.forEach((t, i) => (scale[t] = Math.round(F * TIER_GROWTH ** i)));
  return scale;
}

export const TIER_VALUES: Record<Pos, Record<Tier, number>> = {
  F: buildScale("F"),
  M: buildScale("M"),
  D: buildScale("D"),
  GK: buildScale("GK"),
};

export const isPos = (x: unknown): x is Pos => POSITIONS.includes(x as Pos);
export const isTier = (x: unknown): x is Tier => TIERS.includes(x as Tier);

/** Value of a ranked player. Players missing from a list are worth 0. */
export function tierValue(pos: string | null | undefined, tier: string | null | undefined): number {
  if (!isPos(pos) || !isTier(tier)) return 0;
  return TIER_VALUES[pos][tier];
}

/** Each extra asset in a package counts for this fraction of the one before it. */
export const DEPTH_FACTOR = 0.85;

export interface TradeSide {
  raw: number;
  adjusted: number;
}

/**
 * Raw = plain sum. Adjusted = sorted best-first, where the i-th asset is
 * weighted DEPTH_FACTOR^i, so a pile of depth pieces doesn't automatically
 * beat one star (you only have so many starting slots).
 */
export function scoreSide(values: number[]): TradeSide {
  const sorted = [...values].sort((a, b) => b - a);
  return {
    raw: sorted.reduce((s, v) => s + v, 0),
    adjusted: Math.round(sorted.reduce((s, v, i) => s + v * DEPTH_FACTOR ** i, 0)),
  };
}

export function verdict(a: number, b: number) {
  if (a + b === 0) return { label: "Add players to evaluate", winner: null as null | "A" | "B", pct: 0 };
  const pct = Math.round((Math.abs(a - b) / Math.max(a, b)) * 100);
  if (pct <= 5) return { label: "Fair trade", winner: null, pct };
  const winner = a > b ? ("A" as const) : ("B" as const);
  const label = pct <= 15 ? "Slight edge" : pct <= 30 ? "Clear edge" : "Lopsided";
  return { label, winner, pct };
}

export interface RankedEntry {
  playerId: string;
  pos: Pos;
  rank: number;
  tier: Tier;
  value: number;
}
