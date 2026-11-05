# Proud Americans FPL

A league hub for the **FPL League of Proud Americans**
(Sleeper league `1388351489117810688`, `clubsoccer:epl`).

## Features

| Page | What it does |
| --- | --- |
| `/` Standings | Live table from Sleeper: record, PF/PA, max PF, last-5 form, playoff line |
| `/teams/[id]` | Each roster (starters, bench, IR), with ranks and values from the official rankings |
| `/transactions` | Every completed trade, waiver, and free-agent move this season |
| `/draft` | The full draft board |
| `/rankings` | The official rankings plus anyone else's lists |
| `/rankings/new` | Create a list, starting from Sleeper's order, a copy of another list, or blank |
| `/rankings/[slug]` | View a list, or edit it with drag-and-drop, rank numbers, add/remove, and save |
| `/trade` | Trade calculator driven by any rankings list, with "to even it up" suggestions |

## Getting started

```bash
npm install
cp .env.example .env      # then set ADMIN_KEY to a long random string
npm run db:push           # creates the SQLite database
npm run dev               # http://localhost:3000
```

Then create the **official** rankings: open `/rankings/new`, click "Site admin?",
and enter your `ADMIN_KEY`. Only one list is official at a time. It's the default
in the trade calculator and powers the roster values on team pages.

## How editing works (no accounts)

Creating a list returns a secret **edit link**. The browser that created it
remembers the key. Anyone else needs the link, or the site `ADMIN_KEY` (which can
edit or delete any list). Keys are stored bcrypt-hashed.

## How trade values work (`src/lib/value.ts`)

- `value = 10000 × e^(−0.0125 × (rank − 1))`, so #1 = 10,000, #50 ≈ 5,400,
  #100 ≈ 2,900, #200 ≈ 830. Unranked players are worth 0.
- **Adjusted** totals sort each side best-first and weight the i-th player by
  `0.85^i`. This way a pile of depth pieces doesn't automatically beat one star.
- Within 5% counts as fair. Up to 15% is a slight edge, up to 30% a clear edge, and anything more is lopsided.

Tune `DECAY` and `DEPTH_FACTOR` to taste.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | SQLite locally |
| `ADMIN_KEY` | none | Admin features are off while this is `change-me` |
| `SLEEPER_LEAGUE_ID` | `1388351489117810688` | Change it when the league rolls over to a new season |
| `EPL_CLUBS` | 2026-27 clubs | Comma-separated club codes. Sleeper's player pool includes players who left the PL, so the rankings pool is filtered to these clubs. Update each summer (`src/lib/config.ts`). |

## Data & caching

All league data comes from the public [Sleeper API](https://docs.sleeper.com)
and is cached for 5 minutes (the draft for 1 hour). The ~2.3 MB player dump is
slimmed and cached in memory for 12 hours, because Sleeper asks that it be
fetched at most once a day.

Sleeper doesn't expose head-to-head matchups for soccer leagues (the endpoint
returns `null`), so standings are built from each roster's record.

## Deploying

Vercel is the easiest option. Its filesystem is read-only, though, so switch the
database to Postgres first (Vercel Postgres, Neon, or Supabase):

1. In `prisma/schema.prisma`, set `provider = "postgresql"`.
2. Set `DATABASE_URL` and `ADMIN_KEY` in the Vercel project settings.
3. Run `npx prisma db push` against the production database once.
