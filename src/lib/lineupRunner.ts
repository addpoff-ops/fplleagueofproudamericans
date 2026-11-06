import type { LineupSetter } from "@prisma/client";
import { prisma } from "./db";
import { decrypt } from "./secure";
import { getMatchupLegs, SleeperAuthError, updateMatchupLeg } from "./sleeperAuth";
import { lineupSlots, loadContext, loadPlannerData, planWindow, PRIORITY_LABEL, type Plan } from "./lineup";

type Ctx = Awaited<ReturnType<typeof loadContext>>;
type Data = Awaited<ReturnType<typeof loadPlannerData>>;

export interface WindowResult {
  windowStart: number;
  status: "changed" | "no_change" | "unresolved" | "error" | "preview";
  message: string;
  plan?: Plan;
}

const name = (data: Data, id: string) => data.players[id]?.name ?? `Player ${id}`;

function describe(plan: Plan, data: Data) {
  const parts = plan.swaps.map(
    (s) => `Benched ${name(data, s.out)} (not in the starting XI), started ${name(data, s.in)} (${PRIORITY_LABEL[s.priority]})`,
  );
  if (plan.swaps.length && plan.formationAfter !== plan.formationBefore)
    parts.push(`Formation changed from ${plan.formationBefore} to ${plan.formationAfter}`);
  for (const u of plan.unresolved) parts.push(`${name(data, u.out)} isn't starting, but no eligible replacement was available`);
  return parts.join(". ") + ".";
}

/**
 * Check one member's lineup for every kickoff window whose team sheets are out,
 * and apply changes (unless dryRun). Returns what happened per window.
 */
export async function runForSetter(
  setter: LineupSetter,
  ctx: Ctx,
  data: Data,
  opts: { dryRun?: boolean } = {},
): Promise<WindowResult[]> {
  if (ctx.windows.length === 0) return [];
  const token = decrypt(setter.tokenEnc);
  const leagueId = ctx.league.league_id;
  const results: WindowResult[] = [];

  try {
    const legs = await getMatchupLegs(token, leagueId, ctx.week);
    const leg = legs.find((l) => l.roster_id === setter.rosterId);
    if (!leg?.starters) throw new Error(`Couldn't find your GW${ctx.week} lineup on Sleeper.`);
    let starters = leg.starters;
    const roster = data.rosters.find((r) => r.roster_id === setter.rosterId);

    for (const window of ctx.windows) {
      const plan = planWindow({
        slots: lineupSlots(ctx.league.roster_positions),
        starters,
        players: leg.players ?? roster?.players ?? [],
        reserve: roster?.reserve ?? [],
        games: ctx.games,
        window,
        proj: data.proj,
        playerInfo: data.players,
      });

      if (plan.swaps.length === 0 && plan.unresolved.length === 0) {
        results.push({ windowStart: window.start, status: "no_change", message: "Everyone in this kickoff window is starting. No changes needed.", plan });
        continue;
      }
      if (opts.dryRun) {
        results.push({ windowStart: window.start, status: "preview", message: describe(plan, data), plan });
        starters = plan.newStarters;
        continue;
      }
      if (plan.swaps.length > 0) {
        const saved = await updateMatchupLeg(token, leagueId, setter.rosterId, ctx.week, plan.newStarters);
        const ok = saved?.starters && plan.newStarters.every((s, i) => saved.starters![i] === s);
        if (!ok) throw new Error("Sleeper didn't confirm the new lineup.");
        starters = plan.newStarters;
      }
      results.push({
        windowStart: window.start,
        status: plan.swaps.length ? "changed" : "unresolved",
        message: describe(plan, data),
        plan,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof SleeperAuthError) {
      await prisma.lineupSetter.update({ where: { id: setter.id }, data: { tokenOk: false, enabled: false } });
      results.push({ windowStart: ctx.windows[0].start, status: "error", message: `${message} Lineup Setter was switched off; reconnect your Sleeper account to turn it back on.` });
    } else {
      results.push({ windowStart: ctx.windows[0].start, status: "error", message });
    }
  }

  if (!opts.dryRun) await recordResults(setter.id, ctx.week, results);
  return results;
}

/** Log changes and errors every time; log "no change" once per window. */
async function recordResults(setterId: string, week: number, results: WindowResult[]) {
  for (const r of results) {
    const blockStart = new Date(r.windowStart);
    if (r.status === "no_change" || r.status === "unresolved" || r.status === "error") {
      const existing = await prisma.lineupRun.findFirst({ where: { setterId, week, blockStart, status: r.status, message: r.message } });
      if (existing) continue;
    }
    await prisma.lineupRun.create({
      data: {
        setterId,
        week,
        blockStart,
        status: r.status,
        message: r.message,
        details: r.plan ? JSON.parse(JSON.stringify({ swaps: r.plan.swaps, unresolved: r.plan.unresolved })) : undefined,
      },
    });
  }
}

/** Cron entry point: every member with Lineup Setter switched on. */
export async function runAll() {
  const setters = await prisma.lineupSetter.findMany({ where: { enabled: true, tokenOk: true } });
  if (setters.length === 0) return { checked: 0, windows: 0, results: [] };
  const ctx = await loadContext();
  if (ctx.windows.length === 0) return { checked: setters.length, windows: 0, results: [] };
  const data = await loadPlannerData(ctx.league.season, ctx.week, ctx.league.scoring_settings);
  const results = [];
  for (const s of setters) {
    const r = await runForSetter(s, ctx, data);
    results.push({ user: s.displayName, results: r.map(({ status, message }) => ({ status, message })) });
  }
  return { checked: setters.length, windows: ctx.windows.length, results };
}

/** "Check now" / "Preview" for one member. */
export async function runOne(setter: LineupSetter, dryRun: boolean) {
  const ctx = await loadContext();
  if (ctx.windows.length === 0) return { week: ctx.week, results: [] as WindowResult[], nextKickoff: nextKickoff(ctx) };
  const data = await loadPlannerData(ctx.league.season, ctx.week, ctx.league.scoring_settings);
  return { week: ctx.week, results: await runForSetter(setter, ctx, data, { dryRun }), nextKickoff: nextKickoff(ctx) };
}

const nextKickoff = (ctx: Ctx) => {
  const upcoming = ctx.games.filter((g) => g.start > Date.now()).map((g) => g.start);
  return upcoming.length ? Math.min(...upcoming) : null;
};
