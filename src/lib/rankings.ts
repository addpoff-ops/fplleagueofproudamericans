import { prisma } from "./db";
import { getLeagueData } from "./league";
import { getLeague, getPlayers, getProjections, getSeasonStats, scorePoints, type Player } from "./sleeper";
import { EPL_CLUBS } from "./config";
import { POSITIONS, tierValue, type Pos, type RankedEntry, type Tier } from "./value";

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
 * official list keep its position (e.g. Saka is a MID there, though Sleeper
 * lists him as FWD); everyone else uses their primary Sleeper position. Tiers
 * are borrowed rank-for-rank from
 * the official list (the official FWD #3's tier goes to this list's FWD #3);
 * ranks beyond the official list get Z.
 */
async function seedFromOrder(order: Player[]): Promise<SeedEntry[]> {
  const official = (await getEntries({ isOfficial: true })) ?? [];
  const officialPos = new Map(official.map((e) => [e.playerId, e.pos]));
  const posOf = (p: Player) => officialPos.get(p.id) ?? p.pos;
  const out: SeedEntry[] = [];
  for (const pos of POSITIONS) {
    const tiers = official.filter((e) => e.pos === pos).map((e) => e.tier);
    order
      .filter((p) => posOf(p) === pos)
      .slice(0, SEED_SIZE[pos])
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

/** This season's total fantasy points under the league's scoring (highest first). */
export async function seedFromPoints(): Promise<SeedEntry[]> {
  const league = await getLeague();
  const [pool, stats] = await Promise.all([playerPool(), getSeasonStats(league.season)]);
  const pts = new Map(pool.filter((p) => stats[p.id]).map((p) => [p.id, scorePoints(stats[p.id], league.scoring_settings)]));
  return seedFromOrder(pool.filter((p) => pts.has(p.id)).sort((a, b) => pts.get(b.id)! - pts.get(a.id)!));
}
