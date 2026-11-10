import { getLeagueData } from "@/lib/league";
import { consensusValues, pointsValues, type ConsensusValue } from "@/lib/rankings";
import Link from "next/link";
import { getPlayers } from "@/lib/sleeper";
import { POSITION_LABEL, type Pos, type Tier } from "@/lib/value";
import { Avatar, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Power Rankings" };

// Display order for positions.
const COLS: Pos[] = ["F", "M", "D", "GK"];

// Position colours: FWD green, MID blue, DEF orange, GK white.
const SEGMENT: Record<Pos, string> = {
  F: "bg-green-500",
  M: "bg-blue-500",
  D: "bg-orange-500",
  GK: "bg-white ring-1 ring-inset ring-zinc-300 dark:ring-0",
};
// Rank numbers on the bar: white on blue, dark elsewhere, so each stays readable.
const SEGMENT_TEXT: Record<Pos, string> = {
  F: "text-zinc-950/85",
  M: "text-white",
  D: "text-zinc-950/85",
  GK: "text-zinc-950/85",
};
const PILL: Record<Pos, string> = {
  F: "bg-green-100 text-green-800 ring-green-500/60 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/50",
  M: "bg-blue-100 text-blue-800 ring-blue-500/60 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/50",
  D: "bg-orange-100 text-orange-800 ring-orange-500/60 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/50",
  GK: "bg-white text-zinc-800 ring-zinc-300 dark:bg-white/15 dark:text-white dark:ring-white/50",
};
// Green (best tiers) through red (worst) for the per-player rank cells.
const HEAT: Record<Tier, string> = {
  S: "bg-emerald-200 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-300",
  A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  B: "bg-lime-100 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300",
  C: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  D: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  E: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  F: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  Z: "bg-red-200/70 text-red-900 dark:bg-red-500/25 dark:text-red-300",
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * Every team ranked by the total value of all rostered players, using the
 * original spreadsheet values (no trade-calculator scaling or discounts).
 * Two views (?basis=):
 *   site    (default) each player's value is their average across the
 *           rankings lists saved in the last SITE_LIST_MAX_AGE_DAYS days;
 *           players none of those lists rank count 0.
 *   points  players ordered by this season's total fantasy points (league
 *           scoring), with tiers borrowed rank-for-rank from the official list,
 *           as in "Use Total Points" on Create your rankings.
 */
/** Site rankings only count lists saved within this many days. */
const SITE_LIST_MAX_AGE_DAYS = 3;

export default async function PowerRankingsPage({ searchParams }: { searchParams: Promise<{ basis?: string }> }) {
  const basis = (await searchParams).basis === "points" ? "points" : "site";
  const [{ teams }, site, points, players] = await Promise.all([
    getLeagueData(),
    basis === "site" ? consensusValues({ updatedWithinDays: SITE_LIST_MAX_AGE_DAYS }) : null,
    basis === "points" ? pointsValues() : null,
    getPlayers(),
  ]);
  const values = points ?? site!.values;
  const listCount = site?.listCount ?? 1;
  const standing = new Map(teams.map((t, i) => [t.rosterId, i + 1]));

  const rows = teams
    .map((t) => {
      const byPos: Record<Pos, number> = { F: 0, M: 0, D: 0, GK: 0 };
      const roster: Record<Pos, (ConsensusValue & { playerId: string })[]> = { F: [], M: [], D: [], GK: [] };
      for (const id of t.players) {
        const v = values.get(id);
        if (!v) continue;
        byPos[v.pos] += v.pts;
        roster[v.pos].push({ ...v, playerId: id });
      }
      for (const p of COLS) roster[p].sort((a, b) => b.pts - a.pts);
      const total = COLS.reduce((s, p) => s + byPos[p], 0);
      return { team: t, byPos, roster, total };
    })
    .sort((a, b) => b.total - a.total);

  const max = Math.max(1, ...rows.map((r) => r.total));
  // Each team's rank (1-12) at each position: 1 = most value. Ties share a rank.
  const posRank = (pos: Pos, value: number) => 1 + rows.filter((r) => r.byPos[pos] > value).length;

  return (
    <>
      <PageTitle title="Power Rankings" />

      {/* Which values the rankings are based on */}
      <div className="mb-4 inline-flex rounded-lg border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        {[
          { key: "site", label: "Site rankings", href: "/power-rankings" },
          { key: "points", label: "Total Points", href: "/power-rankings?basis=points" },
        ].map((o) => (
          <Link
            key={o.key}
            href={o.href}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
              basis === o.key
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>

      {listCount === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-500">
          No rankings list has been saved in the last {SITE_LIST_MAX_AGE_DAYS} days.
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {COLS.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${SEGMENT[p]}`} /> {POSITION_LABEL[p]}
              </span>
            ))}
          </div>

          {/* Wider than the normal page column on big screens, like the draft board */}
          <div className="relative left-1/2 grid w-[min(1372px,calc(100vw-2rem))] -translate-x-1/2 gap-2">
            {rows.map((r, i) => {
              const t = r.team;
              const st = standing.get(t.rosterId)!;
              return (
                <details
                  key={t.rosterId}
                  open={i === 0}
                  className="group min-w-0 rounded-xl border border-zinc-200 bg-white transition-colors hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/95 dark:hover:border-zinc-700"
                >
                  <summary className="cursor-pointer list-none px-3 pb-3 pt-3 sm:px-4 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-start gap-3">
                      {/* Avatar with power-rank badge */}
                      <div className="relative shrink-0">
                        <Avatar avatar={t.avatar} name={t.teamName} size={38} />
                        <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white shadow ring-2 ring-white dark:ring-zinc-900">
                          {i + 1}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{t.teamName}</span>
                          <span className="truncate text-xs text-zinc-500">@{t.ownerName}</span>
                          <svg
                            className="ml-auto h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden
                          >
                            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
                          </svg>
                        </div>

                        {/* Stat chips */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-bold tabular-nums text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                            {r.total.toLocaleString()}
                          </span>
                          <span>
                            Record <span className="text-zinc-700 dark:text-zinc-300">{t.wins}-{t.losses}-{t.ties}</span>
                          </span>
                          <span>
                            League <span className="text-zinc-700 dark:text-zinc-300">{ordinal(st)}</span>
                          </span>
                          <span className="hidden sm:inline">
                            Pt. For <span className="text-zinc-700 dark:text-zinc-300">{t.pointsFor.toFixed(2)}</span>
                          </span>
                          <span className="hidden sm:inline">
                            Pt. Agst <span className="text-zinc-700 dark:text-zinc-300">{t.pointsAgainst.toFixed(2)}</span>
                          </span>
                          {t.streak && (
                            <span className="hidden sm:inline">
                              Streak <span className="text-zinc-700 dark:text-zinc-300">{t.streak}</span>
                            </span>
                          )}
                          {/* Points by position, with the team's rank in parentheses */}
                          <span className="flex flex-wrap gap-x-3 gap-y-1 lg:ml-auto">
                            {COLS.map((p) => (
                              <span key={p} className="inline-flex items-center gap-1 tabular-nums">
                                <span className={`h-2 w-2 rounded-sm ${SEGMENT[p]}`} />
                                <span className="text-zinc-700 dark:text-zinc-300">{r.byPos[p].toLocaleString()}</span>
                                <span>({posRank(p, r.byPos[p])})</span>
                              </span>
                            ))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stacked bar, scaled to the top team's total */}
                    <div className="mt-3 h-4 overflow-hidden rounded-[3px] bg-zinc-100 dark:bg-zinc-950/70">
                      <div className="flex h-full" style={{ width: `${(r.total / max) * 100}%` }}>
                        {COLS.map((p) => (
                          <div
                            key={p}
                            className={`flex min-w-5 items-center justify-center border-r border-white/40 text-[10px] font-bold last:border-r-0 dark:border-zinc-950/40 ${SEGMENT[p]} ${SEGMENT_TEXT[p]}`}
                            style={{ width: `${(r.byPos[p] / r.total) * 100}%` }}
                            title={`${POSITION_LABEL[p]}: ${r.byPos[p].toLocaleString()} pts, ranked ${posRank(p, r.byPos[p])} of ${rows.length}`}
                          >
                            {posRank(p, r.byPos[p])}
                          </div>
                        ))}
                      </div>
                    </div>
                  </summary>

                  {/* Expanded: players by position */}
                  <div className="grid gap-4 border-t border-zinc-100 px-3 pb-4 pt-3 sm:grid-cols-2 sm:px-4 lg:grid-cols-4 dark:border-zinc-800/80">
                    {COLS.map((p) => (
                      <div key={p}>
                        <div className="mb-2 flex items-center justify-between">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${PILL[p]}`}>
                            {POSITION_LABEL[p]} Rank: <span className="font-bold">{posRank(p, r.byPos[p])}</span>
                          </span>
                          <span className="text-xs tabular-nums text-zinc-500">{r.byPos[p].toLocaleString()} pts</span>
                        </div>
                        <ul className="overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-800/80">
                          {r.roster[p].map((e) => (
                            <li
                              key={e.playerId}
                              className="flex items-stretch border-b border-zinc-100 text-sm last:border-0 dark:border-zinc-800/80"
                            >
                              <span className="flex min-w-0 flex-1 items-center gap-2 bg-zinc-50 px-2.5 py-1.5 dark:bg-zinc-950/40">
                                <span className="truncate">{players[e.playerId]?.name ?? e.playerId}</span>
                                <span className="shrink-0 text-[11px] text-zinc-500">{players[e.playerId]?.team}</span>
                              </span>
                              <span className="flex w-12 shrink-0 items-center justify-end bg-zinc-50 px-2 tabular-nums text-zinc-500 dark:bg-zinc-950/40">
                                {e.pts}
                              </span>
                              <span
                                className={`flex w-10 shrink-0 items-center justify-center text-xs font-bold ${HEAT[e.tier]}`}
                                title={
                                  basis === "points"
                                    ? `Tier ${e.tier}: ${POSITION_LABEL[p]} #${e.rank} by season points (${e.seasonPts} pts)`
                                    : `Consensus tier ${e.tier} (average ${e.pts} across ${e.lists} ${e.lists === 1 ? "list" : "lists"})`
                                }
                              >
                                {e.tier}
                              </span>
                            </li>
                          ))}
                          {r.roster[p].length === 0 && <li className="px-2.5 py-1.5 text-sm text-zinc-400">None</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          {basis === "points" && (
            <p className="mt-3 text-xs text-zinc-500">
              Total Points: players are ordered by this season&apos;s fantasy points (our league&apos;s scoring), and each
              gets the tier of the official list&apos;s player at the same rank, valued with the original spreadsheet
              values. The coloured cell is that tier (green = top tiers, red = bottom). Players with no points this season
              count 0.
            </p>
          )}
        </>
      )}
    </>
  );
}
