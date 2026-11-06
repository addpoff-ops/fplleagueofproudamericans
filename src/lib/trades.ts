import { getLeague, getPlayers, getTransactions } from "./sleeper";

export interface PastTrade {
  id: string;
  created: number; // ms since epoch
  week: number;
  sides: {
    rosterId: number;
    receives: string[]; // player IDs this team got
    faabIn: number; // FAAB budget received (not valued)
  }[];
  picks: number; // draft picks involved (not valued)
}

/** Every completed trade this season, newest first, from Sleeper's transactions. */
export async function getPastTrades() {
  const league = await getLeague();
  const weeks = Array.from({ length: Math.max(1, league.settings.leg) }, (_, i) => i + 1);
  const all = (await Promise.all(weeks.map((w) => getTransactions(w)))).flat();
  const trades: PastTrade[] = all
    .filter((t) => t.type === "trade" && t.status === "complete")
    .sort((a, b) => b.created - a.created)
    .map((t) => ({
      id: t.transaction_id,
      created: t.created,
      week: t.leg,
      sides: t.roster_ids.map((rid) => ({
        rosterId: rid,
        receives: Object.entries(t.adds ?? {})
          .filter(([, r]) => r === rid)
          .map(([p]) => p),
        faabIn: (t.waiver_budget ?? []).filter((w) => w.receiver === rid).reduce((s, w) => s + w.amount, 0),
      })),
      picks: t.draft_picks?.length ?? 0,
    }));

  // Names for traded players, including any who have since left the Premier League.
  const players = await getPlayers();
  const info: Record<string, { name: string; pos: string; team: string | null }> = {};
  for (const t of trades)
    for (const s of t.sides)
      for (const id of s.receives) {
        const p = players[id];
        info[id] = { name: p?.name ?? `Player ${id}`, pos: p?.pos ?? "?", team: p?.team ?? null };
      }
  return { trades, info };
}
