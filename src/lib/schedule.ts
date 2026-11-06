import { prisma } from "./db";
import { decrypt } from "./secure";
import { getMatchupLegs } from "./sleeperAuth";
import { LEAGUE_ID } from "./sleeper";

export interface ScheduledGame {
  week: number;
  home: number; // roster ID
  away: number; // roster ID
}

const CACHE_KEY = "schedule-v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * The league's head-to-head schedule for the given weeks. Sleeper's public API
 * doesn't return matchups for this league, so this reads them through the
 * private API using a member's saved Lineup Setter sign-in, then caches the
 * result for a day. Returns null games if no sign-in is available.
 */
export async function getSchedule(fromWeek: number, toWeek: number) {
  const cached = await prisma.cachedData.findUnique({ where: { key: CACHE_KEY } });
  const fresh = cached && Date.now() - cached.updatedAt.getTime() < MAX_AGE_MS;
  let all = (cached?.value as ScheduledGame[] | undefined) ?? null;

  if (!fresh) {
    const setter = await prisma.lineupSetter.findFirst({ where: { tokenOk: true }, orderBy: { updatedAt: "desc" } });
    if (setter) {
      try {
        all = await fetchSchedule(decrypt(setter.tokenEnc), 1, 38);
        if (all.length) await prisma.cachedData.upsert({ where: { key: CACHE_KEY }, create: { key: CACHE_KEY, value: all as object[] }, update: { value: all as object[] } });
      } catch (e) {
        console.error("Couldn't read the schedule from Sleeper:", e instanceof Error ? e.message : e);
      }
    }
  }
  return all ? all.filter((g) => g.week >= fromWeek && g.week <= toWeek) : null;
}

async function fetchSchedule(token: string, fromWeek: number, toWeek: number): Promise<ScheduledGame[]> {
  const weeks = Array.from({ length: toWeek - fromWeek + 1 }, (_, i) => fromWeek + i);
  const games: ScheduledGame[] = [];
  // A few weeks at a time, to be gentle with Sleeper.
  for (let i = 0; i < weeks.length; i += 6) {
    const batch = await Promise.all(weeks.slice(i, i + 6).map(async (w) => ({ w, legs: await getMatchupLegs(token, LEAGUE_ID, w) })));
    for (const { w, legs } of batch) {
      const byMatchup = new Map<number, number[]>();
      for (const l of legs) {
        if (l.matchup_id == null) continue;
        byMatchup.set(l.matchup_id, [...(byMatchup.get(l.matchup_id) ?? []), l.roster_id]);
      }
      for (const ids of byMatchup.values()) if (ids.length === 2) games.push({ week: w, home: ids[0], away: ids[1] });
    }
  }
  return games;
}
