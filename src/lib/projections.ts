import { SPORT } from "./sleeper";

// Weekly player projections from Sleeper (RotoWire forecasts, the same ones
// behind projected points in the Sleeper app). Each stat is an expected count
// for the week; `cs` is the chance of a clean sheet (0-1).

export const PROJ_STATS = ["g", "at", "kp", "sot", "tkw", "int", "aer", "cs", "sv"] as const;
export type ProjStat = (typeof PROJ_STATS)[number];

export const PROJ_LABEL: Record<ProjStat, string> = {
  g: "Goals",
  at: "Assists",
  kp: "Chances created",
  sot: "Shots on target",
  tkw: "Tackles won",
  int: "Interceptions",
  aer: "Aerials won",
  cs: "Clean sheet %",
  sv: "Saves",
};

const POS_KEY: Record<string, string> = { F: "f", M: "m", D: "d", GK: "gk" };

export type StatLine = Record<string, number>;

export async function getWeekProjectionStats(season: string, week: number): Promise<Record<string, StatLine>> {
  const res = await fetch(`https://api.sleeper.app/v1/projections/${SPORT}/regular/${season}/${week}`, {
    next: { revalidate: 900 },
  });
  if (!res.ok) return {};
  return ((await res.json()) as Record<string, StatLine> | null) ?? {};
}

export interface Projection {
  points: number;
  stats: Partial<Record<ProjStat, number>>; // expected counts (cs as a probability)
}

/**
 * Projected points from goals, assists, chances created, shots on target,
 * tackles won, interceptions, aerials won, clean-sheet likelihood and (for
 * goalkeepers only) saves, each multiplied by our league's score for that stat
 * at the player's position (e.g. pos_d_cs, pos_gk_g).
 */
export function projectPoints(line: StatLine | undefined, pos: string, scoring: Record<string, number>): Projection {
  const p = POS_KEY[pos];
  const stats: Projection["stats"] = {};
  let points = 0;
  if (!line || !p) return { points: 0, stats };
  for (const s of PROJ_STATS) {
    if (s === "sv" && pos !== "GK") continue; // saves count for goalkeepers only
    const v = line[`pos_${p}_${s}`] ?? line[s] ?? 0;
    if (!v) continue;
    stats[s] = v;
    points += v * (scoring[`pos_${p}_${s}`] ?? 0);
  }
  // Full precision; pages round once when displaying.
  return { points, stats };
}
