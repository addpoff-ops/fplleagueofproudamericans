import { getLeagueData } from "@/lib/league";
import { getPlayers, getTransactions, type SleeperTransaction } from "@/lib/sleeper";
import { PageTitle, PlayerName } from "@/components/ui";

export const dynamic = "force-dynamic"; // Sleeper responses are still cached (see lib/sleeper.ts)
export const metadata = { title: "Transactions" };

const TYPE_LABEL: Record<string, string> = {
  trade: "Trade",
  waiver: "Waiver",
  free_agent: "Free Agent",
  commissioner: "Commish",
};

export default async function TransactionsPage() {
  const { league, teams } = await getLeagueData();
  const legs = Array.from({ length: league.settings.leg }, (_, i) => i + 1);
  const [players, ...perLeg] = await Promise.all([getPlayers(), ...legs.map((l) => getTransactions(l))]);
  const teamName = new Map(teams.map((t) => [t.rosterId, t.teamName]));
  const txns = (perLeg.flat() as SleeperTransaction[])
    .filter((t) => t.status === "complete")
    .sort((a, b) => b.created - a.created);

  return (
    <>
      <PageTitle title="Transactions" sub={`${txns.length} completed moves this season`} />
      <div className="grid gap-3">
        {txns.map((t) => {
          const sides = t.roster_ids.map((rid) => ({
            rid,
            adds: Object.entries(t.adds ?? {}).filter(([, r]) => r === rid).map(([p]) => p),
            drops: Object.entries(t.drops ?? {}).filter(([, r]) => r === rid).map(([p]) => p),
          }));
          return (
            <div key={t.transaction_id} className="card p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                <span
                  className={`rounded px-1.5 py-0.5 font-semibold ${
                    t.type === "trade"
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {TYPE_LABEL[t.type] ?? t.type}
                </span>
                <span>GW {t.leg}</span>
                <span>·</span>
                <span>{new Date(t.created).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                {t.type === "waiver" && t.settings?.waiver_bid != null && <span>· ${t.settings.waiver_bid} bid</span>}
              </div>
              <div className={`grid gap-4 ${sides.length > 1 ? "sm:grid-cols-2" : ""}`}>
                {sides.map((s) => (
                  <div key={s.rid}>
                    <div className="mb-1 text-sm font-semibold">{teamName.get(s.rid) ?? `Team ${s.rid}`}</div>
                    <ul className="space-y-1 text-sm">
                      {s.adds.map((p) => (
                        <li key={`a${p}`} className="flex items-center gap-2">
                          <span className="w-4 font-bold text-emerald-600">+</span>
                          <PlayerName p={players[p]} id={p} />
                        </li>
                      ))}
                      {s.drops.map((p) => (
                        <li key={`d${p}`} className="flex items-center gap-2">
                          <span className="w-4 font-bold text-rose-600">−</span>
                          <PlayerName p={players[p]} id={p} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
