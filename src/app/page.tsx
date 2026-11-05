import Link from "next/link";
import { getLeagueData } from "@/lib/league";
import { Avatar, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic"; // Sleeper responses are still cached (see lib/sleeper.ts)

export default async function StandingsPage() {
  const { league, teams } = await getLeagueData();
  const s = league.settings;
  const playoffLine = s.playoff_teams;

  return (
    <>
      <PageTitle
        title={league.name}
        sub={`${league.season} season · ${s.num_teams} teams · Gameweek ${s.leg} · Top ${playoffLine} make the playoffs`}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="th w-10">#</th>
              <th className="th">Team</th>
              <th className="th text-center">W-L-T</th>
              <th className="th text-right">PF</th>
              <th className="th text-right">PA</th>
              <th className="th text-right">Max PF</th>
              <th className="th">Form</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr
                key={t.rosterId}
                className={`border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40 ${
                  i === playoffLine - 1 ? "border-b-2 border-b-emerald-500/60 dark:border-b-emerald-500/60" : ""
                }`}
              >
                <td className="td font-semibold text-zinc-500">{i + 1}</td>
                <td className="td">
                  <Link href={`/teams/${t.rosterId}`} className="flex items-center gap-2 hover:underline">
                    <Avatar avatar={t.avatar} name={t.teamName} />
                    <span>
                      <span className="font-medium">{t.teamName}</span>
                      <span className="block text-xs text-zinc-500">@{t.ownerName}</span>
                    </span>
                  </Link>
                </td>
                <td className="td text-center tabular-nums">
                  {t.wins}-{t.losses}-{t.ties}
                </td>
                <td className="td text-right tabular-nums">{t.pointsFor.toFixed(2)}</td>
                <td className="td text-right tabular-nums">{t.pointsAgainst.toFixed(2)}</td>
                <td className="td text-right tabular-nums text-zinc-500">{t.maxPoints.toFixed(2)}</td>
                <td className="td">
                  <span className="flex gap-0.5">
                    {t.record.slice(-5).split("").map((r, j) => (
                      <span
                        key={j}
                        className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${
                          r === "W" ? "bg-emerald-500" : r === "L" ? "bg-rose-500" : "bg-zinc-400"
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Green line = playoff cutoff. Click a team to see its roster.</p>
    </>
  );
}
