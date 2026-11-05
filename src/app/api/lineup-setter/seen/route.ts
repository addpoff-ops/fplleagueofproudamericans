import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentSetter } from "@/lib/lineupSession";

/** Mark the viewer's lineup notifications as read. */
export async function POST() {
  const setter = await currentSetter();
  if (setter) await prisma.lineupRun.updateMany({ where: { setterId: setter.id, seen: false }, data: { seen: true } });
  return NextResponse.json({ ok: true });
}
