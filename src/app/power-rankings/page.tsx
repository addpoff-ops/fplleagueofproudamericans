import Link from "next/link";
import { getLeagueData } from "@/lib/league";
import { prisma } from "@/lib/db";
import { getEntries } from "@/lib/rankings";
import { POSITION_LABEL, SHEET_TIER_VALUES, type Pos } from "@/lib/value";
import { Avatar, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Power Rankings" };

// Display order for the position breakdown columns.
const COLS: Pos[] = ["F", "M", "D", "GK"];
const BAR_COLORS: Record<Pos, string> = {
  F: "bg-rose-400",
  M: "bg-emerald-400",
  D: "bg-sky-400",
  GK: "bg-amber-400",
};

/**
 * Every team ranked by the total value of all rostered players, using the
 * original spreadsheet values (no trade-calculator scaling or discounts).
 * Each player's tier comes from the official rankings; unranked players count 0.
 */
export default async function PowerRankingsPage() {
  const [{ teams }, entries, official] = await Promise.all([
    getLeagueData(),
    getEntries({ isOfficial: true }),
    prisma.rankingSet.findFirst({ where: { isOfficial: true }, select: { name: true, slug: true } }),
  ]);
  const entryOf = new Map((entries ?? []).map((e) => [e.playerId, e]));

  const rows = teams
    .map((t) => {
      const byPos: Record<Pos, number> = { F: 0, M: 0, D: 0, GK: 0 };
      let ranked = 0;
      for (const id of t.players) {
        const e = entryOf.get(id);
        if (!e) continue;
        byPos[e.pos] += SHEET_TIER_VALUES[e.pos][e.tier];
        ranked++;
      }
      const total = COLS.reduce((s, p) => s + byPos[p], 0);
      return { team: t, byPos, total, ranked };
    })
    .sort((a, b) => b.total - a.total);

  const max = Math.max(1, ...rows.map((r) => r.total));

  // Each team's rank (1-12) at each position: 1 = most value. Ties share a rank.
  const posRank = (pos: Pos, value: number) => 1 + rows.filter((r) => r.byPos[pos] > value).length;
  const standing = new Map(teams.map((t, i) => [t.rosterId, i + 1]));

  return (
    <>
      <PageTitle
        title="Power Rankings"
        sub={
          <>
            Every team ranked by the total value of its roster, using the original spreadsheet values (e.g. FWD S = 580,
            MID S = 600). Tiers come from{" "}
            {official ? (
              <Link href={`/rankings/${official.slug}`} className="underline">
                {official.name}
              </Link>
            ) : (
              "the official rankings"
            )}
            . Unranked players count as 0.
          </>
        }
      />
      {!entries ? (
        <div className="card p-8 text-center text-sm text-zinc-500">No official rankings yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="th w-10">#</th>
                <th className="th">Team</th>
                <th className="th text-right">Total</th>
                <th className="th hidden w-1/4 md:table-cell">Rank by position</th>
                {COLS.map((p) => (
                  <th key={p} className="th hidden text-right sm:table-cell">
                    {POSITION_LABEL[p]}
                  </th>
                ))}
                <th className="th hidden text-right lg:table-cell">Standing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const st = standing.get(r.team.rosterId)!;
                return (
                  <tr key={r.team.rosterId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                    <td className="td font-semibold text-zinc-500">{i + 1}</td>
                    <td className="td">
                      <Link href={`/teams/${r.team.rosterId}`} className="flex items-center gap-2 hover:underline">
                        <Avatar avatar={r.team.avatar} name={r.team.teamName} />
                        <span>
                          <span className="font-medium">{r.team.teamName}</span>
                          <span className="block text-xs text-zinc-500">
                            @{r.team.ownerName} · {r.ranked}/{r.team.players.length} ranked
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="td text-right text-base font-bold tabular-nums">{r.total.toLocaleString()}</td>
                    <td className="td hidden md:table-cell">
                      {/* Stacked bar: share of the top team's total, split by position */}
                      <div className="flex h-5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        {COLS.map((p) => (
                          <div
                            key={p}
                            className={`flex min-w-5 items-center justify-center text-[11px] font-bold text-zinc-900/80 ${BAR_COLORS[p]}`}
                            style={{ width: `${(r.byPos[p] / max) * 100}%` }}
                            title={`${POSITION_LABEL[p]}: ${r.byPos[p].toLocaleString()} pts, ranked ${posRank(p, r.byPos[p])} of ${rows.length}`}
                          >
                            {posRank(p, r.byPos[p])}
                          </div>
                        ))}
                      </div>
                    </td>
                    {COLS.map((p) => (
                      <td key={p} className="td hidden text-right tabular-nums text-zinc-600 sm:table-cell dark:text-zinc-400">
                        {r.byPos[p].toLocaleString()}{" "}
                        <span className="text-xs text-zinc-400">({posRank(p, r.byPos[p])})</span>
                      </td>
                    ))}
                    <td className="td hidden text-right text-xs text-zinc-500 lg:table-cell">
                      {st}
                      {st === 1 ? "st" : st === 2 ? "nd" : st === 3 ? "rd" : "th"}{" "}
                      <span className={st - (i + 1) > 0 ? "text-emerald-600" : st - (i + 1) < 0 ? "text-rose-600" : ""}>
                        ({r.team.wins}-{r.team.losses}-{r.team.ties})
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
        {COLS.map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${BAR_COLORS[p]}`} /> {POSITION_LABEL[p]}
          </span>
        ))}
        <span>· Standing shows each team&apos;s actual league position (green = power rank better than standing).</span>
      </div>
    </>
  );
}
