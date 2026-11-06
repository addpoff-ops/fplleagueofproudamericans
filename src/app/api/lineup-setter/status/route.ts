import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public: when the automatic scheduler last ran (no personal data). */
export async function GET() {
  const [hb, rejected] = await Promise.all([
    prisma.schedulerHeartbeat.findUnique({ where: { id: "lineup-setter" } }),
    prisma.schedulerHeartbeat.findUnique({ where: { id: "lineup-setter-rejected" } }),
  ]);
  return NextResponse.json({
    lastRunAt: hb?.lastRunAt.toISOString() ?? null,
    minutesAgo: hb ? Math.round((Date.now() - hb.lastRunAt.getTime()) / 60000) : null,
    lastResult: hb?.lastResult ?? null,
    lastRejectedAt: rejected?.lastRunAt.toISOString() ?? null,
  });
}
