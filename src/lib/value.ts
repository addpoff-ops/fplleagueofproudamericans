// Player values. Pure functions, safe to import from client components.
//
// Players are valued by position + tier using the original "Ranking
// Multiplier" values from the FWD/MID/DEF/GK (A) sheets of
// FPL_26-27_Analysis_Sheet.xlsx. Power Rankings uses them as-is; trade values
// (trade calculator, Player Rankings, team pages) are 3x those, minus 400.

export const POSITIONS = ["F", "M", "D", "GK"] as const;
export type Pos = (typeof POSITIONS)[number];
export const POSITION_LABEL: Record<Pos, string> = { F: "FWD", M: "MID", D: "DEF", GK: "GK" };

export const TIERS = ["S", "A", "B", "C", "D", "E", "F", "Z"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * The original "Ranking Multiplier" values from the FWD/MID/DEF/GK (A) sheets,
 * unchanged. (The sheet has no GK F
 * tier, so GK F uses 200, the same as the sheet's GK E and Z.)
 */
export const SHEET_TIER_VALUES: Record<Pos, Record<Tier, number>> = {
  F: { S: 580, A: 515, B: 435, C: 355, D: 280, E: 242, F: 208, Z: 180 },
  M: { S: 600, A: 512, B: 450, C: 390, D: 345, E: 320, F: 250, Z: 200 },
  D: { S: 450, A: 420, B: 365, C: 320, D: 278, E: 248, F: 220, Z: 195 },
  GK: { S: 325, A: 300, B: 265, C: 242, D: 215, E: 200, F: 200, Z: 200 },
};

/** Every trade value is the sheet value times this... */
export const TRADE_MULTIPLIER = 3;
/** ...minus this. */
export const TRADE_OFFSET = 400;

/** Sheet value → trade value. */
export const toTradeValue = (sheetValue: number) => Math.round(sheetValue * TRADE_MULTIPLIER - TRADE_OFFSET);

/** Trade values (trade calculator, Player Rankings, team pages). Power
 *  Rankings uses SHEET_TIER_VALUES directly, unmultiplied. */
export const TIER_VALUES = Object.fromEntries(
  Object.entries(SHEET_TIER_VALUES).map(([pos, tiers]) => [
    pos,
    Object.fromEntries(Object.entries(tiers).map(([t, v]) => [t, toTradeValue(v)])),
  ]),
) as Record<Pos, Record<Tier, number>>;

export const isPos = (x: unknown): x is Pos => POSITIONS.includes(x as Pos);
export const isTier = (x: unknown): x is Tier => TIERS.includes(x as Tier);

/** Value of a ranked player. Players missing from a list are worth 0. */
export function tierValue(pos: string | null | undefined, tier: string | null | undefined): number {
  if (!isPos(pos) || !isTier(tier)) return 0;
  return TIER_VALUES[pos][tier];
}

/**
 * A "Waiver add": what a free roster spot is worth, the average Z-tier trade
 * value of a forward, midfielder and defender ((140 + 200 + 185) / 3 = 175).
 */
export const WAIVER_ADD_VALUE = Math.round((TIER_VALUES.F.Z + TIER_VALUES.M.Z + TIER_VALUES.D.Z) / 3);

export interface TradeSide {
  raw: number; // the players' values added up
  waiverAdds: number; // waiver adds credited to this side
  waiver: number; // their total value
  adjusted: number; // raw + waiver: the side's value in the trade
}

/**
 * A side's value in a trade: its players' values added up, plus a Waiver add
 * for each player it's short of the other side, so both sides count the same
 * number of values (2-for-1 → the 1-player side gets one waiver add, 3-for-1 →
 * two, 3-for-2 → one). Only when both sides have at least one player.
 */
export function scoreSide(values: number[], otherCount: number): TradeSide {
  const raw = values.reduce((s, v) => s + v, 0);
  const waiverAdds = values.length > 0 && otherCount > 0 ? Math.max(0, otherCount - values.length) : 0;
  const waiver = waiverAdds * WAIVER_ADD_VALUE;
  return { raw, waiverAdds, waiver, adjusted: raw + waiver };
}

/**
 * Advantage = how much more one side got, as a % of the bigger side.
 *   under 10%      → Fair trade
 *   10% – <20%     → Slight Win
 *   20% – <40%     → Clear Win
 *   40% or more    → Robbery
 * Thresholds use the exact advantage; the % shown is rounded down to one decimal.
 */
export function verdict(a: number, b: number) {
  if (a + b === 0) return { label: "Add players to evaluate", winner: null as null | "A" | "B", pct: 0 };
  const exact = (Math.abs(a - b) / Math.max(a, b)) * 100;
  // One decimal, rounded down, so the shown % always matches its label (19.99 → 19.9).
  const pct = Math.floor(exact * 10) / 10;
  if (exact < 10) return { label: "Fair trade", winner: null, pct };
  const winner = a > b ? ("A" as const) : ("B" as const);
  const label = exact < 20 ? "Slight Win" : exact < 40 ? "Clear Win" : "Robbery";
  return { label, winner, pct };
}

export interface RankedEntry {
  playerId: string;
  pos: Pos;
  rank: number;
  tier: Tier;
  value: number;
}
