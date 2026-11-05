import { getLeagueData } from "@/lib/league";
import { listRankingSets, playerPool } from "@/lib/rankings";
import { PageTitle } from "@/components/ui";
import TradeCalculator from "./TradeCalculator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trade Calculator" };

export default async function TradePage({ searchParams }: { searchParams: Promise<{ rankings?: string }> }) {
  const { rankings } = await searchParams;
  const [{ teams }, pool, sets] = await Promise.all([getLeagueData(), playerPool(), listRankingSets()]);
  const initial = sets.find((s) => s.slug === rankings) ?? sets[0];

  return (
    <>
      <PageTitle
        title="Trade Calculator"
        sub="Values come from whichever rankings list you pick: #1 is worth 10,000, and value drops off quickly down the list."
      />
      {sets.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-500">
          Create a rankings list first. The calculator needs one to value players.
        </div>
      ) : (
        <TradeCalculator
          sets={sets.map((s) => ({ slug: s.slug, name: s.name, author: s.author, isOfficial: s.isOfficial }))}
          initialSlug={initial.slug}
          teams={teams.map((t) => ({ rosterId: t.rosterId, name: t.teamName, players: t.players }))}
          pool={pool.map(({ id, name, pos, team, injury }) => ({ id, name, pos, team, injury }))}
        />
      )}
    </>
  );
}
