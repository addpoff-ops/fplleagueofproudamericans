import { prisma } from "./db";
import { getLeagueData } from "./league";
import { getLeague, getPlayers, getProjections, getSeasonStats, scorePoints, type Player } from "./sleeper";
import { EPL_CLUBS } from "./config";
import { isPos, isTier, POSITIONS, SHEET_TIER_VALUES, TIERS, toTradeValue, tierValue, type Pos, type RankedEntry, type Tier } from "./value";

export async function listRankingSets() {
  const sets = await prisma.rankingSet.findMany({
    orderBy: [{ isOfficial: "desc" }, { updatedAt: "desc" }],
    select: {
      slug: true,
      name: true,
      author: true,
      description: true,
      isOfficial: true,
      updatedAt: true,
      _count: { select: { entries: true } },
    },
  });
  return sets.map(({ _count, updatedAt, ...s }) => ({ ...s, updatedAt: updatedAt.toISOString(), count: _count.entries }));
}
export type RankingSetSummary = Awaited<ReturnType<typeof listRankingSets>>[number];

/** Entries of a set (or the official set) in position/rank order, with values. */
export async function getEntries(where: { slug: string } | { isOfficial: true }): Promise<RankedEntry[] | null> {
  const set = await prisma.rankingSet.findFirst({
    where,
    include: { entries: { orderBy: [{ pos: "asc" }, { rank: "asc" }] } },
  });
  if (!set) return null;
  return set.entries.map((e) => ({
    playerId: e.playerId,
    pos: e.pos as Pos,
    rank: e.rank,
    tier: e.tier as Tier,
    value: tierValue(e.pos, e.tier),
  }));
}

/** Players at current Premier League clubs, in Sleeper's default order. */
export async function playerPool(): Promise<Player[]> {
  const players = await getPlayers();
  return Object.values(players)
    .filter((p) => ["GK", "D", "M", "F"].includes(p.pos) && p.team != null && EPL_CLUBS.has(p.team))
    .sort((a, b) => (a.searchRank ?? 1e9) - (b.searchRank ?? 1e9) || a.name.localeCompare(b.name));
}

/** playerId → fantasy team name, for showing who rosters each player. */
export async function ownershipMap(): Promise<Record<string, string>> {
  const { teams } = await getLeagueData();
  const out: Record<string, string> = {};
  for (const t of teams) for (const p of t.players) out[p] = t.teamName;
  return out;
}

/** How many players per position a list seeded from Sleeper data starts with. */
const SEED_SIZE: Record<Pos, number> = { F: 50, M: 75, D: 75, GK: 20 };

export type SeedEntry = { playerId: string; pos: Pos; rank: number; tier: Tier };

/**
 * Turn a best-first ordering of players into a positional list. Players in the
 * official list keep its position; everyone else uses their single Sleeper
 * position (multi-position eligibility is off in our league). Tiers
 * are borrowed rank-for-rank from
 * the official list (the official FWD #3's tier goes to this list's FWD #3);
 * ranks beyond the official list get Z.
 */
async function seedFromOrder(order: Player[], limit: Record<Pos, number> = SEED_SIZE): Promise<SeedEntry[]> {
  const official = (await getEntries({ isOfficial: true })) ?? [];
  const officialPos = new Map(official.map((e) => [e.playerId, e.pos]));
  const posOf = (p: Player) => officialPos.get(p.id) ?? p.pos;
  const out: SeedEntry[] = [];
  for (const pos of POSITIONS) {
    const tiers = official.filter((e) => e.pos === pos).map((e) => e.tier);
    order
      .filter((p) => posOf(p) === pos)
      .slice(0, limit[pos])
      .forEach((p, i) => out.push({ playerId: p.id, pos, rank: i + 1, tier: tiers[i] ?? "Z" }));
  }
  return out;
}

/** Sleeper's pre-season ADP (lowest first). */
export async function seedFromAdp(): Promise<SeedEntry[]> {
  const league = await getLeague();
  const [pool, proj] = await Promise.all([playerPool(), getProjections(league.season)]);
  const adp = (id: string) => proj[id]?.adp_std ?? Infinity;
  return seedFromOrder(pool.filter((p) => Number.isFinite(adp(p.id))).sort((a, b) => adp(a.id) - adp(b.id)));
}

/** Players with points this season, ordered by total fantasy points under the league's scoring. */
async function pointsOrder() {
  const league = await getLeague();
  const [pool, stats] = await Promise.all([playerPool(), getSeasonStats(league.season)]);
  const pts = new Map(pool.filter((p) => stats[p.id]).map((p) => [p.id, scorePoints(stats[p.id], league.scoring_settings)]));
  return { order: pool.filter((p) => pts.has(p.id)).sort((a, b) => pts.get(b.id)! - pts.get(a.id)!), pts };
}

/** This season's total fantasy points under the league's scoring (highest first). */
export async function seedFromPoints(): Promise<SeedEntry[]> {
  return seedFromOrder((await pointsOrder()).order);
}

/**
 * Player values from the "Total Points" ordering (as on Create your rankings),
 * but covering every player with points this season, valued with the original
 * sheet values. Used by Power Rankings' "Total Points" view.
 */
export async function pointsValues() {
  const { order, pts } = await pointsOrder();
  const all = { F: Infinity, M: Infinity, D: Infinity, GK: Infinity };
  const values = new Map<string, ConsensusValue>();
  for (const e of await seedFromOrder(order, all)) {
    const v = SHEET_TIER_VALUES[e.pos][e.tier];
    values.set(e.playerId, { pos: e.pos, tier: e.tier, pts: v, exact: v, lists: 1, rank: e.rank, seasonPts: pts.get(e.playerId) });
  }
  return values;
}

export interface ConsensusValue {
  pos: Pos; // official list's position, else the most common across lists
  tier: Tier; // tier whose value is closest to the average
  pts: number; // average original-sheet value across the lists that rank the player (rounded)
  exact: number; // the same average, unrounded
  lists: number; // how many lists rank the player
  rank?: number; // positional rank (Total Points view)
  seasonPts?: number; // season fantasy points (Total Points view)
}

/**
 * Consensus player values across every rankings list on the site, using the
 * original spreadsheet values (SHEET_TIER_VALUES). A list that doesn't rank a
 * player is left out of that player's average rather than counted as 0.
 */
export async function consensusValues(opts: { updatedWithinDays?: number } = {}) {
  const since = opts.updatedWithinDays ? new Date(Date.now() - opts.updatedWithinDays * 86_400_000) : undefined;
  const sets = await prisma.rankingSet.findMany({
    // Optionally only lists saved recently (Power Rankings uses the last 3 days).
    where: since ? { updatedAt: { gte: since } } : undefined,
    select: { isOfficial: true, entries: { select: { playerId: true, pos: true, tier: true } } },
  });
  const byPlayer = new Map<string, { pos: Pos; tier: Tier }[]>();
  const officialPos = new Map<string, Pos>();
  for (const s of sets)
    for (const e of s.entries) {
      if (!isPos(e.pos) || !isTier(e.tier)) continue;
      byPlayer.set(e.playerId, [...(byPlayer.get(e.playerId) ?? []), { pos: e.pos, tier: e.tier }]);
      if (s.isOfficial) officialPos.set(e.playerId, e.pos);
    }

  const values = new Map<string, ConsensusValue>();
  for (const [id, rows] of byPlayer) {
    const exact = rows.reduce((sum, r) => sum + SHEET_TIER_VALUES[r.pos][r.tier], 0) / rows.length;
    const pts = Math.round(exact);
    const counts = new Map<Pos, number>();
    for (const r of rows) counts.set(r.pos, (counts.get(r.pos) ?? 0) + 1);
    const pos = officialPos.get(id) ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const tier = TIERS.reduce((best, t) =>
      Math.abs(SHEET_TIER_VALUES[pos][t] - pts) < Math.abs(SHEET_TIER_VALUES[pos][best] - pts) ? t : best,
    );
    values.set(id, { pos, tier, pts, exact, lists: rows.length });
  }
  return { values, listCount: sets.length };
}

/** Slug the trade calculator uses for "Average of all rankings". */
export const AVERAGE_SLUG = "average";

/** Consensus values as trade-calculator entries (trade value of the average sheet value). */
export async function averageEntries(): Promise<RankedEntry[]> {
  const { values } = await consensusValues();
  const list = [...values.entries()].map(([playerId, v]) => ({ playerId, ...v }));
  const out: RankedEntry[] = [];
  for (const pos of POSITIONS) {
    list
      .filter((v) => v.pos === pos)
      .sort((a, b) => b.exact - a.exact)
      .forEach((v, i) =>
        out.push({ playerId: v.playerId, pos, rank: i + 1, tier: v.tier, value: toTradeValue(v.exact) }),
      );
  }
  return out;
}

/** Slug the trade calculator uses for the "Total Points" option. */
export const POINTS_SLUG = "total-points";

/** Total Points values as trade-calculator entries (trade value of each sheet value). */
export async function pointsEntries(): Promise<RankedEntry[]> {
  const values = await pointsValues();
  return [...values.entries()]
    .map(([playerId, v]) => ({ playerId, pos: v.pos, rank: v.rank!, tier: v.tier, value: toTradeValue(v.pts) }))
    .sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || a.rank - b.rank);
}

/** Each team's Power Rankings total (Site rankings view): the sum of its players' consensus values. */
export async function teamPowerTotals(teams: { rosterId: number; players: string[] }[]) {
  const { values } = await consensusValues();
  return new Map(teams.map((t) => [t.rosterId, t.players.reduce((s, id) => s + (values.get(id)?.pts ?? 0), 0)]));
}
