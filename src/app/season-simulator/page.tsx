import { getLeagueData } from "@/lib/league";
import { teamPowerTotals } from "@/lib/rankings";
import { getSchedule } from "@/lib/schedule";
import { PageTitle } from "@/components/ui";
import SimulatorClient from "./SimulatorClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Season Simulator" };

const FIRST_WEEK = 11;
const LAST_WEEK = 38;

export default async function SeasonSimulatorPage() {
  const { teams } = await getLeagueData();
  const [totals, schedule] = await Promise.all([teamPowerTotals(teams), getSchedule(FIRST_WEEK, LAST_WEEK)]);

  return (
    <>
      <PageTitle title="Season Simulator" />
      {!schedule || schedule.length === 0 ? (
        <div className="card p-6 text-sm text-zinc-600 dark:text-zinc-400">
          The future schedule isn&apos;t available yet. Sleeper only shares matchups with signed-in members, so this page
          reads them using a connected Lineup Setter account. Connect one on the Lineup Setter tab, then reload this page.
        </div>
      ) : (
        <SimulatorClient
          firstWeek={FIRST_WEEK}
          lastWeek={LAST_WEEK}
          games={schedule}
          teams={teams.map((t) => ({
            rosterId: t.rosterId,
            name: t.teamName,
            owner: t.ownerName,
            avatar: t.avatar,
            wins: t.wins,
            losses: t.losses,
            ties: t.ties,
            pointsFor: t.pointsFor,
            power: totals.get(t.rosterId) ?? 0,
          }))}
        />
      )}
    </>
  );
}
