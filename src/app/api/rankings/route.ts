import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashKey, newEditKey, slugify } from "@/lib/keys";
import { listRankingSets, playerPool } from "@/lib/rankings";

export async function GET() {
  return NextResponse.json(await listRankingSets());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const author = String(body?.author ?? "").trim().slice(0, 40);
  const description = String(body?.description ?? "").trim().slice(0, 500) || null;
  const startFrom = String(body?.startFrom ?? "sleeper");
  if (!name || !author) return NextResponse.json({ error: "Name and author are required." }, { status: 400 });

  const admin = process.env.ADMIN_KEY;
  const isOfficial = Boolean(admin && admin !== "change-me" && body?.adminKey === admin);
  if (body?.adminKey && !isOfficial)
    return NextResponse.json({ error: "Admin key is incorrect." }, { status: 403 });

  // Seed the new list so nobody has to rank 300 players from scratch.
  let seed: string[] = [];
  if (startFrom === "sleeper") {
    seed = (await playerPool()).filter((p) => p.searchRank != null).slice(0, 300).map((p) => p.id);
  } else if (startFrom !== "blank") {
    const src = await prisma.rankingSet.findUnique({
      where: { slug: startFrom },
      include: { entries: { orderBy: { rank: "asc" } } },
    });
    seed = src?.entries.map((e) => e.playerId) ?? [];
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
        entries: { create: seed.map((playerId, i) => ({ playerId, rank: i + 1 })) },
      },
    });
  });
  return NextResponse.json({ slug: created.slug, editKey });
}
