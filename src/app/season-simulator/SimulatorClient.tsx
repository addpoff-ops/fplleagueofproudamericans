"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { ScheduledGame } from "@/lib/schedule";

interface Team {
  rosterId: number;
  name: string;
  owner: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  power: number;
}

interface Props {
  firstWeek: number;
  lastWeek: number;
  playoffTeams: number;
  games: ScheduledGame[];
  teams: Team[];
}

/** Chance (0-1) that `a` beats `b`: its power total over the sum of both. */
const winChance = (a: number, b: number) => (a + b > 0 ? a / (a + b) : 0.5);

/** One simulated season: a weighted coin flip for every remaining game. */
function simulate(games: ScheduledGame[], power: Map<number, number>) {
  return games.map((g) => {
    const p = winChance(power.get(g.home) ?? 0, power.get(g.away) ?? 0);
    return { ...g, p, winner: Math.random() < p ? g.home : g.away };
  });
}

export default function SimulatorClient({ firstWeek, lastWeek, playoffTeams, games, teams }: Props) {
  const power = useMemo(() => new Map(teams.map((t) => [t.rosterId, t.power])), [teams]);
  const byId = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams]);
  // Simulate in the browser only (random draws on the server wouldn't match the page's).
  const [results, setResults] = useState<ReturnType<typeof simulate>>([]);
  const [run, setRun] = useState(1);
  useEffect(() => setResults(simulate(games, power)), [games, power]);
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  const table = useMemo(() => {
    return teams
      .map((t) => {
        const mine = results.filter((g) => g.home === t.rosterId || g.away === t.rosterId);
        const simW = mine.filter((g) => g.winner === t.rosterId).length;
        const simL = mine.length - simW;
        const expected = mine.reduce((s, g) => s + (g.home === t.rosterId ? g.p : 1 - g.p), 0);
        return { t, simW, simL, expected, w: t.wins + simW, l: t.losses + simL, d: t.ties };
      })
      .sort((a, b) => b.w - a.w || a.l - b.l || b.t.pointsFor - a.t.pointsFor);
  }, [results, teams]);

  const ready = results.length > 0;
  const weeks = useMemo(() => [...new Set(results.map((g) => g.week))].sort((a, b) => a - b), [results]);
  const name = (id: number) => byId.get(id)?.name ?? `Team ${id}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn-primary"
          onClick={() => {
            setResults(simulate(games, power));
            setRun((r) => r + 1);
          }}
        >
          Re-simulate
        </button>
        <span className="text-sm text-zinc-500">
          Simulation #{run} · weeks {firstWeek}–{lastWeek} · {games.length} games. Each team&apos;s chance to win a game is
          its Power Rankings total divided by both teams&apos; totals.
        </span>
      </div>

      {!ready && <div className="card p-6 text-sm text-zinc-500">Simulating…</div>}
      {ready && (
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="th w-10">#</th>
              <th className="th">Team</th>
              <th className="th text-right">Power</th>
              <th className="th text-center">Current</th>
              <th className="th text-center">Simulated wk {firstWeek}–{lastWeek}</th>
              <th className="th text-center">Final record</th>
              <th className="th hidden text-right sm:table-cell" title="Average wins over the remaining games, from the win chances">
                Expected wins
              </th>
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => (
              <tr
                key={r.t.rosterId}
                className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800/60 ${
                  i === playoffTeams - 1 ? "border-b-2 border-b-emerald-500/70 dark:border-b-emerald-500/70" : ""
                }`}
              >
                <td className="td font-semibold text-zinc-500">{i + 1}</td>
                <td className="td">
                  <span className="flex items-center gap-2">
                    <Avatar avatar={r.t.avatar} name={r.t.name} />
                    <span>
                      <span className="font-medium">{r.t.name}</span>
                      <span className="block text-xs text-zinc-500">@{r.t.owner}</span>
                    </span>
                  </span>
                </td>
                <td className="td text-right tabular-nums">{r.t.power.toLocaleString()}</td>
                <td className="td text-center tabular-nums text-zinc-500">
                  {r.t.wins}-{r.t.losses}-{r.t.ties}
                </td>
                <td className="td text-center tabular-nums">
                  {r.simW}-{r.simL}
                </td>
                <td className="td text-center text-base font-bold tabular-nums">
                  {r.w}-{r.l}-{r.d}
                </td>
                <td className="td hidden text-right tabular-nums text-zinc-500 sm:table-cell">{r.expected.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <p className="-mt-3 text-xs text-zinc-500">
        Green line = playoff cutoff (top {playoffTeams}). Ties in the table are broken by real points scored so far.
        &quot;Final record&quot; = current record plus this simulation&apos;s results.
      </p>

      <section>
        <h2 className="mb-2 text-lg font-bold tracking-tight">Simulated matchups</h2>
        <div className="grid gap-2">
          {weeks.map((w) => {
            const wk = results.filter((g) => g.week === w);
            const open = openWeek === w;
            return (
              <div key={w} className="card">
                <button className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold" onClick={() => setOpenWeek(open ? null : w)}>
                  <span>Week {w}</span>
                  <span className="text-xs font-normal text-zinc-500">{open ? "Hide" : `${wk.length} games`}</span>
                </button>
                {open && (
                  <ul className="border-t border-zinc-100 px-4 py-2 text-sm dark:border-zinc-800">
                    {wk.map((g) => (
                      <li key={`${g.home}-${g.away}`} className="flex flex-wrap items-center gap-x-2 py-1">
                        <span className={g.winner === g.home ? "font-semibold" : "text-zinc-500"}>{name(g.home)}</span>
                        <span className="text-xs text-zinc-500">({Math.round(g.p * 100)}%)</span>
                        <span className="text-zinc-500">vs</span>
                        <span className={g.winner === g.away ? "font-semibold" : "text-zinc-500"}>{name(g.away)}</span>
                        <span className="text-xs text-zinc-500">({Math.round((1 - g.p) * 100)}%)</span>
                        <span className="ml-auto text-xs text-emerald-600">{name(g.winner)} win</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
