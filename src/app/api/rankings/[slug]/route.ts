import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEdit } from "@/lib/keys";
import { AVERAGE_SLUG, averageEntries, getEntries, POINTS_SLUG, pointsEntries } from "@/lib/rankings";
import { isPos, isTier } from "@/lib/value";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (slug === AVERAGE_SLUG)
    return NextResponse.json({ slug, name: "Average of all rankings", entries: await averageEntries() });
  if (slug === POINTS_SLUG)
    return NextResponse.json({ slug, name: "Total Points", entries: await pointsEntries() });
  const set = await prisma.rankingSet.findUnique({
    where: { slug },
    select: { slug: true, name: true, author: true, description: true, isOfficial: true, updatedAt: true },
  });
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...set, entries: await getEntries({ slug }) });
}

async function authorize(req: Request, slug: string) {
  const set = await prisma.rankingSet.findUnique({ where: { slug } });
  if (!set) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!(await canEdit(req.headers.get("x-edit-key"), set.editKeyHash)))
    return { error: NextResponse.json({ error: "Invalid edit key" }, { status: 403 }) };
  return { set };
}

/**
 * Replace the whole list.
 * Body: { sections: { F: [{ playerId, tier }], M: [...], D: [...], GK: [...] } }
 * Array order is the rank within each position.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const { set, error } = await authorize(req, slug);
  if (error) return error;
  const body = await req.json().catch(() => null);
  const sections = body?.sections;
  if (!sections || typeof sections !== "object")
    return NextResponse.json({ error: "Body must be { sections: { F, M, D, GK } }" }, { status: 400 });

  const rows: { setId: string; playerId: string; pos: string; rank: number; tier: string }[] = [];
  const seen = new Set<string>();
  for (const [pos, list] of Object.entries(sections)) {
    if (!isPos(pos) || !Array.isArray(list) || list.length > 500)
      return NextResponse.json({ error: `Invalid section ${pos}` }, { status: 400 });
    for (const item of list) {
      const playerId = item?.playerId;
      if (typeof playerId !== "string" || !isTier(item?.tier))
        return NextResponse.json({ error: "Each entry needs a playerId and a tier (S, A–F, or Z)" }, { status: 400 });
      if (seen.has(playerId)) continue; // a player can only be ranked in one section
      seen.add(playerId);
      rows.push({ setId: set.id, playerId, pos, rank: rows.filter((r) => r.pos === pos).length + 1, tier: item.tier });
    }
  }

  await prisma.$transaction([
    prisma.rankingEntry.deleteMany({ where: { setId: set.id } }),
    prisma.rankingEntry.createMany({ data: rows }),
    prisma.rankingSet.update({ where: { id: set.id }, data: { updatedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true, count: rows.length });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const { set, error } = await authorize(req, slug);
  if (error) return error;
  // The official list drives defaults, tiers for new lists and the Total Points views.
  if (set.isOfficial)
    return NextResponse.json({ error: "The official list can't be deleted. Make another list official first." }, { status: 409 });
  await prisma.rankingSet.delete({ where: { id: set.id } });
  return NextResponse.json({ ok: true });
}
