import { notFound } from "next/navigation";
import { getLeagueData, POSITION_ORDER } from "@/lib/league";
import { getPlayers } from "@/lib/sleeper";
import { prisma } from "@/lib/db";
import { getEntries } from "@/lib/rankings";
import { POSITION_LABEL } from "@/lib/value";
import { Avatar, PageTitle, PlayerName } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ rosterId: string }> }) {
  const { rosterId } = await params;
  const [{ teams }, players, official] = await Promise.all([
    getLeagueData(),
    getPlayers(),
    prisma.rankingSet.findFirst({ where: { isOfficial: true }, select: { name: true } }),
  ]);
  const idx = teams.findIndex((t) => String(t.rosterId) === rosterId);
  if (idx < 0) notFound();
  const team = teams[idx];
  const entries = (await getEntries({ isOfficial: true })) ?? [];
  const entryOf = new Map(entries.map((e) => [e.playerId, e]));
  const valueOf = (id: string) => entryOf.get(id)?.value ?? 0;

  const starters = new Set(team.starters);
  const reserve = new Set(team.reserve);
  const sortByPos = (ids: string[]) =>
    [...ids].sort(
      (a, b) =>
        (POSITION_ORDER[players[a]?.pos] ?? 9) - (POSITION_ORDER[players[b]?.pos] ?? 9) ||
        valueOf(b) - valueOf(a),
    );
  const groups = [
    { title: "Starters", ids: sortByPos(team.starters) },
    { title: "Bench", ids: sortByPos(team.players.filter((p) => !starters.has(p) && !reserve.has(p))) },
    { title: "Injured Reserve", ids: sortByPos(team.reserve) },
  ].filter((g) => g.ids.length);
  const totalValue = team.players.reduce((s, p) => s + valueOf(p), 0);

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <Avatar avatar={team.avatar} name={team.teamName} size={48} />
        <PageTitle
          title={team.teamName}
          sub={`@${team.ownerName} · ${team.wins}-${team.losses}-${team.ties} · ${ordinal(idx + 1)} place · ${team.pointsFor.toFixed(2)} PF · ${team.streak || "—"} streak · $${team.faabUsed} FAAB used`}
        />
      </div>
      {official && (
        <p className="mb-4 text-sm text-zinc-500">
          Roster value under <span className="font-medium">{official.name}</span>:{" "}
          <span className="font-semibold text-foreground">{totalValue.toLocaleString()}</span>
        </p>
      )}
      <div className="grid gap-6">
        {groups.map((g) => (
          <section key={g.title} className="card overflow-x-auto">
            <h2 className="border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">{g.title}</h2>
            <table className="w-full text-sm">
              <tbody>
                {g.ids.map((id) => (
                  <tr key={id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                    <td className="td">
                      <PlayerName p={players[id]} id={id} />
                    </td>
                    {official && (
                      <>
                        <td className="td text-right text-xs text-zinc-500">
                          {entryOf.has(id)
                            ? `${POSITION_LABEL[entryOf.get(id)!.pos]} #${entryOf.get(id)!.rank} · Tier ${entryOf.get(id)!.tier}`
                            : "unranked"}
                        </td>
                        <td className="td w-24 text-right tabular-nums">{valueOf(id).toLocaleString()}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
