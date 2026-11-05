import { cookies } from "next/headers";
import { prisma } from "./db";
import { SESSION_COOKIE, signSession, verifySession } from "./secure";

/** The Lineup Setter record for whoever is viewing (via their signed cookie). */
export async function currentSetter() {
  const id = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return id ? prisma.lineupSetter.findUnique({ where: { sleeperUserId: id } }) : null;
}

export async function setSessionCookie(sleeperUserId: string) {
  (await cookies()).set(SESSION_COOKIE, signSession(sleeperUserId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
