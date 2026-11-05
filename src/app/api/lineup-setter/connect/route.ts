import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRosters, getUsers } from "@/lib/sleeper";
import { encrypt, lineupConfigured } from "@/lib/secure";
import { me, SleeperAuthError } from "@/lib/sleeperAuth";
import { setSessionCookie } from "@/lib/lineupSession";

/**
 * Connect a Sleeper account. Body: { token } (the member's Sleeper session
 * token, copied from sleeper.com). It's stored encrypted.
 */
export async function POST(req: Request) {
  if (!lineupConfigured())
    return NextResponse.json({ error: "Lineup Setter isn't set up on this site yet (missing LINEUP_SECRET)." }, { status: 503 });
  const body = await req.json().catch(() => null);

  const token = typeof body?.token === "string" ? body.token.trim().replace(/^"|"$/g, "") : "";
  if (!token) return NextResponse.json({ error: "Paste your Sleeper sign-in token." }, { status: 400 });

  try {
    const user = await me(token);
    const [rosters, users] = await Promise.all([getRosters(), getUsers()]);
    const roster = rosters.find((r) => r.owner_id === user.user_id || r.co_owners?.includes(user.user_id));
    if (!roster)
      return NextResponse.json({ error: `@${user.display_name} doesn't manage a team in this league.` }, { status: 403 });
    const teamName = users.find((u) => u.user_id === roster.owner_id)?.metadata?.team_name;

    await prisma.lineupSetter.upsert({
      where: { sleeperUserId: user.user_id },
      create: { sleeperUserId: user.user_id, displayName: user.display_name, rosterId: roster.roster_id, tokenEnc: encrypt(token) },
      update: { displayName: user.display_name, rosterId: roster.roster_id, tokenEnc: encrypt(token), tokenOk: true },
    });
    await setSessionCookie(user.user_id);
    return NextResponse.json({ ok: true, displayName: user.display_name, teamName: teamName ?? null });
  } catch (e) {
    const msg = e instanceof SleeperAuthError ? "That token didn't work. Copy a fresh one from sleeper.com and try again." : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
