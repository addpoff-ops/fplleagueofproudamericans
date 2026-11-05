# Proud Americans FPL

A league hub for the **FPL League of Proud Americans**
(Sleeper league `1388351489117810688`, `clubsoccer:epl`).

## Features

| Page | What it does |
| --- | --- |
| `/` | Opens Power Rankings |
| `/power-rankings` | All 12 teams ranked by total roster value using the original spreadsheet values (no trade-calculator scaling), with a FWD/MID/DEF/GK breakdown |
| `/teams/[id]` | Each roster (starters, bench, IR), with ranks and values from the official rankings |
| `/lineup-setter` | Connect a Sleeper account and switch on automatic lineup changes when team sheets drop |
| `/draft` | The full draft board |
| `/rankings` | The official rankings plus anyone else's lists |
| `/rankings/new` | Create a list, starting from a copy of an existing list, Sleeper's pre-season ADP, this season's total points (league scoring), or blank |
| `/rankings/[slug]` | A list split into FWD / MID / DEF / GK sections with tiers. Edit with drag-and-drop, rank numbers, tier pickers, and adding players |
| `/trade` | Trade calculator driven by any rankings list, with "to even it up" suggestions |

## Deploying to Vercel (no terminal needed)

1. Sign in at [vercel.com](https://vercel.com) with GitHub, click **Add New → Project**,
   and import this repository. Don't deploy yet.
2. In the project, open **Storage → Create Database → Neon (Postgres)** and connect
   it to the project. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.
3. Under **Settings → Environment Variables**, add `ADMIN_KEY` with a long random
   value. Keep it private; it's your master edit key.
4. Deploy (or redeploy). The build creates the database tables, and on the first
   deploy it also loads the official rankings from
   `data/official-rankings-2026-27.json`. Every deploy then appends any player at
   a current Premier League club who isn't in the official rankings yet to the
   end of their position, as tier Z (`scripts/complete-official.ts`). Players
   already ranked are never moved.

To edit the official rankings, open them on the site, click **Edit**, and enter
your `ADMIN_KEY`. Every push to GitHub redeploys automatically, and your
rankings in the database are left alone.

## Lineup Setter

Members connect their Sleeper account on `/lineup-setter` and switch it **On**.
About an hour before each kickoff window, when Premier League team sheets are
published, the site benches any of their starters who aren't in their club's
starting XI. Each is replaced by the best eligible bench player, in this order:
A) starting in the same kickoff window, B) projected above 0 in a later game,
C) any other available player (ties go to the higher projection). Players whose
games have kicked off are never moved. Each change appears as a notification
on the page.

**How it works:** team sheets and kickoff times come from Sleeper's public
`/scores` feed. Lineups are read and saved through Sleeper's *private* GraphQL
API (`matchup_legs` / `update_matchup_leg`), the same one Sleeper's app uses.
It's unofficial and could break if Sleeper changes it. Passwords are passed to
Sleeper once and never stored; only the session token is kept, encrypted with
`LINEUP_SECRET`.

**Setup (once):**

1. In Vercel, under **Settings → Environment Variables**, add `LINEUP_SECRET` (a
   long random string, at least 16 characters) and `CRON_SECRET` (another long
   random string). Then redeploy.
2. In GitHub, under **Settings → Secrets and variables → Actions**, add a
   repository secret `CRON_SECRET` with the same value as in Vercel. The
   workflow in `.github/workflows/lineup-setter.yml` then calls
   `/api/cron/lineup-setter` every 5 minutes.

Changing `LINEUP_SECRET` later makes saved sign-ins unreadable, so members
would need to reconnect.

## Running locally

Requires Node.js 20+ and a Postgres database (a second free Neon database
works well, or reuse the Vercel one).

```bash
npm install
cp .env.example .env      # fill in the database URLs and ADMIN_KEY
npm run db:push           # creates the tables
npm run import:official   # loads the official rankings
npm run dev               # http://localhost:3000
```

## How editing works (no accounts)

Creating a list returns a secret **edit link**. The browser that created it
remembers the key. Anyone else needs the link, or the site `ADMIN_KEY` (which can
edit or delete any list). Keys are stored bcrypt-hashed.

## Rankings & trade values (`src/lib/value.ts`)

Each list has four sections (**FWD, MID, DEF, GK**). Players are ranked
within their position and given a tier (S, A–F, Z). Every page (trade
calculator, rankings, team pages, Power Rankings) values a player by position
and tier using the original values from the FWD/MID/DEF/GK (A) sheets:

| | Z | F | E | D | C | B | A | S |
|---|---|---|---|---|---|---|---|---|
| FWD | 180 | 208 | 242 | 280 | 355 | 435 | 515 | 580 |
| MID | 200 | 250 | 320 | 345 | 390 | 450 | 512 | 600 |
| DEF | 195 | 220 | 248 | 278 | 320 | 365 | 420 | 450 |
| GK  | 200 | 200 | 200 | 215 | 242 | 265 | 300 | 325 |

(The sheet has no GK F tier, so GK F uses 200.)

In the trade calculator, **Raw** is the plain sum. **Adjusted** sorts each side
best-first and weights the i-th player by `0.5^i` (each extra player counts
for half of the one before it), so a pile of depth pieces
doesn't automatically beat one star. Within 5% counts as fair.

The official list comes from `data/official-rankings-2026-27.json` (built from
the (A) sheets, with names matched to Sleeper IDs). Sleeper's record for James
Trafford is corrupted, so `PLAYER_OVERRIDES` in `src/lib/config.ts` patches it.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | none | Postgres connection strings (set automatically by Vercel's Neon integration) |
| `ADMIN_KEY` | none | Admin features are off while this is `change-me` |
| `LINEUP_SECRET` | none | Encrypts stored Sleeper sign-ins and signs Lineup Setter sessions. Required for Lineup Setter |
| `CRON_SECRET` | none | Shared secret the scheduler sends to `/api/cron/lineup-setter` |
| `SLEEPER_LEAGUE_ID` | `1388351489117810688` | Change it when the league rolls over to a new season |
| `EPL_CLUBS` | 2026-27 clubs | Comma-separated club codes. Sleeper's player pool includes players who left the PL, so the rankings pool is filtered to these clubs. Update each summer (`src/lib/config.ts`). |

## Data & caching

All league data comes from the public [Sleeper API](https://docs.sleeper.com)
and is cached for 5 minutes (the draft for 1 hour). The ~2.3 MB player dump is
slimmed and cached in memory for 12 hours, because Sleeper asks that it be
fetched at most once a day.

Sleeper doesn't expose head-to-head matchups for soccer leagues (the endpoint
returns `null`), so standings are built from each roster's record.
