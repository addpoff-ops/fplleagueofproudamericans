// Appends every player at a current Premier League club (EPL_CLUBS) who isn't
// already in the official rankings to the very end of their position's list,
// as tier Z, in Sleeper's default order. Players already ranked are never
// moved or changed. Runs on every deploy (see "vercel-build"), so new
// signings get picked up too.
//
//   npm run complete:official
import { prisma } from "../src/lib/db";
import { playerPool } from "../src/lib/rankings";
import { POSITIONS } from "../src/lib/value";

async function main() {
  const set = await prisma.rankingSet.findFirst({ where: { isOfficial: true }, include: { entries: true } });
  if (!set) return console.log("No official rankings yet, nothing to complete.");

  const ranked = new Set(set.entries.map((e) => e.playerId));
  const pool = await playerPool(); // already in Sleeper's default order
  const rows: { setId: string; playerId: string; pos: string; rank: number; tier: string }[] = [];
  const added: Record<string, number> = {};

  for (const pos of POSITIONS) {
    let rank = Math.max(0, ...set.entries.filter((e) => e.pos === pos).map((e) => e.rank));
    for (const p of pool) {
      if (p.pos !== pos || ranked.has(p.id)) continue;
      rows.push({ setId: set.id, playerId: p.id, pos, rank: ++rank, tier: "Z" });
      added[pos] = (added[pos] ?? 0) + 1;
    }
  }
  if (rows.length) await prisma.rankingEntry.createMany({ data: rows, skipDuplicates: true });
  console.log(`Official rankings: added ${rows.length} players at the end of tier Z`, added);
}

main()
  .catch((e) => {
    // Never fail a deploy over this (e.g. Sleeper briefly unreachable).
    console.warn("Skipped completing the official rankings:", e instanceof Error ? e.message : e);
  })
  .finally(() => prisma.$disconnect());
