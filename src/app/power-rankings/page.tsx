import Link from "next/link";
import { getLeagueData } from "@/lib/league";
import { prisma } from "@/lib/db";
import { getEntries } from "@/lib/rankings";
import { getPlayers } from "@/lib/sleeper";
import { POSITION_LABEL, SHEET_TIER_VALUES, type Pos, type RankedEntry, type Tier } from "@/lib/value";
import { Avatar, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Power Rankings" };

// Display order for positions.
const COLS: Pos[] = ["F", "M", "D", "GK"];

const SEGMENT: Record<Pos, string> = {
  F: "bg-rose-400 dark:bg-rose-500",
  M: "bg-emerald-400 dark:bg-emerald-500",
  D: "bg-sky-400 dark:bg-sky-500",
  GK: "bg-amber-400 dark:bg-amber-500",
};
const PILL: Record<Pos, string> = {
  F: "bg-rose-100 text-rose-800 ring-rose-400/60 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/50",
  M: "bg-emerald-100 text-emerald-800 ring-emerald-400/60 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/50",
  D: "bg-sky-100 text-sky-800 ring-sky-400/60 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/50",
  GK: "bg-amber-100 text-amber-800 ring-amber-400/60 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/50",
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
 * Each player's tier comes from the official rankings; unranked players count 0.
 */
export default async function PowerRankingsPage() {
  const [{ teams }, entries, official, players] = await Promise.all([
    getLeagueData(),
    getEntries({ isOfficial: true }),
    prisma.rankingSet.findFirst({ where: { isOfficial: true }, select: { name: true, slug: true } }),
    getPlayers(),
  ]);
  const entryOf = new Map((entries ?? []).map((e) => [e.playerId, e]));
  const standing = new Map(teams.map((t, i) => [t.rosterId, i + 1]));

  const rows = teams
    .map((t) => {
      const byPos: Record<Pos, number> = { F: 0, M: 0, D: 0, GK: 0 };
      const roster: Record<Pos, (RankedEntry & { pts: number })[]> = { F: [], M: [], D: [], GK: [] };
      for (const id of t.players) {
        const e = entryOf.get(id);
        if (!e) continue;
        const pts = SHEET_TIER_VALUES[e.pos][e.tier];
        byPos[e.pos] += pts;
        roster[e.pos].push({ ...e, pts });
      }
      for (const p of COLS) roster[p].sort((a, b) => a.rank - b.rank);
      const total = COLS.reduce((s, p) => s + byPos[p], 0);
      return { team: t, byPos, roster, total };
    })
    .sort((a, b) => b.total - a.total);

  const max = Math.max(1, ...rows.map((r) => r.total));
  // Each team's rank (1-12) at each position: 1 = most value. Ties share a rank.
  const posRank = (pos: Pos, value: number) => 1 + rows.filter((r) => r.byPos[pos] > value).length;

  return (
    <>
      <PageTitle
        title="Power Rankings"
        sub={
          <>
            Teams ranked by total roster value using the original spreadsheet values (e.g. FWD S = 580, MID S = 600).
            Tiers come from{" "}
            {official ? (
              <Link href={`/rankings/${official.slug}`} className="underline">
                {official.name}
              </Link>
            ) : (
              "the official rankings"
            )}
            . Click a team to see its players.
          </>
        }
      />

      {!entries ? (
        <div className="card p-8 text-center text-sm text-zinc-500">No official rankings yet.</div>
      ) : (
        <>
          {/* Legend */}
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {COLS.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${SEGMENT[p]}`} /> {POSITION_LABEL[p]}
              </span>
            ))}
            <span className="font-normal normal-case tracking-normal">· Numbers on the bars are each team&apos;s rank at that position</span>
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
                  className="group rounded-xl border border-zinc-200 bg-white transition-colors hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:hover:border-zinc-700"
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
                            className={`flex min-w-5 items-center justify-center border-r border-white/40 text-[10px] font-bold text-zinc-900/80 last:border-r-0 dark:border-zinc-950/40 ${SEGMENT[p]}`}
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
                                className={`flex w-14 shrink-0 items-center justify-center text-xs font-bold tabular-nums ${HEAT[e.tier]}`}
                                title={`${POSITION_LABEL[p]} #${e.rank} · Tier ${e.tier}`}
                              >
                                {e.rank}
                                <span className="ml-1 text-[10px] font-semibold opacity-70">{e.tier}</span>
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
          <p className="mt-3 text-xs text-zinc-500">
            In each team&apos;s player list: the middle number is the player&apos;s value; the coloured cell is their rank
            at that position in the official rankings, with their tier (green = top tiers, red = bottom).
          </p>
        </>
      )}
    </>
  );
}
