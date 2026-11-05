import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentSetter } from "@/lib/lineupSession";

/** Turn Lineup Setter on or off. Body: { enabled: boolean } */
export async function POST(req: Request) {
  const setter = await currentSetter();
  if (!setter) return NextResponse.json({ error: "Connect your Sleeper account first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const enabled = Boolean(body?.enabled);
  if (enabled && !setter.tokenOk)
    return NextResponse.json({ error: "Your Sleeper sign-in has expired. Reconnect your account first." }, { status: 409 });
  await prisma.lineupSetter.update({ where: { id: setter.id }, data: { enabled } });
  return NextResponse.json({ ok: true, enabled });
}
