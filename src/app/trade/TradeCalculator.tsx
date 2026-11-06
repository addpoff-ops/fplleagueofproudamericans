"use client";

import { useEffect, useMemo, useState } from "react";
import { POSITION_LABEL, scoreSide, verdict, type RankedEntry } from "@/lib/value";
import { POSITION_STYLES } from "@/lib/positions";
import type { SlimPlayer } from "../rankings/[slug]/RankingBoard";
import type { PastTrade } from "@/lib/trades";

interface Props {
  sets: { slug: string; name: string; author: string; isOfficial: boolean }[];
  initialSlug: string;
  teams: { rosterId: number; name: string; players: string[] }[];
  pool: SlimPlayer[];
  pastTrades: PastTrade[];
  tradePlayers: Record<string, { name: string; pos: string; team: string | null }>;
}

interface SideState {
  rosterId: number | null; // null = any player in the pool
  players: string[];
}

export default function TradeCalculator({ sets, initialSlug, teams, pool, pastTrades, tradePlayers }: Props) {
  const [slug, setSlug] = useState(initialSlug);
  const [ranks, setRanks] = useState<Map<string, RankedEntry> | null>(null);
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
      .then((d: { entries: RankedEntry[] }) => {
        if (!cancelled) setRanks(new Map(d.entries.map((e) => [e.playerId, e])));
      });
    const url = new URL(window.location.href);
    url.searchParams.set("rankings", slug);
    window.history.replaceState(null, "", url);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const valueOf = (id: string) => ranks?.get(id)?.value ?? 0;
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
              {s.name}
              {s.author ? `, by ${s.author}` : ""}
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
              : `${v.label}: ${teamName(v.winner === "A" ? 0 : 1)} wins`}
          </div>
          <div className="text-xs text-zinc-500">
            In a package, the 2nd player counts 60%, the 3rd 30%, and each one after that half the one before.
          </div>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="bg-[#4c1d95] transition-all" style={{ width: `${pctA}%` }} />
          <div className="bg-black transition-all" style={{ width: `${100 - pctA}%` }} />
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

      <PastTrades
        trades={pastTrades}
        teams={teams}
        players={tradePlayers}
        ranks={ranks}
        valueOf={valueOf}
        onOpen={(t) => {
          // Load a two-team trade into the calculator: each side sends what the other received.
          const [a, b] = t.sides;
          setSides([
            { rosterId: a.rosterId, players: b.receives },
            { rosterId: b.rosterId, players: a.receives },
          ]);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}

/** Every completed trade this season, scored with the selected rankings list. */
function PastTrades({
  trades,
  teams,
  players,
  ranks,
  valueOf,
  onOpen,
}: {
  trades: PastTrade[];
  teams: Props["teams"];
  players: Props["tradePlayers"];
  ranks: Map<string, RankedEntry> | null;
  valueOf: (id: string) => number;
  onOpen: (t: PastTrade) => void;
}) {
  const teamName = (rid: number) => teams.find((t) => t.rosterId === rid)?.name ?? `Team ${rid}`;
  return (
    <section className="mt-4">
      <h2 className="mb-1 text-xl font-bold tracking-tight">Past trades</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Every completed trade this season, scored with the rankings list selected above (today&apos;s values). FAAB and
        draft picks are shown but not valued.
      </p>
      {trades.length === 0 ? (
        <div className="card p-6 text-center text-sm text-zinc-500">No trades yet this season.</div>
      ) : (
        <div className="grid gap-3">
          {trades.map((t) => {
            const scored = t.sides.map((s) => ({ ...s, score: scoreSide(s.receives.map(valueOf)) }));
            // A side that got no players (only FAAB/picks) can't be scored, since those aren't valued.
            const unscorable = scored.some((s) => s.receives.length === 0);
            const two = scored.length === 2 && !unscorable;
            // Who came out ahead: whoever received more (adjusted) value.
            const v = two ? verdict(scored[0].score.adjusted, scored[1].score.adjusted) : null;
            const best = unscorable ? Infinity : Math.max(...scored.map((s) => s.score.adjusted));
            const buyer = scored.find((s) => s.receives.length > 0);
            const seller = scored.find((s) => s.receives.length === 0);
            const bought = buyer && buyer.receives.length === 1 ? "a player" : `${buyer?.receives.length ?? 0} players`;
            const faab = seller?.faabIn ? ` for $${seller.faabIn} FAAB` : "";
            const result = !ranks
              ? "Scoring…"
              : unscorable && buyer && seller
                ? `${teamName(buyer.rosterId)} bought ${bought} from ${teamName(seller.rosterId)}${faab} (not scored)`
                : two
                ? v!.winner === null
                  ? `${v!.label}`
                  : `${v!.label}: ${teamName(scored[v!.winner === "A" ? 0 : 1].rosterId)} won`
                : `${teamName(scored.find((s) => s.score.adjusted === best)!.rosterId)} got the most value`;
            return (
              <div key={t.id} className="card p-4">
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-zinc-500">
                    GW{t.week} · {new Date(t.created).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="font-semibold">{result}</span>
                  {t.sides.length === 2 && (
                    <button className="btn-ghost ml-auto py-1 text-xs" onClick={() => onOpen(t)}>
                      Open in calculator ↑
                    </button>
                  )}
                </div>
                <div className={`grid gap-3 ${scored.length > 1 ? "sm:grid-cols-2" : ""}`}>
                  {scored.map((s) => {
                    const won = ranks && s.score.adjusted === best && best > 0 && !(two && v!.winner === null);
                    return (
                      <div
                        key={s.rosterId}
                        className={`rounded-lg border p-3 ${won ? "border-emerald-500/70 bg-emerald-50/50 dark:bg-emerald-500/10" : "border-zinc-200 dark:border-zinc-800"}`}
                      >
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                          <span className="font-medium">{teamName(s.rosterId)} received</span>
                          <span className="text-sm font-semibold tabular-nums">{ranks ? s.score.adjusted.toLocaleString() : "…"}</span>
                        </div>
                        <ul className="space-y-1 text-sm">
                          {s.receives.map((id) => {
                            const p = players[id];
                            const r = ranks?.get(id);
                            return (
                              <li key={id} className="flex items-center gap-2">
                                <Pos pos={r?.pos ?? p?.pos ?? "?"} />
                                <span>{p?.name ?? id}</span>
                                <span className="text-xs text-zinc-500">{p?.team ?? ""}</span>
                                <span className="ml-auto text-xs tabular-nums text-zinc-500">
                                  {r ? `${r.tier} · ${valueOf(id).toLocaleString()}` : ranks ? "unranked" : ""}
                                </span>
                              </li>
                            );
                          })}
                          {s.faabIn > 0 && <li className="text-xs text-zinc-500">+ ${s.faabIn} FAAB</li>}
                          {s.receives.length === 0 && s.faabIn === 0 && <li className="text-xs text-zinc-500">Nothing</li>}
                        </ul>
                        {ranks && s.receives.length > 1 && (
                          <div className="mt-2 text-xs text-zinc-500">Raw total {s.score.raw.toLocaleString()}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {t.picks > 0 && <p className="mt-2 text-xs text-zinc-500">Also included {t.picks} draft pick(s).</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SidePanel(props: {
  label: string;
  side: SideState;
  teams: Props["teams"];
  pool: SlimPlayer[];
  byId: Map<string, SlimPlayer>;
  valueOf: (id: string) => number;
  ranks: Map<string, RankedEntry> | null;
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
              <Pos pos={ranks?.get(id)?.pos ?? p?.pos ?? "?"} />
              <span className="font-medium">{p?.name ?? id}</span>
              <span className="text-xs text-zinc-500">{p?.team}</span>
              <span className="ml-auto text-xs text-zinc-500">{ranks?.get(id) ? `${POSITION_LABEL[ranks.get(id)!.pos]} #${ranks.get(id)!.rank} · ${ranks.get(id)!.tier}` : "unranked"}</span>
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
            <Pos pos={ranks?.get(p.id)?.pos ?? p.pos} />
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
