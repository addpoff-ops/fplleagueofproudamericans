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
  formationBefore: string; // e.g. "4-4-2" (DEF-MID-FWD)
  formationAfter: string;
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
 * Where each slot shows in Sleeper's lineup, top to bottom: forwards first, then
 * midfielders, defenders and the goalkeeper, with each flex spot shown among the
 * group it sits beside (F/M by the forwards, M/D by the midfielders, F/M/D by the
 * defenders).
 */
const SLOT_DISPLAY_RANK: Record<string, number> = { F: 0, FM_FLEX: 1, M: 2, MD_FLEX: 3, D: 4, FMD_FLEX: 5, GK: 6 };
const POSITION_RANK: Record<string, number> = { F: 0, M: 1, D: 2, GK: 3 };

/**
 * Put the starters into lineup slots so every player sits in a slot their
 * position is eligible for, and so that, as shown in Sleeper, forwards sit above
 * midfielders, above defenders, above the goalkeeper (as far as the slots allow).
 * Locked players (their game has kicked off) keep their current slot; among
 * equally good arrangements, the one that moves the fewest players wins.
 * Returns null if no valid arrangement exists.
 */
export function assignSlots(
  slots: string[],
  current: string[], // current slot-ordered starters ("0" = empty)
  ids: string[], // the starters to place
  pos: (id: string) => string,
  locked: (id: string) => boolean = () => false,
): string[] | null {
  const need: Record<string, number> = {};
  for (const id of ids) need[pos(id)] = (need[pos(id)] ?? 0) + 1;
  const lockedAt = slots.map((_, k) => {
    const id = current[k];
    return id && id !== "0" && ids.includes(id) && locked(id) ? id : null;
  });
  const empties = slots.length - ids.length;
  if (empties < 0) return null;

  // 1) Choose which position fills each slot ("" = left empty).
  let best: { pattern: string[]; cost: number; result: string[]; moves: number } | null = null;
  const pattern: string[] = [];
  const have: Record<string, number> = {};
  const choose = (k: number, emptyUsed: number) => {
    if (k === slots.length) {
      if (Object.keys(need).some((p) => (have[p] ?? 0) !== need[p])) return;
      // Out-of-order pairs as displayed (a lower position shown above a higher one).
      const shown = slots
        .map((slot, j) => ({ r: SLOT_DISPLAY_RANK[slot] ?? 9, p: POSITION_RANK[pattern[j]] }))
        .filter((x) => x.p !== undefined)
        .sort((x, y) => x.r - y.r);
      let cost = 0;
      for (let x = 0; x < shown.length; x++) for (let y = x + 1; y < shown.length; y++) if (shown[x].p > shown[y].p && shown[x].r < shown[y].r) cost++;
      // 2) Fill the pattern with players, keeping everyone who can stay put.
      const result = slots.map((_, j) => lockedAt[j] ?? "0");
      const placed = new Set(result.filter((id) => id !== "0"));
      slots.forEach((_, j) => {
        const id = current[j];
        if (result[j] === "0" && id && id !== "0" && ids.includes(id) && !placed.has(id) && pos(id) === pattern[j]) {
          result[j] = id;
          placed.add(id);
        }
      });
      const rest = ids.filter((id) => !placed.has(id));
      slots.forEach((_, j) => {
        if (result[j] !== "0" || !pattern[j]) return;
        const at = rest.findIndex((id) => pos(id) === pattern[j]);
        result[j] = rest.splice(at, 1)[0];
      });
      const moves = result.filter((id, j) => id !== current[j]).length;
      if (!best || cost < best.cost || (cost === best.cost && moves < best.moves)) best = { pattern: [...pattern], cost, result, moves };
      return;
    }
    const lockedId = lockedAt[k];
    const options = lockedId ? [pos(lockedId)] : [...(SLOT_ELIGIBLE[slots[k]] ?? []), ...(emptyUsed < empties ? [""] : [])];
    for (const p of options) {
      if (!(SLOT_ELIGIBLE[slots[k]] ?? []).includes(p) && p !== "") continue;
      if (p && (have[p] ?? 0) >= (need[p] ?? 0)) continue;
      pattern[k] = p;
      if (p) have[p] = (have[p] ?? 0) + 1;
      choose(k + 1, emptyUsed + (p ? 0 : 1));
      if (p) have[p]--;
    }
  };
  choose(0, 0);
  return best ? (best as { result: string[] }).result : null;
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

  const newStarters = chosen.length ? (assignSlots(i.slots, original, lineup, pos, locked) ?? original) : original;
  const swaps: Swap[] = chosen.map((c) => ({ ...c, slot: i.slots[newStarters.indexOf(c.in)] ?? "" }));
  return {
    windowStart: i.window.start,
    newStarters,
    swaps,
    unresolved,
    formationBefore: formationOf(original.filter((s) => s && s !== "0"), pos),
    formationAfter: formationOf(newStarters.filter((s) => s && s !== "0"), pos),
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
