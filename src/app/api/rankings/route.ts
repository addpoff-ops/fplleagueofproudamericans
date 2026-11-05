import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashKey, newEditKey, slugify } from "@/lib/keys";
import { getEntries, listRankingSets, playerPool } from "@/lib/rankings";
import { POSITIONS, type Tier } from "@/lib/value";

export async function GET() {
  return NextResponse.json(await listRankingSets());
}

/** How many players per position a list seeded from Sleeper's order starts with. */
const SEED_SIZE = { F: 50, M: 75, D: 75, GK: 20 } as const;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const author = String(body?.author ?? "").trim().slice(0, 40);
  const description = String(body?.description ?? "").trim().slice(0, 500) || null;
  const startFrom = String(body?.startFrom ?? "sleeper");
  if (!name || !author) return NextResponse.json({ error: "Name and author are required." }, { status: 400 });

  const admin = process.env.ADMIN_KEY;
  const isOfficial = Boolean(admin && admin !== "change-me" && body?.adminKey === admin);
  if (body?.adminKey && !isOfficial) return NextResponse.json({ error: "Admin key is incorrect." }, { status: 403 });

  // Seed the new list so nobody has to rank 200+ players from scratch.
  let seed: { playerId: string; pos: string; rank: number; tier: string }[] = [];
  if (startFrom === "sleeper") {
    // Sleeper's order, with tiers borrowed rank-for-rank from the official list.
    const [pool, official] = await Promise.all([playerPool(), getEntries({ isOfficial: true })]);
    for (const pos of POSITIONS) {
      const officialTiers = (official ?? []).filter((e) => e.pos === pos).map((e) => e.tier);
      pool
        .filter((p) => p.pos === pos && p.searchRank != null)
        .slice(0, SEED_SIZE[pos])
        .forEach((p, i) => seed.push({ playerId: p.id, pos, rank: i + 1, tier: officialTiers[i] ?? ("Z" satisfies Tier) }));
    }
  } else if (startFrom !== "blank") {
    seed = (await getEntries({ slug: startFrom })) ?? [];
  }

  const editKey = newEditKey();
  const created = await prisma.$transaction(async (tx) => {
    if (isOfficial) await tx.rankingSet.updateMany({ where: { isOfficial: true }, data: { isOfficial: false } });
    return tx.rankingSet.create({
      data: {
        slug: slugify(name),
        name,
        author,
        description,
        isOfficial,
        editKeyHash: await hashKey(editKey),
        entries: { create: seed.map(({ playerId, pos, rank, tier }) => ({ playerId, pos, rank, tier })) },
      },
    });
  });
  return NextResponse.json({ slug: created.slug, editKey });
}
