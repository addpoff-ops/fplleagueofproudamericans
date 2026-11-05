import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEdit } from "@/lib/keys";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const set = await prisma.rankingSet.findUnique({
    where: { slug },
    include: { entries: { orderBy: { rank: "asc" }, select: { playerId: true, rank: true, tier: true } } },
  });
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { editKeyHash: _omit, ...pub } = set;
  void _omit;
  return NextResponse.json(pub);
}

async function authorize(req: Request, slug: string) {
  const set = await prisma.rankingSet.findUnique({ where: { slug } });
  if (!set) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!(await canEdit(req.headers.get("x-edit-key"), set.editKeyHash)))
    return { error: NextResponse.json({ error: "Invalid edit key" }, { status: 403 }) };
  return { set };
}

/** Replace the full ordered list. Body: { playerIds: string[], name?, description? } */
export async function PUT(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const { set, error } = await authorize(req, slug);
  if (error) return error;
  const body = await req.json().catch(() => null);
  const ids: unknown = body?.playerIds;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string") || ids.length > 2000)
    return NextResponse.json({ error: "playerIds must be an array of strings" }, { status: 400 });
  const unique = [...new Set(ids as string[])];

  await prisma.$transaction([
    prisma.rankingEntry.deleteMany({ where: { setId: set.id } }),
    prisma.rankingEntry.createMany({ data: unique.map((playerId, i) => ({ setId: set.id, playerId, rank: i + 1 })) }),
    prisma.rankingSet.update({
      where: { id: set.id },
      data: {
        ...(body?.name ? { name: String(body.name).slice(0, 80) } : {}),
        ...(body?.description !== undefined ? { description: String(body.description).slice(0, 500) || null } : {}),
      },
    }),
  ]);
  return NextResponse.json({ ok: true, count: unique.length });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const { set, error } = await authorize(req, slug);
  if (error) return error;
  await prisma.rankingSet.delete({ where: { id: set.id } });
  return NextResponse.json({ ok: true });
}
