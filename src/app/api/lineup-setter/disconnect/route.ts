import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clearSessionCookie, currentSetter } from "@/lib/lineupSession";

/** Delete the stored Sleeper token and history for the viewer. */
export async function POST() {
  const setter = await currentSetter();
  if (setter) await prisma.lineupSetter.delete({ where: { id: setter.id } });
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
