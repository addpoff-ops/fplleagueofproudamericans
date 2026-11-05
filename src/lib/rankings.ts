import { prisma } from "./db";
import { getLeagueData } from "./league";
import { getPlayers, type Player } from "./sleeper";
import { EPL_CLUBS } from "./config";
import { tierValue, type Pos, type RankedEntry, type Tier } from "./value";

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
