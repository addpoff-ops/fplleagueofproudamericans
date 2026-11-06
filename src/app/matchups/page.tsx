import Link from "next/link";
import { getLeagueData, type Team } from "@/lib/league";
import { getPlayers, getSeasonStats, getState, getWeekStats, type Player } from "@/lib/sleeper";
import { getSchedule } from "@/lib/schedule";
import { fillMissingKeepers, getWeekProjectionStats, projectPoints, PROJ_LABEL, PROJ_STATS, PROJECTION_ADJUSTMENTS, type Projection } from "@/lib/projections";
import { POSITION_LABEL, type Pos } from "@/lib/value";
import { Avatar, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Matchups" };

const COLS: Pos[] = ["F", "M", "D", "GK"];
// Same position colours as Power Rankings.
const PILL: Record<Pos, string> = {
  F: "bg-green-100 text-green-800 ring-green-500/60 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/50",
  M: "bg-blue-100 text-blue-800 ring-blue-500/60 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/50",
  D: "bg-orange-100 text-orange-800 ring-orange-500/60 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/50",
  GK: "bg-white text-zinc-800 ring-zinc-300 dark:bg-white/15 dark:text-white dark:ring-white/50",
};

/** Green (big projection) through red (little or none). */
function heat(points: number) {
  if (points >= 8) return "bg-emerald-200 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-300";
  if (points >= 5) return "bg-lime-100 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300";
  if (points >= 3) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300";
  if (points > 0) return "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300";
  return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
}

const fmt = (n: number) => n.toFixed(1);

function breakdown(pr: Projection) {
  const parts = PROJ_STATS.filter((s) => pr.stats[s]).map((s) =>
    s === "cs" ? `${PROJ_LABEL[s]} ${Math.round(pr.stats[s]! * 100)}%` : `${PROJ_LABEL[s]} ${pr.stats[s]!.toFixed(2)}`,
  );
  return parts.length ? parts.join(" · ") : "Not projected to play";
}

interface Row {
  id: string;
  player?: Player;
  pos: Pos;
  pr: Projection;
  note?: string; // shown in the breakdown, e.g. for estimated keepers
}

// Formation rules for the best XI: 1 GK, 3-5 DEF, 3-5 MID, 1-3 FWD (11 players).
const FORMATIONS = (() => {
  const out: { D: number; M: number; F: number }[] = [];
  for (let D = 3; D <= 5; D++) for (let M = 3; M <= 5; M++) for (let F = 1; F <= 3; F++) if (D + M + F === 10) out.push({ D, M, F });
  return out;
})();

/**
 * The team's best XI by projected points: for every allowed formation, take the
 * top-projected players at each position, and keep the formation with the
 * highest total. Injured-reserve players are left out.
 */
function bestXI(rows: Row[]) {
  const top = (pos: Pos) => rows.filter((r) => r.pos === pos).sort((a, b) => b.pr.points - a.pr.points);
  const by = { GK: top("GK"), D: top("D"), M: top("M"), F: top("F") };
  const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.pr.points, 0);
  let best: { xi: Row[]; total: number; shape: string } | null = null;
  for (const f of FORMATIONS) {
    if (by.GK.length < 1 || by.D.length < f.D || by.M.length < f.M || by.F.length < f.F) continue;
    const xi = [...by.GK.slice(0, 1), ...by.D.slice(0, f.D), ...by.M.slice(0, f.M), ...by.F.slice(0, f.F)];
    const total = sum(xi);
    if (!best || total > best.total) best = { xi, total, shape: `${f.D}-${f.M}-${f.F}` };
  }
  // A roster that can't fill any legal formation: use whatever it has, within the limits.
  if (!best) {
    const xi = [...by.GK.slice(0, 1), ...by.D.slice(0, 5), ...by.M.slice(0, 5), ...by.F.slice(0, 3)]
      .sort((a, b) => b.pr.points - a.pr.points)
      .slice(0, 11);
    best = { xi, total: sum(xi), shape: "incomplete" };
  }
  return best;
}

function teamSide(
  team: Team,
  players: Record<string, Player>,
  proj: (id: string, pos: Pos) => Projection,
  notes: Record<string, string>,
) {
  const toRow = (id: string): Row => {
    const pos = (players[id]?.pos ?? "M") as Pos;
    return { id, player: players[id], pos, pr: proj(id, pos), note: notes[id] };
  };
  const reserve = new Set(team.reserve);
  const available = team.players.filter((p) => !reserve.has(p)).map(toRow);
  const { xi, total, shape } = bestXI(available);
  const inXI = new Set(xi.map((r) => r.id));
  const bench = available.filter((r) => !inXI.has(r.id)).sort((a, b) => b.pr.points - a.pr.points);
  const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.pr.points, 0);
  const byPos = Object.fromEntries(COLS.map((p) => [p, xi.filter((r) => r.pos === p).sort((a, b) => b.pr.points - a.pr.points)])) as Record<Pos, Row[]>;
  return { team, byPos, bench, total, shape, benchTotal: sum(bench) };
}

/** How a projected amount is shown: clean sheet as a %, everything else as an expected count. */
const showValue = (stat: string, v: number) => (stat === "cs" ? `${Math.round(v * 100)}%` : v.toFixed(2));

/** A player row; clicking the score opens the stat-by-stat breakdown underneath. */
function PlayerRow({ r }: { r: Row }) {
  return (
    <li className="border-b border-zinc-100 text-sm last:border-0 dark:border-zinc-800/80">
      <details className="group/p">
        <summary className="flex cursor-pointer list-none items-stretch [&::-webkit-details-marker]:hidden" title={breakdown(r.pr)}>
          <span className="flex min-w-0 flex-1 items-center gap-2 bg-zinc-50 px-2.5 py-1.5 dark:bg-zinc-950/40">
            <span className="truncate">{r.player?.name ?? r.id}</span>
            <span className="shrink-0 text-[11px] text-zinc-500">{r.player?.team ?? ""}</span>
          </span>
          <span
            className={`flex w-14 shrink-0 items-center justify-center gap-0.5 text-xs font-bold tabular-nums underline decoration-dotted underline-offset-2 ${heat(r.pr.points)}`}
          >
            {fmt(r.pr.points)}
          </span>
        </summary>
        <div className="bg-zinc-50/60 px-2.5 pb-2 pt-1 dark:bg-zinc-950/60">
          {r.note && <p className="py-1 text-[11px] text-sky-600 dark:text-sky-400">{r.note}</p>}
          {PROJECTION_ADJUSTMENTS[r.id] !== undefined && (
            <p className="py-1 text-[11px] text-amber-600 dark:text-amber-400">
              Test adjustment: RotoWire&apos;s projected stats × {PROJECTION_ADJUSTMENTS[r.id]}.
            </p>
          )}
          {r.pr.lines.length === 0 ? (
            <p className="py-1 text-xs text-zinc-500">No projection for this player.</p>
          ) : (
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="py-1 text-left font-semibold">Stat</th>
                  <th className="py-1 text-right font-semibold"><span className="sm:hidden">Proj</span><span className="hidden sm:inline">Projected</span></th>
                  <th className="py-1 text-right font-semibold">Pts each</th>
                  <th className="py-1 text-right font-semibold">Points</th>
                </tr>
              </thead>
              <tbody>
                {r.pr.lines.map((l) => (
                  <tr key={l.stat} className={l.value ? "" : "text-zinc-500"}>
                    <td className="py-0.5">{PROJ_LABEL[l.stat]}</td>
                    <td className="py-0.5 text-right">{showValue(l.stat, l.value)}</td>
                    <td className="py-0.5 text-right">{l.perUnit}</td>
                    <td className="py-0.5 text-right font-semibold">{l.points.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-200 font-bold dark:border-zinc-700">
                  <td className="pt-1" colSpan={3}>
                    Total
                  </td>
                  <td className="pt-1 text-right">{r.pr.points.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </details>
    </li>
  );
}

interface FormRow {
  id: string;
  player: Player;
  pos: Pos;
  owner: string;
  projected: number;
  recent: number;
  multiplier: number;
}

/**
 * Owned players projected furthest above their recent form: this week's projection
 * divided by their average points over their last four games of 60+ minutes
 * (scored on the same stats as the projection). Players without four such games
 * are left out.
 */
async function formRows(
  season: string,
  week: number,
  projStats: Record<string, Record<string, number>>,
  players: Record<string, Player>,
  teams: Team[],
  scoring: Record<string, number>,
): Promise<FormRow[]> {
  const weeks = Array.from({ length: week - 1 }, (_, i) => week - 1 - i); // most recent first
  const stats = await Promise.all(weeks.map((w) => getWeekStats(season, w).catch(() => ({}) as Record<string, Record<string, number>>)));
  const owner = new Map<string, string>();
  for (const t of teams) for (const id of t.players) owner.set(id, t.teamName);
  const rows: FormRow[] = [];
  for (const id of Object.keys(projStats)) {
    const ownedBy = owner.get(id);
    if (!ownedBy) continue; // owned players only
    const player = players[id];
    const pos = player?.pos as Pos | undefined;
    if (!player || !pos || !COLS.includes(pos)) continue;
    const games = stats.map((s) => s[id]).filter((l) => l && (l.min ?? 0) >= 60).slice(0, 4);
    if (games.length < 4) continue;
    const recent = games.reduce((sum, l) => sum + projectPoints(l, pos, scoring).points, 0) / 4;
    if (recent <= 0) continue;
    const projected = projectPoints(projStats[id], pos, scoring, PROJECTION_ADJUSTMENTS[id] ?? 1).points;
    if (projected <= 0) continue;
    rows.push({ id, player, pos, owner: ownedBy, projected, recent, multiplier: projected / recent });
  }
  return rows.sort((a, b) => b.multiplier - a.multiplier);
}

/** A top-20 table of owned players' projection against their recent form. */
function FormTable({ title, rows }: { title: string; rows: FormRow[] }) {
  return (
    <section className="relative left-1/2 mt-6 w-[min(1372px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800/80 dark:bg-zinc-900/95">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mb-3 text-xs text-zinc-500">
        This week&apos;s projection divided by each player&apos;s average over their last four games with at least 60
        minutes played.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-zinc-200 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
              <th className="py-1.5 pr-2 text-left font-semibold">#</th>
              <th className="py-1.5 pr-2 text-left font-semibold">Player</th>
              <th className="py-1.5 pr-2 text-left font-semibold">Pos</th>
              <th className="hidden py-1.5 pr-2 text-left font-semibold sm:table-cell">Fantasy team</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Projected</th>
              <th className="py-1.5 pr-2 text-right font-semibold"><span className="sm:hidden">Avg</span><span className="hidden sm:inline">4-game avg</span></th>
              <th className="py-1.5 text-right font-semibold"><span className="sm:hidden">Mult</span><span className="hidden sm:inline">Multiplier</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr key={f.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80">
                <td className="py-1.5 pr-2 text-zinc-500">{i + 1}</td>
                <td className="py-1.5 pr-2">
                  <span className="font-medium">{f.player.name}</span>{" "}
                  <span className="text-[11px] text-zinc-500">{f.player.team ?? ""}</span>
                </td>
                <td className="py-1.5 pr-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${PILL[f.pos]}`}>{POSITION_LABEL[f.pos]}</span>
                </td>
                <td className="hidden py-1.5 pr-2 text-zinc-500 sm:table-cell">{f.owner}</td>
                <td className="py-1.5 pr-2 text-right">{fmt(f.projected)}</td>
                <td className="py-1.5 pr-2 text-right">{fmt(f.recent)}</td>
                <td className="py-1.5 text-right font-bold">{f.multiplier.toFixed(2)}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function MatchupsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const [{ league, teams }, state, players] = await Promise.all([getLeagueData(), getState(), getPlayers()]);
  const requested = Number((await searchParams).week);
  // The current matchup week is the one after the last week Sleeper has scored, so the page
  // moves on as soon as Sleeper finalizes a gameweek's results and updates team records.
  const scored = league.settings.last_scored_leg ?? 0;
  const currentWeek = scored > 0 ? Math.min(scored + 1, 38) : state.week;
  const week = Number.isInteger(requested) && requested >= 1 && requested <= 38 ? requested : currentWeek;
  const [schedule, rawProj, seasonStats] = await Promise.all([
    getSchedule(week, week),
    getWeekProjectionStats(league.season, week),
    getSeasonStats(league.season),
  ]);
  // Fill in keepers RotoWire left out (see fillMissingKeepers).
  const { proj: projStats, notes: estimateNotes } = fillMissingKeepers(rawProj, players, seasonStats);

  const proj = (id: string, pos: Pos) =>
    projectPoints(projStats[id], pos, league.scoring_settings, PROJECTION_ADJUSTMENTS[id] ?? 1);
  const byId = new Map(teams.map((t) => [t.rosterId, t]));
  const games = (schedule ?? [])
    .map((g) => ({ home: byId.get(g.home), away: byId.get(g.away) }))
    .filter((g): g is { home: Team; away: Team } => !!g.home && !!g.away)
    .map((g) => ({ home: teamSide(g.home, players, proj, estimateNotes), away: teamSide(g.away, players, proj, estimateNotes) }));
  const hasProjections = Object.keys(rawProj).length > 0;
  const allForm = hasProjections ? await formRows(league.season, week, projStats, players, teams, league.scoring_settings) : [];
  const under = allForm.slice(0, 20); // highest multipliers
  const over = allForm.slice(-20).reverse(); // lowest multipliers

  return (
    <>
      <PageTitle title="Matchups" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {week > 1 && (
          <Link href={`/matchups?week=${week - 1}`} className="btn-ghost">
            ← GW{week - 1}
          </Link>
        )}
        <span className="rounded-2xl border border-zinc-200 bg-white/80 px-4 py-1.5 text-sm font-semibold backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/85">
          Gameweek {week}
          {week === currentWeek ? " (current)" : ""}
        </span>
        {week < 38 && (
          <Link href={`/matchups?week=${week + 1}`} className="btn-ghost">
            GW{week + 1} →
          </Link>
        )}
      </div>

      {!schedule ? (
        <div className="card p-6 text-sm text-zinc-600 dark:text-zinc-400">
          The schedule isn&apos;t available yet. It&apos;s read using a connected Lineup Setter Tool account; connect one, then
          reload this page.
        </div>
      ) : games.length === 0 ? (
        <div className="card p-6 text-sm text-zinc-500">No matchups found for gameweek {week}.</div>
      ) : (
        <>
          {!hasProjections && (
            <div className="card mb-3 p-4 text-sm text-zinc-500">
              RotoWire projections aren&apos;t available yet for gameweek {week}, so every player shows 0.
            </div>
          )}
          <div className="relative left-1/2 grid w-[min(1372px,calc(100vw-2rem))] -translate-x-1/2 gap-2">
            {games.map(({ home, away }, gi) => {
              const sum = home.total + away.total;
              const homePct = sum > 0 ? (home.total / sum) * 100 : 50;
              return (
                <details
                  key={`${home.team.rosterId}-${away.team.rosterId}`}
                  open={gi === 0}
                  className="group min-w-0 rounded-xl border border-zinc-200 bg-white transition-colors hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/95 dark:hover:border-zinc-700"
                >
                  <summary className="cursor-pointer list-none px-3 py-3 sm:px-4 [&::-webkit-details-marker]:hidden">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      {[home, away].map((side, si) => (
                        <div key={side.team.rosterId} className={`flex min-w-0 items-center gap-3 ${si === 1 ? "order-3 flex-row-reverse text-right" : ""}`}>
                          <Avatar avatar={side.team.avatar} name={side.team.teamName} size={36} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{side.team.teamName}</div>
                            <div className="truncate text-xs text-zinc-500">
                              Record: {side.team.wins}-{side.team.losses}-{side.team.ties}
                              <span className="ml-3">Formation: {side.shape}</span>
                            </div>
                          </div>
                          <div className={`ml-auto text-2xl font-bold tabular-nums ${si === 1 ? "ml-0 mr-auto" : ""}`}>{fmt(side.total)}</div>
                        </div>
                      ))}
                      <span className="order-2 text-xs font-semibold text-zinc-500">vs</span>
                    </div>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-950/70">
                      <div className="bg-red-600" style={{ width: `${homePct}%` }} />
                      <div className="bg-yellow-400" style={{ width: `${100 - homePct}%` }} />
                    </div>
                  </summary>

                  <div className="grid gap-6 border-t border-zinc-100 px-3 pb-4 pt-3 sm:px-4 lg:grid-cols-2 dark:border-zinc-800/80">
                    {[home, away].map((side) => (
                      <div key={side.team.rosterId} className="min-w-0">
                        <div className="mb-2 flex items-baseline justify-between">
                          <span className="font-semibold">{side.team.teamName}</span>
                          <span className="text-sm tabular-nums text-zinc-500">
                            Best XI ({side.shape}) {fmt(side.total)} pts
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {COLS.map((p) => (
                            <div key={p} className="min-w-0">
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${PILL[p]}`}>{POSITION_LABEL[p]}</span>
                                <span className="text-xs tabular-nums text-zinc-500">
                                  {fmt(side.byPos[p].reduce((s, r) => s + r.pr.points, 0))} pts
                                </span>
                              </div>
                              <ul className="overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-800/80">
                                {side.byPos[p].map((r) => (
                                  <PlayerRow key={r.id} r={r} />
                                ))}
                                {side.byPos[p].length === 0 && <li className="px-2.5 py-1.5 text-sm text-zinc-400">None</li>}
                              </ul>
                            </div>
                          ))}
                        </div>
                        {side.bench.length > 0 && (
                          <div className="mt-3">
                            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                              <span className="font-semibold uppercase tracking-wide">Not in best XI</span>
                              <span className="tabular-nums">{fmt(side.benchTotal)} pts</span>
                            </div>
                            <ul className="overflow-hidden rounded-lg border border-zinc-100 opacity-80 dark:border-zinc-800/80">
                              {side.bench.map((r) => (
                                <PlayerRow key={r.id} r={r} />
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          {under.length > 0 && <FormTable title="Who is Underperforming Projections?" rows={under} />}
          {over.length > 0 && <FormTable title="Who is Overperforming Projections?" rows={over} />}
          <p className="mt-3 text-xs text-zinc-500">
            Projected points use RotoWire&apos;s weekly projections for goals, assists, chances created, shots on target,
            dribbles completed, accurate crosses, tackles won, interceptions, aerials won, effective clearances,
            clean-sheet likelihood, goals against (defenders and goalkeepers only) and saves (goalkeepers only), scored
            with our league&apos;s settings. Each team&apos;s total is its best XI by projection, following formation rules: 1
            goalkeeper, 3–5 defenders, 3–5 midfielders and 1–3 forwards (injured reserve excluded). Click a player&apos;s
            score to see each projected stat and the points it earns.
          </p>
        </>
      )}
    </>
  );
}
