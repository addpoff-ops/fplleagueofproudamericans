import { getLeagueData, POSITION_STYLES } from "@/lib/league";
import { getDraftPicks } from "@/lib/sleeper";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic"; // Sleeper responses are still cached (see lib/sleeper.ts)
export const metadata = { title: "Draft" };

export default async function DraftPage() {
  const { league, teams } = await getLeagueData();
  const picks = await getDraftPicks(league.draft_id);
  const n = league.settings.num_teams;
  const rounds = Math.max(0, ...picks.map((p) => p.round));
  const bySlot = new Map(picks.map((p) => [`${p.round}-${p.draft_slot}`, p]));
  // Slot owner = whoever picked in that slot in round 1.
  const slotTeam = new Map(
    picks.filter((p) => p.round === 1).map((p) => [p.draft_slot, teams.find((t) => t.rosterId === p.roster_id)]),
  );

  return (
    <>
      <PageTitle title={`${league.season} Draft Board`} sub={`${rounds} rounds · ${picks.length} picks`} />
      <div className="card overflow-x-auto p-2">
        <div className="grid min-w-[1100px] gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="truncate px-1 pb-1 text-center text-xs font-semibold">
              {slotTeam.get(i + 1)?.teamName ?? `Slot ${i + 1}`}
            </div>
          ))}
          {Array.from({ length: rounds }, (_, r) =>
            Array.from({ length: n }, (_, s) => {
              const p = bySlot.get(`${r + 1}-${s + 1}`);
              if (!p) return <div key={`${r}-${s}`} />;
              const pos = p.metadata.position;
              return (
                <div key={`${r}-${s}`} className={`rounded p-1.5 text-xs ${POSITION_STYLES[pos] ?? "bg-zinc-100"}`}>
                  <div className="text-[10px] opacity-70">
                    {p.round}.{String(p.pick_no - (p.round - 1) * n).padStart(2, "0")} · {pos} · {p.metadata.team_abbr}
                  </div>
                  <div className="truncate font-semibold">
                    {p.metadata.first_name} {p.metadata.last_name}
                  </div>
                </div>
              );
            }),
          )}
        </div>
      </div>
    </>
  );
}
