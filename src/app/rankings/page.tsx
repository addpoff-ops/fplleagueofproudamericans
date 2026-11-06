import Link from "next/link";
import { listRankingSets } from "@/lib/rankings";
import { PageTitle } from "@/components/ui";
import RankingsList from "./RankingsList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Player Rankings" };

export default async function RankingsPage() {
  const sets = await listRankingSets();
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle
          title="Player Rankings"
          sub="The official rankings plus everyone else's. Any list can drive the trade calculator."
        />
        <Link href="/rankings/new" className="btn-primary">
          + Create your rankings
        </Link>
      </div>
      {sets.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-500">
          No rankings yet. <Link href="/rankings/new" className="text-emerald-600 underline">Create the first list</Link>.
        </div>
      ) : (
        <RankingsList sets={sets} />
      )}
    </>
  );
}
