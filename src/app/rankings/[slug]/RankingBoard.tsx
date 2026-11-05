"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { rankToValue } from "@/lib/value";
import { POSITION_STYLES } from "@/lib/positions";

export interface SlimPlayer {
  id: string;
  name: string;
  pos: string;
  team: string | null;
  injury: string | null;
}

interface Props {
  set: { slug: string; name: string; author: string; description: string | null; isOfficial: boolean; updatedAt: string };
  initialIds: string[];
  pool: SlimPlayer[];
  owners: Record<string, string>;
}

const POSITIONS = ["All", "GK", "D", "M", "F"] as const;

export default function RankingBoard({ set, initialIds, pool, owners }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);

  const [ids, setIds] = useState(initialIds);
  const [saved, setSaved] = useState(initialIds);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>("All");
  const [query, setQuery] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showNewBanner, setShowNewBanner] = useState(params.get("new") === "1");

  const dirty = ids !== saved && (ids.length !== saved.length || ids.some((x, i) => x !== saved[i]));

  // Pick up the edit key from the URL (then hide it) or from this browser's storage.
  useEffect(() => {
    const fromUrl = params.get("key");
    let key = fromUrl;
    try {
      if (fromUrl) localStorage.setItem(`editKey:${set.slug}`, fromUrl);
      key = key ?? localStorage.getItem(`editKey:${set.slug}`);
    } catch {}
    if (key) {
      setEditKey(key);
      setEditing(true);
    }
    if (fromUrl && !params.get("new")) router.replace(`/rankings/${set.slug}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Overall rank + positional rank (e.g. M12) for every listed player.
  const rows = useMemo(() => {
    const posCount: Record<string, number> = {};
    return ids.map((id, i) => {
      const p = byId.get(id);
      const ppos = p?.pos ?? "?";
      posCount[ppos] = (posCount[ppos] ?? 0) + 1;
      return { id, p, rank: i + 1, posRank: `${ppos}${posCount[ppos]}`, value: rankToValue(i + 1) };
    });
  }, [ids, byId]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) => (pos === "All" || r.p?.pos === pos) && (!q || r.p?.name.toLowerCase().includes(q) || r.p?.team?.toLowerCase() === q),
  );
  const filtered = pos !== "All" || q !== "";

  const listed = useMemo(() => new Set(ids), [ids]);
  const addResults = useMemo(() => {
    const aq = addQuery.trim().toLowerCase();
    if (aq.length < 2) return [];
    return pool.filter((p) => !listed.has(p.id) && p.name.toLowerCase().includes(aq)).slice(0, 8);
  }, [addQuery, pool, listed]);

  function move(from: number, to: number) {
    to = Math.max(0, Math.min(ids.length - 1, to));
    if (from === to) return;
    const next = [...ids];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setIds(next);
  }

  async function save() {
    if (!editKey) return;
    setStatus("Saving…");
    const res = await fetch(`/api/rankings/${set.slug}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-edit-key": editKey },
      body: JSON.stringify({ playerIds: ids }),
    });
    if (res.ok) {
      setSaved(ids);
      setStatus("Saved ✓");
      setTimeout(() => setStatus(null), 2000);
    } else {
      setStatus((await res.json()).error ?? "Save failed");
    }
  }

  async function remove() {
    if (!editKey || !confirm(`Delete “${set.name}” permanently?`)) return;
    const res = await fetch(`/api/rankings/${set.slug}`, { method: "DELETE", headers: { "x-edit-key": editKey } });
    if (res.ok) {
      try { localStorage.removeItem(`editKey:${set.slug}`); } catch {}
      router.push("/rankings");
    } else setStatus((await res.json()).error ?? "Delete failed");
  }

  function unlock() {
    const key = prompt("Enter the edit key for this list (or the site admin key):");
    if (!key) return;
    setEditKey(key);
    setEditing(true);
    try { localStorage.setItem(`editKey:${set.slug}`, key); } catch {}
  }

  const editUrl = typeof window !== "undefined" && editKey ? `${window.location.origin}/rankings/${set.slug}?key=${editKey}` : "";

  return (
    <>
      {showNewBanner && editKey && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <p className="font-semibold">Save your private edit link.</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            This browser remembers it, but you&apos;ll need this link to edit from anywhere else. Don&apos;t share it.
          </p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={editUrl} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(editUrl)}>Copy</button>
            <button
              className="btn-ghost"
              onClick={() => {
                setShowNewBanner(false);
                router.replace(`/rankings/${set.slug}`);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{set.name}</h1>
            {set.isOfficial && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Official
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            by {set.author} · {ids.length} players · updated {new Date(set.updatedAt).toLocaleDateString()}
          </p>
          {set.description && <p className="mt-2 max-w-2xl text-sm">{set.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {status && <span className="text-sm text-zinc-500">{status}</span>}
          {editing ? (
            <>
              <button onClick={save} disabled={!dirty} className="btn-primary">Save changes</button>
              <button onClick={() => { setIds(saved); }} disabled={!dirty} className="btn-ghost">Discard</button>
              <button onClick={remove} className="btn-ghost text-rose-600">Delete</button>
            </>
          ) : (
            <button onClick={unlock} className="btn-ghost">Edit</button>
          )}
          <a href={`/trade?rankings=${set.slug}`} className="btn-ghost">Use in trade calc →</a>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => setPos(p)}
              className={`rounded-md px-3 py-1 text-sm ${pos === p ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or club (e.g. ARS)" className="input max-w-xs" />
        {editing && (
          <div className="relative ml-auto w-full max-w-xs">
            <input value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="+ Add a player to the list" className="input" />
            {addResults.length > 0 && (
              <ul className="card absolute right-0 z-10 mt-1 w-full overflow-hidden shadow-lg">
                {addResults.map((p) => (
                  <li key={p.id}>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => {
                        setIds([...ids, p.id]);
                        setAddQuery("");
                      }}
                    >
                      <Pos pos={p.pos} /> {p.name} <span className="text-xs text-zinc-500">{p.team}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {editing && (
        <p className="mb-3 text-xs text-zinc-500">
          {filtered
            ? "Dragging is off while filtered. Type a new rank number to move a player."
            : "Drag rows to reorder, or type a new rank number. Don't forget to save."}
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="th w-20">Rank</th>
              <th className="th w-16">Pos</th>
              <th className="th">Player</th>
              <th className="th">Owner</th>
              <th className="th text-right">Value</th>
              {editing && <th className="th w-24" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const i = r.rank - 1;
              return (
                <tr
                  key={r.id}
                  draggable={editing && !filtered}
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(e) => editing && !filtered && e.preventDefault()}
                  onDrop={() => {
                    if (dragFrom !== null) move(dragFrom, i);
                    setDragFrom(null);
                  }}
                  className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800/60 ${
                    editing && !filtered ? "cursor-grab active:cursor-grabbing" : ""
                  } ${dragFrom === i ? "opacity-40" : ""}`}
                >
                  <td className="td">
                    {editing ? (
                      <RankInput rank={r.rank} onCommit={(n) => move(i, n - 1)} />
                    ) : (
                      <span className="font-semibold tabular-nums">{r.rank}</span>
                    )}
                  </td>
                  <td className="td text-xs text-zinc-500">{r.posRank}</td>
                  <td className="td">
                    <span className="inline-flex items-center gap-2">
                      <Pos pos={r.p?.pos ?? "?"} />
                      <span className="font-medium">{r.p?.name ?? `Unknown (${r.id})`}</span>
                      <span className="text-xs text-zinc-500">{r.p?.team ?? ""}</span>
                      {r.p?.injury && <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">{r.p.injury}</span>}
                    </span>
                  </td>
                  <td className="td text-xs text-zinc-500">{owners[r.id] ?? <span className="text-emerald-600">Free agent</span>}</td>
                  <td className="td text-right tabular-nums">{r.value.toLocaleString()}</td>
                  {editing && (
                    <td className="td text-right whitespace-nowrap">
                      <button className="px-1 text-zinc-400 hover:text-foreground" title="Up" onClick={() => move(i, i - 1)}>↑</button>
                      <button className="px-1 text-zinc-400 hover:text-foreground" title="Down" onClick={() => move(i, i + 1)}>↓</button>
                      <button className="px-1 text-zinc-400 hover:text-rose-600" title="Remove" onClick={() => setIds(ids.filter((x) => x !== r.id))}>✕</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="p-6 text-center text-sm text-zinc-500">No players match.</p>}
      </div>
    </>
  );
}

function Pos({ pos }: { pos: string }) {
  return (
    <span className={`inline-block w-8 rounded px-1 py-0.5 text-center text-[11px] font-bold ${POSITION_STYLES[pos] ?? "bg-zinc-100"}`}>
      {pos}
    </span>
  );
}

function RankInput({ rank, onCommit }: { rank: number; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(rank));
  useEffect(() => setV(String(rank)), [rank]);
  const commit = () => {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n !== rank) onCommit(n);
    else setV(String(rank));
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold tabular-nums hover:border-zinc-300 focus:border-emerald-500 focus:outline-none dark:hover:border-zinc-700"
    />
  );
}
