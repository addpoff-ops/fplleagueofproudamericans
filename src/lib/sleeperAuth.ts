// Sleeper's private GraphQL API (the one Sleeper's own app uses). Unofficial
// and undocumented: it can change without notice. Every call here acts as the
// signed-in member whose token is passed in.

const GQL = "https://api.sleeper.app/graphql";

export class SleeperAuthError extends Error {}

interface GqlError {
  code?: string;
  message?: string;
}

async function gql<T>(token: string | null, operationName: string, query: string, variables: object = {}): Promise<T> {
  const res = await fetch(GQL, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) },
    body: JSON.stringify({ operationName, query, variables }),
  });
  const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown>; errors?: GqlError[] } | null;
  const errors = body?.errors ?? [];
  if (errors.some((e) => e.code === "unauthorized") || res.status === 401)
    throw new SleeperAuthError("Sleeper rejected the saved sign-in (it may have expired).");
  if (errors.length) {
    const err = new Error(errors.map((e) => e.message ?? e.code).join("; "));
    (err as Error & { codes?: string[] }).codes = errors.map((e) => e.code ?? "");
    throw err;
  }
  if (!res.ok || !body?.data) throw new Error(`Sleeper request failed (${res.status})`);
  return body.data as T;
}

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "needs_code" | "captcha" | "bad_credentials" | "other"; message: string };

/** Username/email/phone + password → session token. The password is not kept. */
export async function login(identifier: string, password: string): Promise<LoginResult> {
  try {
    const d = await gql<{ login: { token: string } | null }>(
      null,
      "login",
      `query login($email_or_phone_or_username: String!, $password: String!) {
        login(email_or_phone_or_username: $email_or_phone_or_username, password: $password) { token }
      }`,
      { email_or_phone_or_username: identifier, password },
    );
    if (d.login?.token) return { ok: true, token: d.login.token };
    return { ok: false, reason: "bad_credentials", message: "Sleeper didn't accept that username and password." };
  } catch (e) {
    const codes = (e as { codes?: string[] }).codes ?? [];
    const msg = e instanceof Error ? e.message : String(e);
    if (codes.includes("code_verification_required"))
      return { ok: false, reason: "needs_code", message: "Sleeper wants a one-time code for this sign-in." };
    if (/captcha/i.test(msg) || codes.some((c) => /captcha/i.test(c)))
      return { ok: false, reason: "captcha", message: "Sleeper asked for a captcha." };
    if (/password|credential|not found|invalid/i.test(msg))
      return { ok: false, reason: "bad_credentials", message: "Sleeper didn't accept that username and password." };
    return { ok: false, reason: "other", message: msg };
  }
}

export async function me(token: string) {
  const d = await gql<{ me: { user_id: string; display_name: string } | null }>(
    token,
    "me",
    `query me { me { user_id display_name } }`,
  );
  if (!d.me?.user_id) throw new SleeperAuthError("Couldn't confirm the Sleeper account.");
  return d.me;
}

export interface MatchupLeg {
  roster_id: number;
  leg: number;
  round: number;
  starters: string[] | null;
  players: string[] | null;
}

export async function getMatchupLegs(token: string, leagueId: string, round: number) {
  const d = await gql<{ matchup_legs: MatchupLeg[] | null }>(
    token,
    "matchup_legs",
    `query matchup_legs($leagueId: String!, $round: Int!) {
      matchup_legs(league_id: $leagueId, round: $round) { roster_id leg round starters players }
    }`,
    { leagueId, round },
  );
  return d.matchup_legs ?? [];
}

/** Save a new lineup: the full, slot-ordered starters list ("0" = empty slot). */
export async function updateMatchupLeg(token: string, leagueId: string, rosterId: number, week: number, starters: string[]) {
  // Same call shape as Sleeper's web app (leg and round are both the week).
  const list = `[${starters.map((s) => JSON.stringify(s)).join(",")}]`;
  const d = await gql<{ update_matchup_leg: MatchupLeg | null }>(
    token,
    "update_matchup_leg",
    `mutation update_matchup_leg {
      update_matchup_leg(league_id: ${JSON.stringify(leagueId)}, roster_id: ${rosterId}, leg: ${week}, round: ${week}, starters: ${list}) {
        roster_id leg round starters players
      }
    }`,
  );
  return d.update_matchup_leg;
}
