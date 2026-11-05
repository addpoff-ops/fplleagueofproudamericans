import { NextResponse } from "next/server";
import { cronAuthorized, lineupConfigured } from "@/lib/secure";
import { runAll } from "@/lib/lineupRunner";

export const maxDuration = 60;

/**
 * Called every few minutes by the scheduler (GitHub Actions). Checks every
 * member with Lineup Setter on, for every kickoff window whose team sheets are
 * out. Requires "Authorization: Bearer <CRON_SECRET>".
 */
async function handle(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization")))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!lineupConfigured()) return NextResponse.json({ error: "LINEUP_SECRET not set" }, { status: 503 });
  return NextResponse.json(await runAll());
}
export const GET = handle;
export const POST = handle;
