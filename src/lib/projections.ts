import { SPORT } from "./sleeper";

// Weekly player projections from Sleeper (RotoWire forecasts, the same ones
// behind projected points in the Sleeper app). Each stat is an expected count
// for the week; `cs` is the chance of a clean sheet (0-1).

export const PROJ_STATS = ["g", "at", "kp", "sot", "cos", "acnc", "tkw", "int", "aer", "clr", "cs", "ga", "sv"] as const;
export type ProjStat = (typeof PROJ_STATS)[number];

export const PROJ_LABEL: Record<ProjStat, string> = {
  g: "Goals",
  at: "Assists",
  kp: "Chances created",
  sot: "Shots on target",
  cos: "Dribbles completed",
  acnc: "Accurate crosses",
  tkw: "Tackles won",
  int: "Interceptions",
  aer: "Aerials won",
  clr: "Effective clearances",
  cs: "Clean sheet %",
  ga: "Goals against",
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

export interface ProjectionLine {
  stat: ProjStat;
  value: number; // projected amount (cs: probability 0-1)
  perUnit: number; // league points per 1 of this stat at the player's position
  points: number; // value x perUnit
}

export interface Projection {
  points: number;
  stats: Partial<Record<ProjStat, number>>; // expected counts (cs as a probability)
  lines: ProjectionLine[]; // every counted stat, including zeros
}

/**
 * Projected points from goals, assists, chances created, shots on target,
 * dribbles completed, accurate crosses, tackles won, interceptions, aerials
 * won, effective clearances, clean-sheet likelihood, goals against (defenders
 * and goalkeepers only) and saves (goalkeepers only), each multiplied by our
 * league's score for that stat at the player's position (e.g. pos_d_cs, pos_gk_ga).
 */
export function projectPoints(
  line: StatLine | undefined,
  pos: string,
  scoring: Record<string, number>,
  multiplier = 1, // scales every projected stat (see PROJECTION_ADJUSTMENTS)
): Projection {
  const p = POS_KEY[pos];
  const stats: Projection["stats"] = {};
  const lines: ProjectionLine[] = [];
  let points = 0;
  if (!p) return { points: 0, stats, lines };
  for (const s of PROJ_STATS) {
    if (s === "sv" && pos !== "GK") continue; // saves count for goalkeepers only
    if (s === "ga" && pos !== "D" && pos !== "GK") continue; // goals against: defenders and goalkeepers only
    const value = ((line && (line[`pos_${p}_${s}`] ?? line[s])) || 0) * multiplier;
    const perUnit = scoring[`pos_${p}_${s}`] ?? 0;
    if (value) stats[s] = value;
    lines.push({ stat: s, value, perUnit, points: value * perUnit });
    points += value * perUnit;
  }
  // Full precision; pages round once when displaying.
  return { points, stats, lines };
}

/**
 * Manual adjustments to Sleeper's projections, by Sleeper player ID: every
 * projected stat is multiplied by this. Kostoulas (10130) is halved as a test,
 * since his projections have run well above his actual output this season.
 */
export const PROJECTION_ADJUSTMENTS: Record<string, number> = {
  "10130": 0.5, // Charalampos Kostoulas
};

/**
 * RotoWire sometimes leaves a club's goalkeeper out of its weekly projections
 * (e.g. when it isn't sure who will start). For a club that plays that week
 * (its outfield players are projected) but has no projected goalkeeper, give
 * each fit keeper at the club an estimated line:
 *   - clean sheet % and goals against: the average of the club's own projected
 *     defenders for the same game;
 *   - saves and the smaller stats: the keeper's per-game averages this season,
 *     or (saves only) the average of this week's projected keepers if he
 *     hasn't played.
 * Keepers listed as "Out" are skipped. Returns the filled-in projections and a
 * note per estimated keeper.
 */
export function fillMissingKeepers(
  proj: Record<string, StatLine>,
  players: Record<string, { pos: string; team: string | null; injury: string | null }>,
  season: Record<string, StatLine>,
) {
  const out: Record<string, StatLine> = { ...proj };
  const notes: Record<string, string> = {};
  const clubOf = (id: string) => players[id]?.team ?? null;
  const projectedClubs = new Set(Object.keys(proj).map(clubOf).filter(Boolean));
  const clubsWithKeeper = new Set(Object.keys(proj).filter((id) => players[id]?.pos === "GK").map(clubOf));
  const keeperSaves = Object.keys(proj).filter((id) => players[id]?.pos === "GK").map((id) => proj[id].pos_gk_sv ?? proj[id].sv ?? 0);
  const avgSaves = keeperSaves.length ? keeperSaves.reduce((a, b) => a + b, 0) / keeperSaves.length : 0;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  for (const club of projectedClubs) {
    if (!club || clubsWithKeeper.has(club)) continue;
    const defenders = Object.keys(proj).filter((id) => clubOf(id) === club && players[id]?.pos === "D");
    const cs = avg(defenders.map((id) => proj[id].pos_d_cs ?? proj[id].cs ?? 0));
    const ga = avg(defenders.map((id) => proj[id].pos_d_ga ?? proj[id].ga ?? 0));
    const keepers = Object.keys(players).filter(
      (id) => players[id].pos === "GK" && players[id].team === club && !/^out$/i.test(players[id].injury ?? ""),
    );
    for (const id of keepers) {
      const s = season[id] ?? {};
      const gp = s.gp ?? 0;
      const perGame = (k: string) => (gp ? ((s[`pos_gk_${k}`] ?? s[k] ?? 0) as number) / gp : 0);
      const line: StatLine = { pos_gk_cs: cs, pos_gk_ga: ga, pos_gk_sv: gp ? perGame("sv") : avgSaves };
      for (const k of ["kp", "tkw", "int", "aer", "clr", "cos", "acnc"]) line[`pos_gk_${k}`] = perGame(k);
      out[id] = line;
      notes[id] = `Estimated: RotoWire has no keeper projection for ${club} this week. Clean sheet and goals against come from ${club}'s projected defenders; ${gp ? "saves and other stats from his per-game averages this season" : "saves from the average projected keeper (he hasn't played this season)"}.`;
    }
  }
  return { proj: out, notes };
}
