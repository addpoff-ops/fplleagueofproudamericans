import Link from "next/link";
import { listRankingSets } from "@/lib/rankings";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rankings" };

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
        <div className="grid gap-3 sm:grid-cols-2">
          {sets.map((s) => (
            <Link key={s.slug} href={`/rankings/${s.slug}`} className="card block p-4 hover:border-emerald-500">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{s.name}</span>
                {s.isOfficial && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Official
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                by {s.author} · {s.count} players · updated {new Date(s.updatedAt).toLocaleDateString()}
              </div>
              {s.description && <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{s.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
