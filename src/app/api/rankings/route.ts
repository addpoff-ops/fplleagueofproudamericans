import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashKey, newEditKey, slugify } from "@/lib/keys";
import { getEntries, listRankingSets, seedFromAdp, seedFromPoints } from "@/lib/rankings";

export async function GET() {
  return NextResponse.json(await listRankingSets());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const author = String(body?.author ?? "").trim().slice(0, 40);
  const description = String(body?.description ?? "").trim().slice(0, 500) || null;
  const startFrom = String(body?.startFrom ?? "official");
  if (!name || !author) return NextResponse.json({ error: "Name and author are required." }, { status: 400 });

  const admin = process.env.ADMIN_KEY;
  const isOfficial = Boolean(admin && admin !== "change-me" && body?.adminKey === admin);
  if (body?.adminKey && !isOfficial) return NextResponse.json({ error: "Admin key is incorrect." }, { status: 403 });

  // Start from a copy of an existing list (the official one by default),
  // Sleeper's pre-season ADP, or this season's total points.
  let seed: { playerId: string; pos: string; rank: number; tier: string }[] = [];
  if (startFrom === "sleeper-adp") seed = await seedFromAdp();
  else if (startFrom === "total-points") seed = await seedFromPoints();
  else if (startFrom === "official") seed = (await getEntries({ isOfficial: true })) ?? [];
  else seed = (await getEntries({ slug: startFrom })) ?? [];

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
