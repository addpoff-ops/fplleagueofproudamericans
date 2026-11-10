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
  // Every gameweek so far plus the next one (Sleeper can file a trade under the
  // upcoming week). Recent weeks are re-checked every minute so new trades show
  // up quickly; older weeks every 5 minutes.
  const current = Math.max(1, league.settings.leg);
  const weeks = Array.from({ length: Math.min(38, current + 1) }, (_, i) => i + 1);
  const all = (
    await Promise.all(weeks.map((w) => getTransactions(w, undefined, w >= current - 1 ? 60 : 300).catch(() => [])))
  ).flat();
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
