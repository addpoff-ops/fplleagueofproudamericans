import { NextResponse } from "next/server";
import { cronAuthorized, lineupConfigured } from "@/lib/secure";
import { runAll } from "@/lib/lineupRunner";
import { prisma } from "@/lib/db";

export const maxDuration = 60;

/**
 * Called every few minutes by the scheduler (GitHub Actions). Checks every
 * member with Lineup Setter on, for every kickoff window whose team sheets are
 * out. Requires "Authorization: Bearer <CRON_SECRET>".
 */
async function handle(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"))) {
    // Record rejected scheduler calls (secret missing or mismatched) so the
    // status endpoint can tell "not running" apart from "wrong secret".
    if (req.headers.get("authorization")) {
      await prisma.schedulerHeartbeat
        .upsert({
          where: { id: "lineup-setter-rejected" },
          create: { id: "lineup-setter-rejected", lastRunAt: new Date(), lastResult: "rejected: CRON_SECRET did not match" },
          update: { lastRunAt: new Date() },
        })
        .catch(() => {});
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!lineupConfigured()) return NextResponse.json({ error: "LINEUP_SECRET not set" }, { status: 503 });
  let result: Awaited<ReturnType<typeof runAll>> | { error: string };
  try {
    result = await runAll();
  } catch (e) {
    result = { error: e instanceof Error ? e.message : String(e) };
  }
  const summary = "error" in result ? `error: ${result.error}` : `checked ${result.checked} members, ${result.windows} kickoff windows ready`;
  await prisma.schedulerHeartbeat.upsert({
    where: { id: "lineup-setter" },
    create: { id: "lineup-setter", lastRunAt: new Date(), lastResult: summary },
    update: { lastRunAt: new Date(), lastResult: summary },
  });
  return NextResponse.json(result, { status: "error" in result ? 500 : 200 });
}
export const GET = handle;
export const POST = handle;
