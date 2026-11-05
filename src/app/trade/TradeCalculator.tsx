"use client";

import { useEffect, useMemo, useState } from "react";
import { DEPTH_FACTOR, rankToValue, scoreSide, verdict } from "@/lib/value";
import { POSITION_STYLES } from "@/lib/positions";
import type { SlimPlayer } from "../rankings/[slug]/RankingBoard";

interface Props {
  sets: { slug: string; name: string; author: string; isOfficial: boolean }[];
  initialSlug: string;
  teams: { rosterId: number; name: string; players: string[] }[];
  pool: SlimPlayer[];
}

interface SideState {
  rosterId: number | null; // null = any player in the pool
  players: string[];
}

export default function TradeCalculator({ sets, initialSlug, teams, pool }: Props) {
  const [slug, setSlug] = useState(initialSlug);
  const [ranks, setRanks] = useState<Map<string, number> | null>(null);
  const [sides, setSides] = useState<[SideState, SideState]>([
    { rosterId: teams[0]?.rosterId ?? null, players: [] },
    { rosterId: teams[1]?.rosterId ?? null, players: [] },
  ]);
  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);

  useEffect(() => {
    let cancelled = false;
    setRanks(null);
    fetch(`/api/rankings/${slug}`)
      .then((r) => r.json())
      .then((d: { entries: { playerId: string; rank: number }[] }) => {
        if (!cancelled) setRanks(new Map(d.entries.map((e) => [e.playerId, e.rank])));
      });
    const url = new URL(window.location.href);
    url.searchParams.set("rankings", slug);
    window.history.replaceState(null, "", url);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const valueOf = (id: string) => rankToValue(ranks?.get(id));
  const scores = sides.map((s) => scoreSide(s.players.map(valueOf)));
  // Side A *sends* its players to B, so whoever *receives* more value comes out ahead.
  const v = verdict(scores[1].adjusted, scores[0].adjusted); // "A" here = side A receives more
  const teamName = (i: 0 | 1) => teams.find((t) => t.rosterId === sides[i].rosterId)?.name ?? `Side ${"AB"[i]}`;

  const update = (i: 0 | 1, s: Partial<SideState>) =>
    setSides((prev) => {
      const next = [...prev] as [SideState, SideState];
      next[i] = { ...next[i], ...s };
      return next;
    });

  // Suggest players the side coming out ahead could add to even things up.
  const suggestions = useMemo(() => {
    if (!ranks || v.winner === null) return null;
    const short = (v.winner === "A" ? 0 : 1) as 0 | 1; // the side getting the better deal must send more
    const target = scores[short === 0 ? 1 : 0].adjusted;
    const roster = teams.find((t) => t.rosterId === sides[short].rosterId)?.players;
    if (!roster) return null;
    const inTrade = new Set([...sides[0].players, ...sides[1].players]);
    const current = sides[short].players.map(valueOf);
    const opts = roster
      .filter((id) => !inTrade.has(id) && valueOf(id) > 0)
      .map((id) => ({ id, total: scoreSide([...current, valueOf(id)]).adjusted }))
      .sort((a, b) => Math.abs(a.total - target) - Math.abs(b.total - target))
      .slice(0, 4);
    return { short, opts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranks, sides, v.winner]);

  const total = scores[0].adjusted + scores[1].adjusted;
  const pctA = total ? (scores[0].adjusted / total) * 100 : 50;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Rankings:</span>
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className="input max-w-sm">
          {sets.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.isOfficial ? "★ " : ""}
              {s.name}, by {s.author}
            </option>
          ))}
        </select>
        {!ranks && <span className="text-zinc-500">Loading…</span>}
        <button className="btn-ghost ml-auto" onClick={() => setSides(([a, b]) => [{ ...a, players: [] }, { ...b, players: [] }])}>
          Clear
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {([0, 1] as const).map((i) => (
          <SidePanel
            key={i}
            label={`${"AB"[i]} sends`}
            side={sides[i]}
            teams={teams}
            pool={pool}
            byId={byId}
            valueOf={valueOf}
            ranks={ranks}
            exclude={new Set([...sides[0].players, ...sides[1].players])}
            score={scores[i]}
            onChange={(s) => update(i, s)}
          />
        ))}
      </div>

      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-lg font-bold">
            {v.winner === null
              ? v.label
              : `${v.label}: ${teamName(v.winner === "A" ? 0 : 1)} wins by ${v.pct}%`}
          </div>
          <div className="text-xs text-zinc-500">
            Each extra player in a package counts for {Math.round(DEPTH_FACTOR * 100)}% of the one before it.
          </div>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="bg-sky-500 transition-all" style={{ width: `${pctA}%` }} />
          <div className="bg-violet-500 transition-all" style={{ width: `${100 - pctA}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-zinc-500">
          <span>{teamName(0)} sends {scores[0].adjusted.toLocaleString()}</span>
          <span>{teamName(1)} sends {scores[1].adjusted.toLocaleString()}</span>
        </div>

        {suggestions && suggestions.opts.length > 0 && (
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="mb-2 text-sm font-medium">To even it up, {teamName(suggestions.short)} could add:</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.opts.map((o) => {
                const p = byId.get(o.id);
                return (
                  <button
                    key={o.id}
                    className="btn-ghost"
                    onClick={() => update(suggestions.short, { players: [...sides[suggestions.short].players, o.id] })}
                  >
                    + {p?.name ?? o.id} <span className="text-xs text-zinc-500">({valueOf(o.id).toLocaleString()})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SidePanel(props: {
  label: string;
  side: SideState;
  teams: Props["teams"];
  pool: SlimPlayer[];
  byId: Map<string, SlimPlayer>;
  valueOf: (id: string) => number;
  ranks: Map<string, number> | null;
  exclude: Set<string>;
  score: { raw: number; adjusted: number };
  onChange: (s: Partial<SideState>) => void;
}) {
  const { side, teams, pool, byId, valueOf, ranks, exclude, score, onChange } = props;
  const [q, setQ] = useState("");
  const roster = teams.find((t) => t.rosterId === side.rosterId)?.players;

  const options = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const base = roster ? roster.map((id) => byId.get(id)).filter((p): p is SlimPlayer => !!p) : pool;
    return base
      .filter((p) => !exclude.has(p.id) && (!ql || p.name.toLowerCase().includes(ql)))
      .sort((a, b) => valueOf(b.id) - valueOf(a.id))
      .slice(0, roster && !ql ? 30 : 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, roster, pool, exclude, ranks]);

  return (
    <div className="card flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{props.label}</span>
        <select
          value={side.rosterId ?? ""}
          onChange={(e) => onChange({ rosterId: e.target.value ? Number(e.target.value) : null, players: [] })}
          className="input"
        >
          {teams.map((t) => (
            <option key={t.rosterId} value={t.rosterId}>
              {t.name}
            </option>
          ))}
          <option value="">Any player</option>
        </select>
      </div>

      <ul className="mb-3 min-h-16 space-y-1">
        {side.players.map((id) => {
          const p = byId.get(id);
          return (
            <li key={id} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2 py-1.5 text-sm dark:bg-zinc-800/50">
              <Pos pos={p?.pos ?? "?"} />
              <span className="font-medium">{p?.name ?? id}</span>
              <span className="text-xs text-zinc-500">{p?.team}</span>
              <span className="ml-auto text-xs text-zinc-500">{ranks?.has(id) ? `#${ranks.get(id)}` : "unranked"}</span>
              <span className="w-14 text-right tabular-nums">{valueOf(id).toLocaleString()}</span>
              <button className="text-zinc-400 hover:text-rose-600" onClick={() => onChange({ players: side.players.filter((x) => x !== id) })}>
                ✕
              </button>
            </li>
          );
        })}
        {side.players.length === 0 && <li className="py-4 text-center text-sm text-zinc-400">No players added</li>}
      </ul>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={roster ? "Search this roster…" : "Search all players…"} className="input mb-2" />
      <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        {options.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              onChange({ players: [...side.players, p.id] });
              setQ("");
            }}
            className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Pos pos={p.pos} />
            {p.name}
            <span className="text-xs text-zinc-500">{p.team}</span>
            <span className="ml-auto text-xs tabular-nums text-zinc-500">{valueOf(p.id).toLocaleString()}</span>
          </button>
        ))}
        {options.length === 0 && <p className="p-2 text-xs text-zinc-500">{q ? "No matches" : "Type to search"}</p>}
      </div>

      <div className="mt-3 flex justify-between border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
        <span className="text-zinc-500">Raw total {score.raw.toLocaleString()}</span>
        <span className="font-semibold">Adjusted {score.adjusted.toLocaleString()}</span>
      </div>
    </div>
  );
}

function Pos({ pos }: { pos: string }) {
  return (
    <span className={`inline-block w-8 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-bold ${POSITION_STYLES[pos] ?? "bg-zinc-100"}`}>
      {pos}
    </span>
  );
}
