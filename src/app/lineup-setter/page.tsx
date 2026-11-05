import { prisma } from "@/lib/db";
import { currentSetter } from "@/lib/lineupSession";
import { lineupConfigured } from "@/lib/secure";
import { getUsers, getRosters } from "@/lib/sleeper";
import { PRIORITY_LABEL } from "@/lib/lineup";
import { PageTitle } from "@/components/ui";
import LineupSetterClient from "./LineupSetterClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lineup Setter" };

export default async function LineupSetterPage() {
  const configured = lineupConfigured();
  const setter = configured ? await currentSetter() : null;

  let teamName: string | null = null;
  let runs: { id: string; week: number; blockStart: string; status: string; message: string; seen: boolean; createdAt: string }[] = [];
  if (setter) {
    const [rosters, users, rows] = await Promise.all([
      getRosters(),
      getUsers(),
      prisma.lineupRun.findMany({ where: { setterId: setter.id }, orderBy: { createdAt: "desc" }, take: 40 }),
    ]);
    const owner = rosters.find((r) => r.roster_id === setter.rosterId)?.owner_id;
    teamName = users.find((u) => u.user_id === owner)?.metadata?.team_name ?? null;
    runs = rows.map((r) => ({
      id: r.id,
      week: r.week,
      blockStart: r.blockStart.toISOString(),
      status: r.status,
      message: r.message,
      seen: r.seen,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  return (
    <>
      <PageTitle
        title="Lineup Setter"
        sub="Automatically benches starters who aren't in their club's starting XI, once team sheets come out (about an hour before kickoff)."
      />
      {!configured ? (
        <div className="card p-6 text-sm text-zinc-600 dark:text-zinc-400">
          Lineup Setter isn&apos;t set up on this site yet. The site owner needs to add the <code>LINEUP_SECRET</code> and{" "}
          <code>CRON_SECRET</code> settings (see the README).
        </div>
      ) : (
        <LineupSetterClient
          setter={
            setter
              ? { displayName: setter.displayName, teamName, enabled: setter.enabled, tokenOk: setter.tokenOk }
              : null
          }
          runs={runs}
          priorities={PRIORITY_LABEL}
        />
      )}
    </>
  );
}
