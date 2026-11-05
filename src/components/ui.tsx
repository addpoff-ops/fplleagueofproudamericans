import { POSITION_STYLES } from "@/lib/league";
import type { Player } from "@/lib/sleeper";
export { Avatar } from "./Avatar";

export function PosBadge({ pos }: { pos: string }) {
  return (
    <span
      className={`inline-block w-8 rounded px-1 py-0.5 text-center text-[11px] font-bold ${POSITION_STYLES[pos] ?? "bg-zinc-100 text-zinc-700"}`}
    >
      {pos}
    </span>
  );
}

export function PlayerName({ p, id }: { p?: Player; id: string }) {
  if (!p) return <span className="text-zinc-400">Unknown ({id})</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <PosBadge pos={p.pos} />
      <span className="font-medium">{p.name}</span>
      <span className="text-xs text-zinc-500">{p.team ?? "FA"}</span>
      {p.injury && (
        <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
          {p.injury}
        </span>
      )}
    </span>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-sm text-zinc-500">{sub}</p>}
    </div>
  );
}
