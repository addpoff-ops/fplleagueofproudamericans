// Thin client for the public Sleeper API (no auth required).
// Docs: https://docs.sleeper.com

import { PLAYER_OVERRIDES } from "./config";

export const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID ?? "1388351489117810688";
export const SPORT = "clubsoccer:epl";
const BASE = "https://api.sleeper.app/v1";

async function get<T>(path: string, revalidate = 300): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate } });
  if (!res.ok) throw new Error(`Sleeper API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------- Types (only the fields we use) ----------

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  sport: string;
  avatar: string | null;
  draft_id: string;
  previous_league_id: string | null;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: {
    num_teams: number;
    leg: number;
    last_scored_leg: number;
    playoff_teams: number;
    waiver_budget: number;
    [k: string]: number;
  };
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  is_owner?: boolean;
  metadata: { team_name?: string } | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  metadata: { record?: string; streak?: string; formation?: string } | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    ppts?: number;
    ppts_decimal?: number;
    waiver_budget_used?: number;
    waiver_position?: number;
  };
}

export interface SleeperDraftPick {
  pick_no: number;
  round: number;
  draft_slot: number;
  roster_id: number;
  picked_by: string;
  player_id: string;
  metadata: { first_name: string; last_name: string; position: string; team_abbr?: string };
}

export interface SleeperState {
  week: number;
  leg: number;
  season: string;
  display_week: number;
}

interface RawPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  fantasy_positions?: string[] | null;
  team_abbr?: string | null;
  injury_status?: string | null;
  active?: boolean;
  age?: number | null;
  search_rank?: number | null;
  competitions?: string[] | null;
}

export interface Player {
  id: string;
  name: string;
  pos: string; // the player's single Sleeper position: F, M, D, GK
  positions: string[]; // [pos] (multi-position eligibility is off in our league)
  team: string | null; // club abbreviation, e.g. "MCI"
  injury: string | null;
  age: number | null;
  searchRank: number | null; // Sleeper's default ordering, used as a starting point
}

// ---------- Endpoints ----------

export const getLeague = (id = LEAGUE_ID) => get<SleeperLeague>(`/league/${id}`);
export const getUsers = (id = LEAGUE_ID) => get<SleeperUser[]>(`/league/${id}/users`);
export const getRosters = (id = LEAGUE_ID) => get<SleeperRoster[]>(`/league/${id}/rosters`);
export const getState = () => get<SleeperState>(`/state/${SPORT}`);
export interface SleeperTransaction {
  transaction_id: string;
  type: "trade" | "waiver" | "free_agent" | "commissioner";
  status: "complete" | "failed" | "pending";
  created: number;
  leg: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: unknown[] | null;
  waiver_budget: { sender: number; receiver: number; amount: number }[] | null;
}

export const getTransactions = async (leg: number, id = LEAGUE_ID) =>
  (await get<SleeperTransaction[] | null>(`/league/${id}/transactions/${leg}`)) ?? [];

export const getDraftPicks = (draftId: string) =>
  get<SleeperDraftPick[]>(`/draft/${draftId}/picks`, 3600);

type StatLine = Record<string, number>;

/** Season-to-date stat totals per player, e.g. { pos_m_g: 3, pos_m_kp: 12, ... }. */
export const getSeasonStats = async (season: string) =>
  (await get<Record<string, StatLine> | null>(`/stats/${SPORT}/regular/${season}`, 3600)) ?? {};

/** One gameweek's actual stats per player (includes `min`, minutes played). */
export const getWeekStats = async (season: string, week: number) =>
  (await get<Record<string, StatLine> | null>(`/stats/${SPORT}/regular/${season}/${week}`, 3600)) ?? {};

/** Pre-season projections; `adp_std` is the ADP shown in the Sleeper app. */
export const getProjections = async (season: string) =>
  (await get<Record<string, StatLine> | null>(`/projections/${SPORT}/regular/${season}`, 3600)) ?? {};

/**
 * A player's fantasy points under a league's scoring settings. Sleeper's stat
 * keys (pos_f_g, pos_d_cs, ...) match the scoring_settings keys one-to-one,
 * which is how the Sleeper app computes a player's points in a league.
 */
export function scorePoints(stats: StatLine, scoring: Record<string, number>) {
  let pts = 0;
  for (const [k, w] of Object.entries(scoring)) pts += (stats[k] ?? 0) * w;
  return Math.round(pts * 100) / 100;
}

// The full player dump is ~2.3MB, above Next's 2MB fetch-cache limit, so we
// slim it down and keep it in memory instead. Sleeper asks that this endpoint
// be called at most once a day.
let playerCache: { at: number; data: Record<string, Player> } | null = null;
const PLAYER_TTL = 12 * 60 * 60 * 1000;

export async function getPlayers(): Promise<Record<string, Player>> {
  if (playerCache && Date.now() - playerCache.at < PLAYER_TTL) return playerCache.data;
  const res = await fetch(`${BASE}/players/${SPORT}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sleeper players failed: ${res.status}`);
  const raw = (await res.json()) as Record<string, RawPlayer>;
  const data: Record<string, Player> = {};
  for (const p of Object.values(raw)) {
    if (!p.player_id || !p.position) continue;
    // Our league has multi-position eligibility turned off, so each player has
    // exactly one position: Sleeper's `position` (not `fantasy_positions`).
    const positions = [p.position];
    data[p.player_id] = {
      id: p.player_id,
      name: (p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`).trim(),
      pos: positions[0],
      positions,
      team: p.team_abbr ?? null,
      injury: p.injury_status ?? null,
      age: p.age ?? null,
      searchRank: p.search_rank ?? null,
    };
  }
  for (const [id, o] of Object.entries(PLAYER_OVERRIDES)) {
    data[id] = { ...(data[id] ?? { injury: null, age: null, searchRank: null }), id, name: o.name, pos: o.positions[0], positions: o.positions, team: o.team };
  }
  playerCache = { at: Date.now(), data };
  return data;
}

export const avatarUrl = (avatar: string | null | undefined) =>
  avatar ? `https://sleepercdn.com/avatars/thumbs/${avatar}` : null;
