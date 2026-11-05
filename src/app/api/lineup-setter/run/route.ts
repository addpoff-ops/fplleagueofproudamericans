import { NextResponse } from "next/server";
import { currentSetter } from "@/lib/lineupSession";
import { runOne } from "@/lib/lineupRunner";

export const maxDuration = 60;

/** Check the viewer's lineup now. Body: { dryRun: boolean } (preview = no changes). */
export async function POST(req: Request) {
  const setter = await currentSetter();
  if (!setter) return NextResponse.json({ error: "Connect your Sleeper account first." }, { status: 401 });
  if (!setter.tokenOk) return NextResponse.json({ error: "Your Sleeper sign-in has expired. Reconnect your account." }, { status: 409 });
  const body = await req.json().catch(() => null);
  try {
    return NextResponse.json(await runOne(setter, body?.dryRun !== false));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
