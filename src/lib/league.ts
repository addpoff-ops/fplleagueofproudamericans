import { getLeague, getRosters, getUsers, type SleeperRoster, type SleeperUser } from "./sleeper";

export interface Team {
  rosterId: number;
  ownerId: string | null;
  teamName: string;
  ownerName: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  maxPoints: number;
  record: string;
  streak: string;
  players: string[];
  starters: string[];
  reserve: string[];
  faabUsed: number;
}

const num = (whole = 0, dec = 0) => whole + dec / 100;

export function buildTeam(r: SleeperRoster, users: Map<string, SleeperUser>): Team {
  const u = r.owner_id ? users.get(r.owner_id) : undefined;
  const s = r.settings;
  return {
    rosterId: r.roster_id,
    ownerId: r.owner_id,
    teamName: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
    ownerName: u?.display_name ?? "Unclaimed",
    avatar: u?.avatar ?? null,
    wins: s.wins,
    losses: s.losses,
    ties: s.ties,
    pointsFor: num(s.fpts, s.fpts_decimal),
    pointsAgainst: num(s.fpts_against, s.fpts_against_decimal),
    maxPoints: num(s.ppts, s.ppts_decimal),
    record: r.metadata?.record ?? "",
    streak: r.metadata?.streak ?? "",
    players: r.players ?? [],
    starters: (r.starters ?? []).filter((p) => p && p !== "0"),
    reserve: r.reserve ?? [],
    faabUsed: s.waiver_budget_used ?? 0,
  };
}

/** League + teams sorted into standings order (wins, then points for). */
export async function getLeagueData() {
  const [league, rosters, users] = await Promise.all([getLeague(), getRosters(), getUsers()]);
  const userMap = new Map(users.map((u) => [u.user_id, u]));
  const teams = rosters
    .map((r) => buildTeam(r, userMap))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.pointsFor - a.pointsFor);
  return { league, teams };
}

export { POSITION_ORDER, POSITION_STYLES } from "./positions";
