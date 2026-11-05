import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ownershipMap, playerPool } from "@/lib/rankings";
import RankingBoard from "./RankingBoard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const set = await prisma.rankingSet.findUnique({ where: { slug }, select: { name: true } });
  return { title: set?.name ?? "Rankings" };
}

export default async function RankingSetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const set = await prisma.rankingSet.findUnique({
    where: { slug },
    include: { entries: { orderBy: { rank: "asc" }, select: { playerId: true } } },
  });
  if (!set) notFound();
  const [pool, owners] = await Promise.all([playerPool(), ownershipMap()]);

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
      initialIds={set.entries.map((e) => e.playerId)}
      pool={pool.map(({ id, name, pos, team, injury }) => ({ id, name, pos, team, injury }))}
      owners={owners}
    />
  );
}
