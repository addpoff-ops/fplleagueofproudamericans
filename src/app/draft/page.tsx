import { getLeagueData, POSITION_STYLES } from "@/lib/league";
import { getDraftPicks } from "@/lib/sleeper";
import { PageTitle } from "@/components/ui";
import FitText from "@/components/FitText";

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
      {/* The board is 1.5x the area of the normal page column (~1.22x wider and
          taller), so it breaks out of the column on wide screens. */}
      <div className="relative left-1/2 w-[min(1372px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="card overflow-x-auto p-2.5">
        <div className="grid min-w-[1350px] gap-[5px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="truncate px-1 pb-1.5 text-center text-[8.7px] font-semibold">
              {slotTeam.get(i + 1)?.teamName ?? `Slot ${i + 1}`}
            </div>
          ))}
          {Array.from({ length: rounds }, (_, r) =>
            Array.from({ length: n }, (_, s) => {
              const p = bySlot.get(`${r + 1}-${s + 1}`);
              if (!p) return <div key={`${r}-${s}`} />;
              const pos = p.metadata.position;
              return (
                <div key={`${r}-${s}`} className={`flex min-h-[52px] flex-col justify-center rounded-md p-[7px] text-[8.7px] leading-[1.43] ${POSITION_STYLES[pos] ?? "bg-zinc-100"}`}>
                  <div className="truncate text-[7.2px] opacity-70">
                    {p.round}.{String(p.pick_no - (p.round - 1) * n).padStart(2, "0")} · {pos} · {p.metadata.team_abbr}
                  </div>
                  {/* Sleeper's font (Muli/Mulish), sized so the whole name fills the box */}
                  <FitText
                    text={`${p.metadata.first_name} ${p.metadata.last_name}`.trim()}
                    max={16}
                    className="font-['Mulish','Muli',sans-serif] font-extrabold"
                  />
                </div>
              );
            }),
          )}
        </div>
      </div>
      </div>
    </>
  );
}
