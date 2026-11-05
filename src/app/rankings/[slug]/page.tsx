import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEntries, ownershipMap, playerPool } from "@/lib/rankings";
import { getPlayers } from "@/lib/sleeper";
import { POSITIONS, type Pos } from "@/lib/value";
import RankingBoard, { type Sections } from "./RankingBoard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const set = await prisma.rankingSet.findUnique({ where: { slug }, select: { name: true } });
  return { title: set?.name ?? "Rankings" };
}

export default async function RankingSetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const set = await prisma.rankingSet.findUnique({ where: { slug } });
  if (!set) notFound();
  const [entries, pool, owners] = await Promise.all([getEntries({ slug }), playerPool(), ownershipMap()]);

  const sections = Object.fromEntries(POSITIONS.map((p) => [p, []])) as unknown as Sections;
  for (const e of entries ?? []) sections[e.pos as Pos].push({ playerId: e.playerId, tier: e.tier });

  // Include ranked players even if they've since left the EPL-club filter.
  const poolIds = new Set(pool.map((p) => p.id));
  const all = await getPlayers();
  const extra = (entries ?? []).filter((e) => !poolIds.has(e.playerId) && all[e.playerId]).map((e) => all[e.playerId]);

  return (
    <RankingBoard
      set={{
        slug: set.slug,
        name: set.name,
        author: set.author,
        description: set.description,
        isOfficial: set.isOfficial,
        updatedAt: set.updatedAt.toISOString(),
      }}
      initialSections={sections}
      pool={[...pool, ...extra].map(({ id, name, pos, positions, team, injury }) => ({ id, name, pos, positions, team, injury }))}
      owners={owners}
    />
  );
}
