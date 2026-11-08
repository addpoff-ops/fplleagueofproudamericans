// Lineup Setter: decide lineup changes once team sheets are announced.
//
// Data (all public Sleeper endpoints):
//   /scores/{sport}/regular/{season}/{week}  kickoff times + announced team sheets
//                                            (metadata.rosters.{home,away}.players[].is_starter,
//                                            empty until ~1 hour before kickoff)
//   /schedule/{sport}/regular/{season}       which clubs play in each game
//   /v1/projections/{sport}/regular/{season}/{week}  weekly projections

import { getLeague, getPlayers, getRosters, getState, scorePoints, SPORT, type Player } from "./sleeper";

const API = "https://api.sleeper.app";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sleeper ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------- Games ----------

export interface Game {
  gameId: string;
  start: number; // kickoff, ms since epoch
  status: string; // pre_game | in_game | complete ...
  home: string; // club abbreviation, e.g. "ARS"
  away: string;
  announced: boolean; // team sheets published
  starters: Set<string>; // Sleeper player IDs in either starting XI
  inSquad: Set<string>; // everyone on either team sheet (starters + subs)
}

interface ScoreRow {
  game_id: string;
  start_time: string;
  status: string;
  metadata?: {
    rosters?: Record<"home" | "away", { players?: { player_id: string; is_starter: boolean }[] } | null> | null;
  };
}
interface ScheduleRow {
  game_id: string;
  week: number;
  home: { abbr: string };
  away: { abbr: string };
}

export async function getWeekGames(season: string, week: number): Promise<Game[]> {
  const [scores, schedule] = await Promise.all([
    getJson<ScoreRow[]>(`${API}/scores/${SPORT}/regular/${season}/${week}`),
    getJson<ScheduleRow[]>(`${API}/schedule/${SPORT}/regular/${season}`),
  ]);
  const clubs = new Map(schedule.filter((g) => g.week === week).map((g) => [g.game_id, g]));
  return scores.flatMap((s) => {
    const c = clubs.get(s.game_id);
    if (!c) return [];
    const sides = [s.metadata?.rosters?.home, s.metadata?.rosters?.away];
    const players = sides.flatMap((side) => side?.players ?? []);
    return [
      {
        gameId: s.game_id,
        start: Number(s.start_time),
        status: s.status,
        home: c.home.abbr,
        away: c.away.abbr,
        announced: sides.every((side) => (side?.players?.length ?? 0) > 0),
        starters: new Set(players.filter((p) => p.is_starter).map((p) => p.player_id)),
        inSquad: new Set(players.map((p) => p.player_id)),
      },
    ];
  });
}

/** Weekly projected points under the league's scoring, by player ID. */
export async function getWeekProjections(season: string, week: number, scoring: Record<string, number>) {
  const raw = await getJson<Record<string, Record<string, number>> | null>(
    `${API}/v1/projections/${SPORT}/regular/${season}/${week}`,
  );
  const out = new Map<string, number>();
  for (const [id, stats] of Object.entries(raw ?? {})) out.set(id, scorePoints(stats, scoring));
  return out;
}

// ---------- Kickoff windows ----------

/** Games grouped by kickoff time. A window is actionable once every game in it
 *  has announced team sheets and none has kicked off yet. */
export function actionableWindows(games: Game[], now = Date.now()) {
  const byStart = new Map<number, Game[]>();
  for (const g of games) byStart.set(g.start, [...(byStart.get(g.start) ?? []), g]);
  return [...byStart.entries()]
    .filter(([start, gs]) => start > now && gs.every((g) => g.announced && g.status === "pre_game"))
    .sort((a, b) => a[0] - b[0])
    .map(([start, gs]) => ({ start, games: gs }));
}

// ---------- Choosing replacements ----------

/** Which player positions can fill each lineup slot. Multi-position
 *  eligibility is off in our league, so a player has exactly one position. */
const SLOT_ELIGIBLE: Record<string, string[]> = {
  F: ["F"],
  M: ["M"],
  D: ["D"],
  GK: ["GK"],
  FM_FLEX: ["F", "M"],
  MD_FLEX: ["M", "D"],
  FMD_FLEX: ["F", "M", "D"],
};

export type Priority = "A" | "B" | "C";
export const PRIORITY_LABEL: Record<Priority, string> = {
  A: "starting in the same kickoff window",
  B: "projected above 0 in a later game",
  C: "best other available player",
};

export interface Swap {
  slot: string; // the slot the incoming player ends up in
  out: string;
  in: string;
  priority: Priority;
  proj: number;
}

export interface Plan {
  windowStart: number;
  newStarters: string[];
  swaps: Swap[];
  unresolved: { slot: string; out: string }[]; // non-starters with no valid replacement
  formationBefore: string; // e.g. "4-4-2" (DEF-MID-FWD), as saved on Sleeper for the week
  formationAfter: string; // the formation the new lineup needs saved on Sleeper
  /** The saved lineup didn't match its formation or had players in spots they can't fill; fixed without swaps. */
  repaired: boolean;
}

interface PlanInput {
  slots: string[]; // lineup slots in order (no BN/IR)
  starters: string[]; // current starters, same order as slots ("0" = empty)
  players: string[]; // whole roster
  reserve: string[]; // injured reserve (can't start)
  games: Game[];
  window: { start: number; games: Game[] };
  proj: Map<string, number>;
  playerInfo: Record<string, Player>;
  /** The formation saved on Sleeper for this week ("D-M-F"), if any. */
  formation?: string;
  now?: number;
}

/** Formation rules: 1 GK, 3-5 DEF, 3-5 MID, 1-3 FWD. */
const FORMATION_LIMITS: Record<string, [number, number]> = { GK: [1, 1], D: [3, 5], M: [3, 5], F: [1, 3] };

function positionCounts(ids: string[], pos: (id: string) => string) {
  const c: Record<string, number> = { GK: 0, D: 0, M: 0, F: 0 };
  for (const id of ids) c[pos(id)] = (c[pos(id)] ?? 0) + 1;
  return c;
}

export function formationOf(ids: string[], pos: (id: string) => string) {
  const c = positionCounts(ids, pos);
  return `${c.D}-${c.M}-${c.F}`;
}

const followsFormation = (ids: string[], pos: (id: string) => string) => {
  const c = positionCounts(ids, pos);
  return Object.entries(FORMATION_LIMITS).every(([p, [lo, hi]]) => c[p] >= lo && c[p] <= hi);
};

/**
 * Put the starters into lineup slots so every player sits in a slot their
 * position is eligible for. Locked players (their game has kicked off) keep
 * their current slot; everyone else moves as little as possible.
 * Returns null if no valid arrangement exists.
 */
function assignSlotsFewestMoves(
  slots: string[],
  current: string[], // current slot-ordered starters ("0" = empty)
  ids: string[], // the starters to place
  pos: (id: string) => string,
  locked: (id: string) => boolean = () => false,
): string[] | null {
  const result: string[] = slots.map(() => "0");
  const used = new Set<string>();
  for (let k = 0; k < slots.length; k++) {
    const id = current[k];
    if (id && id !== "0" && ids.includes(id) && locked(id)) {
      if (!(SLOT_ELIGIBLE[slots[k]] ?? []).includes(pos(id))) return null;
      result[k] = id;
      used.add(id);
    }
  }
  const toPlace = ids.filter((id) => !used.has(id));
  const open = slots.map((_, k) => k).filter((k) => result[k] === "0");
  if (toPlace.length > open.length) return null;
  let best: { arr: string[]; moves: number } | null = null;
  const arr = [...result];
  const left = new Set(toPlace);
  const dfs = (j: number, moves: number) => {
    if (best && moves >= best.moves) return;
    if (j === open.length) {
      if (left.size === 0) best = { arr: [...arr], moves };
      return;
    }
    if (left.size > open.length - j) return; // not enough slots left
    const k = open[j];
    const eligible = SLOT_ELIGIBLE[slots[k]] ?? [];
    // Try the current occupant first, then everyone else.
    const order = [...left].sort((a, b) => Number(b === current[k]) - Number(a === current[k]));
    for (const id of order) {
      if (!eligible.includes(pos(id))) continue;
      left.delete(id);
      arr[k] = id;
      dfs(j + 1, moves + (current[k] === id ? 0 : 1));
      arr[k] = "0";
      left.add(id);
    }
    if (left.size < open.length - j) dfs(j + 1, moves); // leave this slot empty
  };
  dfs(0, 0);
  return best ? (best as { arr: string[] }).arr : null;
}

/**
 * Put the starters into lineup slots so every player sits in a slot their
 * position is eligible for, without reshuffling anyone else as Sleeper shows the
 * lineup (each line, e.g. the midfield, is listed in slot order). Within each
 * position the players keep their current order; a replacement of the same
 * position takes the place of the player it replaces, and one of a different
 * position joins the end of its own line. Locked players (their game has kicked
 * off) keep their slot. Among arrangements that do this, the one that moves the
 * fewest players wins; if none does (because of locked players), fall back to
 * the fewest moves overall. Returns null if no valid arrangement exists.
 */
export function assignSlots(
  slots: string[],
  current: string[], // current slot-ordered starters ("0" = empty)
  ids: string[], // the starters to place
  pos: (id: string) => string,
  locked: (id: string) => boolean = () => false,
  replaces: Map<string, string> = new Map(), // incoming player -> player they replace
): string[] | null {
  if (ids.length > slots.length) return null;
  // Each player's place in the order: their current slot, or (for a replacement)
  // the slot of the same-position player they replace, else after everyone else.
  const orderKey = (id: string) => {
    const at = current.indexOf(id);
    if (at >= 0) return at;
    const out = replaces.get(id);
    const outAt = out ? current.indexOf(out) : -1;
    return outAt >= 0 && pos(out!) === pos(id) ? outAt : slots.length + ids.indexOf(id);
  };
  const groups: Record<string, string[]> = {};
  for (const id of ids) (groups[pos(id)] ??= []).push(id);
  for (const g of Object.values(groups)) g.sort((a, b) => orderKey(a) - orderKey(b));

  let best: { arr: string[]; moves: number } | null = null;
  const pattern: string[] = [];
  const have: Record<string, number> = {};
  const empties = slots.length - ids.length;
  const choose = (k: number, emptyUsed: number) => {
    if (k === slots.length) {
      if (Object.keys(groups).some((p) => (have[p] ?? 0) !== groups[p].length)) return;
      const next: Record<string, number> = {};
      const arr = pattern.map((p) => (p ? groups[p][(next[p] = (next[p] ?? -1) + 1)] : "0"));
      // Locked players must stay exactly where they are.
      if (current.some((id, j) => id && id !== "0" && ids.includes(id) && locked(id) && arr[j] !== id)) return;
      const moves = arr.filter((id, j) => id !== current[j]).length;
      if (!best || moves < best.moves) best = { arr, moves };
      return;
    }
    for (const p of [...(SLOT_ELIGIBLE[slots[k]] ?? []), ...(emptyUsed < empties ? [""] : [])]) {
      if (p && (have[p] ?? 0) >= (groups[p]?.length ?? 0)) continue;
      pattern[k] = p;
      if (p) have[p] = (have[p] ?? 0) + 1;
      choose(k + 1, emptyUsed + (p ? 0 : 1));
      if (p) have[p]--;
    }
  };
  choose(0, 0);
  if (best) return (best as { arr: string[] }).arr;
  return assignSlotsFewestMoves(slots, current, ids, pos, locked);
}

/**
 * Everything wrong with a saved lineup, as Sleeper would judge it (empty = fine):
 * every expected player must be starting, each in a spot their position can fill,
 * and the forward/midfielder/defender/keeper counts must match the formation, so
 * Sleeper shows forwards, then midfielders, then defenders, then the goalkeeper.
 */
export function lineupProblems(
  starters: string[],
  slots: string[],
  formation: string,
  expected: string[],
  pos: (id: string) => string,
  name: (id: string) => string = (id) => id,
) {
  const problems: string[] = [];
  const ids = starters.filter((s) => s && s !== "0");
  for (const id of expected) if (!ids.includes(id)) problems.push(`${name(id)} is missing from the lineup`);
  for (const id of ids) if (!expected.includes(id)) problems.push(`${name(id)} shouldn't be in the lineup`);
  starters.forEach((id, k) => {
    if (id && id !== "0" && !(SLOT_ELIGIBLE[slots[k]] ?? []).includes(pos(id)))
      problems.push(`${name(id)} is in a spot their position can't fill`);
  });
  if (formationOf(ids, pos) !== formation) problems.push(`the players make a ${formationOf(ids, pos)}, not the saved ${formation}`);
  if (!followsFormation(ids, pos)) problems.push(`${formationOf(ids, pos)} isn't a legal formation`);
  return problems;
}

export function planWindow(i: PlanInput): Plan {
  const now = i.now ?? Date.now();
  const gameOfClub = new Map<string, Game>();
  for (const g of i.games) {
    gameOfClub.set(g.home, g);
    gameOfClub.set(g.away, g);
  }
  const pos = (id: string) => i.playerInfo[id]?.pos ?? "";
  const gameOf = (id: string) => {
    const club = i.playerInfo[id]?.team;
    return club ? gameOfClub.get(club) : undefined;
  };
  const windowIds = new Set(i.window.games.map((g) => g.gameId));
  const inWindow = (id: string) => {
    const g = gameOf(id);
    return !!g && windowIds.has(g.gameId);
  };
  // Confirmed not starting: their game's team sheet is out and they're not in the XI.
  const confirmedOut = (id: string) => {
    const g = gameOf(id);
    return !!g && g.announced && !g.starters.has(id);
  };
  // Locked: their game has kicked off (the league's bench lock).
  const locked = (id: string) => {
    const g = gameOf(id);
    return !!g && (g.start <= now || g.status !== "pre_game");
  };

  const original = [...i.starters];
  let lineup = original.filter((s) => s && s !== "0"); // the starting XI as a set
  const reserve = new Set(i.reserve);
  const bench = new Set(i.players.filter((p) => !lineup.includes(p) && !reserve.has(p)));
  // A replacement must leave a lineup that fits the slots and the formation rules.
  // (If the current lineup already breaks the formation rules, only the slots are required.)
  const startsValid = followsFormation(lineup, pos);
  const valid = (ids: string[]) =>
    (!startsValid || followsFormation(ids, pos)) && assignSlots(i.slots, original, ids, pos, locked) !== null;

  // Starters in this window who aren't in their club's starting XI.
  const needs = i.slots
    .map((slot, idx) => ({ slot, idx, out: original[idx] }))
    .filter((n) => n.out && n.out !== "0" && inWindow(n.out) && confirmedOut(n.out));

  const priorityOf = (id: string): Priority | null => {
    const g = gameOf(id);
    if (!g || locked(id) || confirmedOut(id)) return null; // no game, already started, or confirmed benched
    if (windowIds.has(g.gameId) && g.starters.has(id)) return "A";
    if (g.start > i.window.start && (i.proj.get(id) ?? 0) > 0) return "B";
    return "C";
  };

  const chosen: { out: string; in: string; priority: Priority; proj: number }[] = [];
  const unresolved: Plan["unresolved"] = [];
  for (const n of needs) {
    // Keepers are replaced by keepers; outfield players by any outfield position
    // that keeps the formation legal (the formation changes to match).
    const outfield = pos(n.out) !== "GK";
    const best = [...bench]
      .filter((id) => (outfield ? ["F", "M", "D"].includes(pos(id)) : pos(id) === "GK"))
      .map((id) => ({ id, pr: priorityOf(id), proj: i.proj.get(id) ?? 0 }))
      .filter((c): c is { id: string; pr: Priority; proj: number } => c.pr !== null)
      .sort((a, b) => a.pr.localeCompare(b.pr) || b.proj - a.proj)
      .find((c) => valid(lineup.map((id) => (id === n.out ? c.id : id))));
    if (!best) {
      unresolved.push({ slot: n.slot, out: n.out });
      continue;
    }
    lineup = lineup.map((id) => (id === n.out ? best.id : id));
    bench.delete(best.id);
    bench.add(n.out);
    chosen.push({ out: n.out, in: best.id, priority: best.pr, proj: best.proj });
  }

  // Sleeper accepts a lineup when every player is in a spot their position can
  // fill AND the position counts match the week's saved formation. A lineup that
  // breaks either (with no swaps needed) is repaired as long as it's a legal formation.
  const formationBefore = i.formation ?? formationOf(original.filter((s) => s && s !== "0"), pos);
  const inEligibleSpots = original.every((id, k) => !id || id === "0" || (SLOT_ELIGIBLE[i.slots[k]] ?? []).includes(pos(id)));
  const repaired =
    chosen.length === 0 &&
    followsFormation(lineup, pos) &&
    (!inEligibleSpots || formationOf(lineup, pos) !== formationBefore);
  const newStarters =
    chosen.length || (repaired && !inEligibleSpots) ? (assignSlots(i.slots, original, lineup, pos, locked, new Map(chosen.map((c) => [c.in, c.out]))) ?? original)
      : original;
  const swaps: Swap[] = chosen.map((c) => ({ ...c, slot: i.slots[newStarters.indexOf(c.in)] ?? "" }));
  return {
    windowStart: i.window.start,
    newStarters,
    swaps,
    unresolved,
    formationBefore,
    formationAfter: chosen.length || repaired ? formationOf(newStarters.filter((s) => s && s !== "0"), pos) : formationBefore,
    repaired,
  };
}

// ---------- League context ----------

/** Everything the planner needs that's the same for every member. */
export async function loadContext(now = Date.now()) {
  const [state, league] = await Promise.all([getState(), getLeague()]);
  const week = state.week;
  const games = await getWeekGames(league.season, week);
  const windows = actionableWindows(games, now);
  return { league, week, games, windows };
}

export async function loadPlannerData(season: string, week: number, scoring: Record<string, number>) {
  const [proj, players, rosters] = await Promise.all([
    getWeekProjections(season, week, scoring),
    getPlayers(),
    getRosters(),
  ]);
  return { proj, players, rosters };
}

export const lineupSlots = (rosterPositions: string[]) =>
  rosterPositions.filter((p) => p !== "BN" && p !== "IR" && p !== "TAXI");
