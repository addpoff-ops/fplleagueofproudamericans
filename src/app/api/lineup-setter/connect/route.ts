import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRosters, getUsers } from "@/lib/sleeper";
import { encrypt, lineupConfigured } from "@/lib/secure";
import { login, me, SleeperAuthError } from "@/lib/sleeperAuth";
import { setSessionCookie } from "@/lib/lineupSession";

/**
 * Connect a Sleeper account. Body: { identifier, password } or { token }.
 * The password is passed to Sleeper once and never stored; only the resulting
 * session token is kept, encrypted.
 */
export async function POST(req: Request) {
  if (!lineupConfigured())
    return NextResponse.json({ error: "Lineup Setter isn't set up on this site yet (missing LINEUP_SECRET)." }, { status: 503 });
  const body = await req.json().catch(() => null);

  let token: string | null = typeof body?.token === "string" ? body.token.trim().replace(/^"|"$/g, "") : null;
  if (!token) {
    const identifier = String(body?.identifier ?? "").trim();
    const password = String(body?.password ?? "");
    if (!identifier || !password) return NextResponse.json({ error: "Enter your Sleeper username and password." }, { status: 400 });
    const result = await login(identifier, password);
    if (!result.ok) return NextResponse.json({ error: result.message, reason: result.reason }, { status: 401 });
    token = result.token;
  }

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
    const msg = e instanceof SleeperAuthError ? "That Sleeper sign-in didn't work. Please try again." : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
