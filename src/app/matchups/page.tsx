import Link from "next/link";
import { getLeagueData, type Team } from "@/lib/league";
import { getPlayers, getState, type Player } from "@/lib/sleeper";
import { getSchedule } from "@/lib/schedule";
import { getWeekProjectionStats, projectPoints, PROJ_LABEL, PROJ_STATS, type Projection } from "@/lib/projections";
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

function teamSide(team: Team, players: Record<string, Player>, proj: (id: string, pos: Pos) => Projection) {
  const toRow = (id: string): Row => {
    const pos = (players[id]?.pos ?? "M") as Pos;
    return { id, player: players[id], pos, pr: proj(id, pos) };
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

function PlayerRow({ r }: { r: Row }) {
  return (
    <li className="flex items-stretch border-b border-zinc-100 text-sm last:border-0 dark:border-zinc-800/80">
      <span className="flex min-w-0 flex-1 items-center gap-2 bg-zinc-50 px-2.5 py-1.5 dark:bg-zinc-950/40">
        <span className="truncate">{r.player?.name ?? r.id}</span>
        <span className="shrink-0 text-[11px] text-zinc-500">{r.player?.team ?? ""}</span>
      </span>
      <span
        className={`flex w-14 shrink-0 items-center justify-center text-xs font-bold tabular-nums ${heat(r.pr.points)}`}
        title={breakdown(r.pr)}
      >
        {fmt(r.pr.points)}
      </span>
    </li>
  );
}

export default async function MatchupsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const [{ league, teams }, state, players] = await Promise.all([getLeagueData(), getState(), getPlayers()]);
  const requested = Number((await searchParams).week);
  const week = Number.isInteger(requested) && requested >= 1 && requested <= 38 ? requested : state.week;
  const [schedule, projStats] = await Promise.all([getSchedule(week, week), getWeekProjectionStats(league.season, week)]);

  const proj = (id: string, pos: Pos) => projectPoints(projStats[id], pos, league.scoring_settings);
  const byId = new Map(teams.map((t) => [t.rosterId, t]));
  const games = (schedule ?? [])
    .map((g) => ({ home: byId.get(g.home), away: byId.get(g.away) }))
    .filter((g): g is { home: Team; away: Team } => !!g.home && !!g.away)
    .map((g) => ({ home: teamSide(g.home, players, proj), away: teamSide(g.away, players, proj) }));
  const hasProjections = Object.keys(projStats).length > 0;

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
          {week === state.week ? " (current)" : ""}
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
              Sleeper hasn&apos;t published projections for gameweek {week} yet, so every player shows 0.
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
                              {side.team.wins}-{side.team.losses}-{side.team.ties} · {side.shape}
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
          <p className="mt-3 text-xs text-zinc-500">
            Projected points use Sleeper&apos;s weekly projections for goals, assists, chances created, shots on target,
            tackles won, interceptions, aerials won, clean-sheet likelihood and (goalkeepers only) saves, scored with our
            league&apos;s settings. Each team&apos;s total is its best XI by projection, following formation rules: 1
            goalkeeper, 3–5 defenders, 3–5 midfielders and 1–3 forwards (injured reserve excluded). Hover a number to
            see the breakdown.
          </p>
        </>
      )}
    </>
  );
}
