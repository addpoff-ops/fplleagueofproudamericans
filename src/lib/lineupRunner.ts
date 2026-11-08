import type { LineupSetter } from "@prisma/client";
import { prisma } from "./db";
import { decrypt } from "./secure";
import { getMatchupLegs, SleeperAuthError, updateMatchupLeg, updateRosterMetadata } from "./sleeperAuth";
import { lineupProblems, lineupSlots, loadContext, loadPlannerData, planWindow, PRIORITY_LABEL, type Plan } from "./lineup";

type Ctx = Awaited<ReturnType<typeof loadContext>>;
type Data = Awaited<ReturnType<typeof loadPlannerData>>;

export interface WindowResult {
  windowStart: number;
  status: "changed" | "no_change" | "unresolved" | "error" | "preview";
  message: string;
  plan?: Plan;
}

const name = (data: Data, id: string) => data.players[id]?.name ?? `Player ${id}`;

/** A roster's current metadata, read fresh (the per-week formation lives in metadata.formation). */
async function rosterMetadata(leagueId: string, rosterId: number): Promise<Record<string, string>> {
  const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't read your Sleeper roster (${res.status}).`);
  const rosters = (await res.json()) as { roster_id: number; metadata?: Record<string, string> | null }[];
  return rosters.find((r) => r.roster_id === rosterId)?.metadata ?? {};
}

function formationsOf(meta: Record<string, string>): Record<string, string> {
  try {
    return JSON.parse(meta.formation ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/** Set this week's formation on the roster, keeping all other metadata as is. */
async function saveFormation(token: string, leagueId: string, rosterId: number, week: number, formation: string) {
  const meta = await rosterMetadata(leagueId, rosterId);
  const formations = { ...formationsOf(meta), [String(week)]: formation };
  const saved = await updateRosterMetadata(token, leagueId, rosterId, { ...meta, formation: JSON.stringify(formations) });
  if (formationsOf(saved?.metadata ?? {})[String(week)] !== formation) throw new Error("Sleeper didn't confirm the new formation.");
}

function describe(plan: Plan, data: Data) {
  const parts = plan.swaps.map(
    (s) => `Benched ${name(data, s.out)} (not in the starting XI), started ${name(data, s.in)} (${PRIORITY_LABEL[s.priority]})`,
  );
  if (plan.swaps.length && plan.formationAfter !== plan.formationBefore)
    parts.push(`Formation changed from ${plan.formationBefore} to ${plan.formationAfter}`);
  if (plan.repaired)
    parts.push(`Your lineup didn't match its saved formation (${plan.formationBefore}), so the formation was set to ${plan.formationAfter}`);
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
    let formation: string | undefined = formationsOf(await rosterMetadata(leagueId, setter.rosterId))[String(ctx.week)];
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
        formation,
      });
      const save = plan.swaps.length > 0 || plan.repaired;

      if (!save && plan.unresolved.length === 0) {
        results.push({ windowStart: window.start, status: "no_change", message: "Everyone in this kickoff window is starting. No changes needed.", plan });
        continue;
      }
      if (opts.dryRun) {
        results.push({ windowStart: window.start, status: "preview", message: describe(plan, data), plan });
        starters = plan.newStarters;
        formation = plan.formationAfter;
        continue;
      }
      if (save) {
        // Sleeper checks the lineup against the week's formation, so set the
        // formation first, then the lineup; if the lineup fails to save, put the
        // formation back. Afterwards, read both back and fix anything that's off.
        const slots = lineupSlots(ctx.league.roster_positions);
        const pos = (id: string) => data.players[id]?.pos ?? "";
        const who = (id: string) => name(data, id);
        // Everyone who should be starting: the original XI minus the benched, plus their replacements.
        const outs = new Set(plan.swaps.map((s) => s.out));
        const expected = [
          ...starters.filter((id) => id && id !== "0" && !outs.has(id)),
          ...plan.swaps.map((s) => s.in),
        ];
        const planned = lineupProblems(plan.newStarters, slots, plan.formationAfter, expected, pos, who);
        if (planned.length) throw new Error(`Didn't save: the planned lineup has problems (${planned.join("; ")}).`);

        const changeFormation = plan.formationAfter !== formation;
        const changeStarters = plan.newStarters.some((s, i) => s !== starters[i]);
        const apply = async () => {
          if (changeFormation) await saveFormation(token, leagueId, setter.rosterId, ctx.week, plan.formationAfter);
          if (changeStarters) {
            const saved = await updateMatchupLeg(token, leagueId, setter.rosterId, ctx.week, plan.newStarters);
            const ok = saved?.starters && plan.newStarters.every((s, i) => saved.starters![i] === s);
            if (!ok) throw new Error("Sleeper didn't confirm the new lineup.");
          }
        };
        // Read the lineup and formation back from Sleeper and check everything is in place.
        const verify = async () => {
          const leg2 = (await getMatchupLegs(token, leagueId, ctx.week)).find((l) => l.roster_id === setter.rosterId);
          const saved = leg2?.starters ?? [];
          const savedFormation = formationsOf(await rosterMetadata(leagueId, setter.rosterId))[String(ctx.week)] ?? "";
          const problems = lineupProblems(saved, slots, savedFormation, expected, pos, who);
          if (savedFormation !== plan.formationAfter) problems.push(`the saved formation is ${savedFormation || "missing"}, not ${plan.formationAfter}`);
          if (problems.length === 0 && saved.some((s, i) => s !== plan.newStarters[i])) problems.push("the saved order isn't the planned one");
          return problems;
        };
        // Sleeper can take a few seconds to show a save, so re-check briefly before acting on a mismatch.
        const verifySettled = async () => {
          let problems = await verify();
          for (let tries = 0; problems.length && tries < 2; tries++) {
            await new Promise((r) => setTimeout(r, 3000));
            problems = await verify();
          }
          return problems;
        };
        let applied = false;
        try {
          await apply();
          applied = true;
          let problems = await verifySettled();
          if (problems.length) {
            // Go back in once and set the formation and lineup again.
            await saveFormation(token, leagueId, setter.rosterId, ctx.week, plan.formationAfter);
            const saved = await updateMatchupLeg(token, leagueId, setter.rosterId, ctx.week, plan.newStarters);
            if (!saved?.starters) throw new Error("Sleeper didn't confirm the corrected lineup.");
            problems = await verifySettled();
          }
          if (problems.length) throw new Error(`Saved, but the lineup on Sleeper still isn't right: ${problems.join("; ")}. Please check it in the Sleeper app.`);
        } catch (e) {
          // Only undo the formation if the lineup itself never saved (else the two would disagree).
          if (changeFormation && formation && !applied)
            await saveFormation(token, leagueId, setter.rosterId, ctx.week, formation).catch(() => {});
          throw e;
        }
        starters = plan.newStarters;
        formation = plan.formationAfter;
      }
      results.push({
        windowStart: window.start,
        status: save ? "changed" : "unresolved",
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
