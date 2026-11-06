import { getLeagueData } from "@/lib/league";
import { AVERAGE_SLUG, listRankingSets, playerPool, POINTS_SLUG } from "@/lib/rankings";
import { PageTitle } from "@/components/ui";
import TradeCalculator from "./TradeCalculator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trade Calculator" };

export default async function TradePage({ searchParams }: { searchParams: Promise<{ rankings?: string }> }) {
  const { rankings } = await searchParams;
  const [{ teams }, pool, sets] = await Promise.all([getLeagueData(), playerPool(), listRankingSets()]);
  const initialSlug =
    rankings === AVERAGE_SLUG || rankings === POINTS_SLUG ? rankings : (sets.find((s) => s.slug === rankings) ?? sets[0])?.slug;

  return (
    <>
      <PageTitle
        title="Trade Calculator"
      />
      {sets.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-500">
          Create a rankings list first. The calculator needs one to value players.
        </div>
      ) : (
        <TradeCalculator
          sets={[
            ...sets.map((s) => ({ slug: s.slug, name: s.name, author: s.author, isOfficial: s.isOfficial })),
            // Average of every list above (each player's value averaged across the lists that rank them).
            { slug: AVERAGE_SLUG, name: `Average of all ${sets.length} rankings`, author: "", isOfficial: false },
            // Season fantasy points order, tiers borrowed rank-for-rank from the official list.
            { slug: POINTS_SLUG, name: "Total Points", author: "", isOfficial: false },
          ]}
          initialSlug={initialSlug!}
          teams={teams.map((t) => ({ rosterId: t.rosterId, name: t.teamName, players: t.players }))}
          pool={pool.map(({ id, name, pos, positions, team, injury }) => ({ id, name, pos, positions, team, injury }))}
        />
      )}
    </>
  );
}
