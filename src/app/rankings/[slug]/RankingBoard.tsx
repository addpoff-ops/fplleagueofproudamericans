"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { POSITIONS, POSITION_LABEL, TIERS, tierValue, type Pos, type Tier } from "@/lib/value";
import { POSITION_STYLES } from "@/lib/positions";

export interface SlimPlayer {
  id: string;
  name: string;
  pos: string;
  positions: string[];
  team: string | null;
  injury: string | null;
}

export type Sections = Record<Pos, { playerId: string; tier: Tier }[]>;

interface Props {
  set: { slug: string; name: string; author: string; description: string | null; isOfficial: boolean; updatedAt: string };
  initialSections: Sections;
  pool: SlimPlayer[];
  owners: Record<string, string>;
}

const TIER_STYLES: Record<Tier, string> = {
  S: "bg-amber-400 text-amber-950",
  A: "bg-emerald-500 text-white",
  B: "bg-teal-500 text-white",
  C: "bg-sky-500 text-white",
  D: "bg-indigo-500 text-white",
  E: "bg-violet-500 text-white",
  F: "bg-zinc-500 text-white",
  Z: "bg-zinc-300 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
};

export default function RankingBoard({ set, initialSections, pool, owners }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);

  const [sections, setSections] = useState(initialSections);
  const [saved, setSaved] = useState(initialSections);
  const [tab, setTab] = useState<Pos>("F");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showNewBanner, setShowNewBanner] = useState(params.get("new") === "1");

  const dirty = sections !== saved && JSON.stringify(sections) !== JSON.stringify(saved);
  const list = sections[tab];

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
    const hashPos = window.location.hash.slice(1).toUpperCase();
    const fromHash = POSITIONS.find((p) => POSITION_LABEL[p] === hashPos);
    if (fromHash) setTab(fromHash);
    if (fromUrl && !params.get("new")) router.replace(`/rankings/${set.slug}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const setList = (next: Sections[Pos]) => setSections((s) => ({ ...s, [tab]: next }));

  function move(from: number, to: number) {
    to = Math.max(0, Math.min(list.length - 1, to));
    if (from === to) return;
    const next = [...list];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setList(next);
  }

  const q = query.trim().toLowerCase();
  const rows = list
    .map((e, i) => ({ ...e, i, p: byId.get(e.playerId) }))
    .filter((r) => !q || r.p?.name.toLowerCase().includes(q) || r.p?.team?.toLowerCase() === q);

  const ranked = useMemo(() => new Set(POSITIONS.flatMap((p) => sections[p].map((e) => e.playerId))), [sections]);
  const addResults = useMemo(() => {
    const aq = addQuery.trim().toLowerCase();
    if (aq.length < 2) return [];
    return pool
      .filter((p) => !ranked.has(p.id) && p.positions.includes(tab) && p.name.toLowerCase().includes(aq))
      .slice(0, 8);
  }, [addQuery, pool, ranked, tab]);

  async function save() {
    if (!editKey) return;
    setStatus("Saving…");
    const res = await fetch(`/api/rankings/${set.slug}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-edit-key": editKey },
      body: JSON.stringify({ sections }),
    });
    if (res.ok) {
      setSaved(sections);
      setStatus("Saved ✓");
      setTimeout(() => setStatus(null), 2000);
    } else setStatus((await res.json()).error ?? "Save failed");
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
  const total = POSITIONS.reduce((s, p) => s + sections[p].length, 0);

  return (
    <>
      {showNewBanner && editKey && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <p className="font-semibold">Save your private edit link.</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            This browser remembers it, but you&apos;ll need this link to edit from anywhere else. Don&apos;t share it.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input readOnly value={editUrl} className="input max-w-xl font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(editUrl)}>Copy</button>
            <button className="btn-ghost" onClick={() => { setShowNewBanner(false); router.replace(`/rankings/${set.slug}`); }}>
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
            by {set.author} · {total} players · updated {new Date(set.updatedAt).toLocaleDateString()}
          </p>
          {set.description && <p className="mt-2 max-w-2xl text-sm">{set.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status && <span className="text-sm text-zinc-500">{status}</span>}
          {editing ? (
            <>
              <button onClick={save} disabled={!dirty} className="btn-primary">Save changes</button>
              <button onClick={() => setSections(saved)} disabled={!dirty} className="btn-ghost">Discard</button>
              <button onClick={remove} className="btn-ghost text-rose-600">Delete</button>
            </>
          ) : (
            <button onClick={unlock} className="btn-ghost">Edit</button>
          )}
          <a href={`/trade?rankings=${set.slug}`} className="btn-ghost">Use in trade calc →</a>
        </div>
      </div>

      {/* The four position sections */}
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setTab(p);
              setQuery("");
              setAddQuery("");
              history.replaceState(null, "", `#${POSITION_LABEL[p].toLowerCase()}`);
            }}
            className={`rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
              tab === p ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {POSITION_LABEL[p]} <span className="font-normal opacity-60">{sections[p].length}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or club (e.g. ARS)" className="input max-w-xs" />
        {editing && (
          <div className="relative w-full max-w-xs sm:ml-auto">
            <input value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder={`+ Add a ${POSITION_LABEL[tab]} to the list`} className="input" />
            {addResults.length > 0 && (
              <ul className="card absolute right-0 z-10 mt-1 w-full overflow-hidden shadow-lg">
                {addResults.map((p) => (
                  <li key={p.id}>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => {
                        setList([...list, { playerId: p.id, tier: "Z" }]);
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
          {q
            ? "Dragging is off while filtered. Type a new rank number to move a player."
            : "Drag rows or type a rank number to reorder. Pick a tier to set a player's trade value. Don't forget to save."}
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="th w-20">{POSITION_LABEL[tab]} Rank</th>
              <th className="th">Player</th>
              <th className="th w-20">Tier</th>
              <th className="th hidden sm:table-cell">Owner</th>
              <th className="th text-right">Value</th>
              {editing && <th className="th w-24" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const newTier = !q && (idx === 0 || rows[idx - 1].tier !== r.tier);
              return (
                <FragmentRow key={r.playerId}>
                  {newTier && (
                    <tr className="bg-zinc-50 dark:bg-zinc-800/40">
                      <td colSpan={editing ? 6 : 5} className="px-3 py-1.5 text-xs font-semibold text-zinc-500">
                        Tier {r.tier} · {tierValue(tab, r.tier).toLocaleString()} pts
                      </td>
                    </tr>
                  )}
                  <tr
                    draggable={editing && !q}
                    onDragStart={() => setDragFrom(r.i)}
                    onDragOver={(e) => editing && !q && e.preventDefault()}
                    onDrop={() => {
                      if (dragFrom !== null) move(dragFrom, r.i);
                      setDragFrom(null);
                    }}
                    className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800/60 ${editing && !q ? "cursor-grab active:cursor-grabbing" : ""} ${dragFrom === r.i ? "opacity-40" : ""}`}
                  >
                    <td className="td">
                      {editing ? <RankInput rank={r.i + 1} onCommit={(n) => move(r.i, n - 1)} /> : <span className="font-semibold tabular-nums">{r.i + 1}</span>}
                    </td>
                    <td className="td">
                      <span className="inline-flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">{r.p?.name ?? `Unknown (${r.playerId})`}</span>
                        <span className="text-xs text-zinc-500">{r.p?.team ?? ""}</span>
                        {r.p?.injury && <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">{r.p.injury}</span>}
                      </span>
                    </td>
                    <td className="td">
                      {editing ? (
                        <select
                          value={r.tier}
                          onChange={(e) => setList(list.map((x, j) => (j === r.i ? { ...x, tier: e.target.value as Tier } : x)))}
                          className={`rounded px-1.5 py-0.5 text-xs font-bold ${TIER_STYLES[r.tier]}`}
                        >
                          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-block w-6 rounded py-0.5 text-center text-xs font-bold ${TIER_STYLES[r.tier]}`}>{r.tier}</span>
                      )}
                    </td>
                    <td className="td hidden text-xs text-zinc-500 sm:table-cell">{owners[r.playerId] ?? <span className="text-emerald-600">Free agent</span>}</td>
                    <td className="td text-right tabular-nums">{tierValue(tab, r.tier).toLocaleString()}</td>
                    {editing && (
                      <td className="td whitespace-nowrap text-right">
                        <button className="px-1 text-zinc-400 hover:text-foreground" title="Up" onClick={() => move(r.i, r.i - 1)}>↑</button>
                        <button className="px-1 text-zinc-400 hover:text-foreground" title="Down" onClick={() => move(r.i, r.i + 1)}>↓</button>
                        <button className="px-1 text-zinc-400 hover:text-rose-600" title="Remove" onClick={() => setList(list.filter((_, j) => j !== r.i))}>✕</button>
                      </td>
                    )}
                  </tr>
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-zinc-500">{list.length ? "No players match." : `No ${POSITION_LABEL[tab]}s ranked yet.`}</p>}
      </div>
    </>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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
