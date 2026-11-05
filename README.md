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
| `/rankings/[slug]` | A list split into FWD / MID / DEF / GK sections with tiers. Edit with drag-and-drop, rank numbers, tier pickers, and add/remove |
| `/trade` | Trade calculator driven by any rankings list, with "to even it up" suggestions |

## Getting started

```bash
npm install
cp .env.example .env      # then set ADMIN_KEY to a long random string
npm run db:push           # creates the SQLite database
npm run dev               # http://localhost:3000
```

Then load the official rankings with `npm run import:official`, which prints a
private edit link. You can also open `/rankings/new`, click "Site admin?", and
enter your `ADMIN_KEY`. Only one list is official at a time. It's the default in
the trade calculator and powers the roster values on team pages.

## How editing works (no accounts)

Creating a list returns a secret **edit link**. The browser that created it
remembers the key. Anyone else needs the link, or the site `ADMIN_KEY` (which can
edit or delete any list). Keys are stored bcrypt-hashed.

## Rankings & trade values (`src/lib/value.ts`)

Each list has four sections (**FWD, MID, DEF, GK**). Players are ranked
within their position and given a tier (S, A–F, Z). Value depends on position
and tier, based on the original values in the FWD/MID/DEF/GK (A) sheets:

- **Z** keeps the sheet's original value. **F** is the sheet's original F value.
- Each tier above F is worth more than the one below it (`TIER_GROWTH`): **1.78×** for FWD, **1.7×** for MID and DEF, **1.5×** for GK.

| | Z | F | E | D | C | B | A | S |
|---|---|---|---|---|---|---|---|---|
| FWD | 180 | 208 | 370 | 659 | 1,173 | 2,088 | 3,717 | 6,616 |
| MID | 200 | 250 | 425 | 722 | 1,228 | 2,088 | 3,550 | 6,034 |
| DEF | 195 | 220 | 374 | 636 | 1,081 | 1,837 | 3,124 | 5,310 |
| GK  | 200 | 200 | 300 | 450 | 675 | 1,013 | 1,519 | 2,278 |

(The sheet has no GK F tier, so GK F uses 200.)

In the trade calculator, **Raw** is the plain sum. **Adjusted** sorts each side
best-first and weights the i-th player by `0.85^i`, so a pile of depth pieces
doesn't automatically beat one star. Within 5% counts as fair.

The official list was imported from `data/official-rankings-2026-27.json`
(built from the (A) sheets, with names matched to Sleeper IDs) using
`npm run import:official`. James Trafford (GK, Leeds) isn't in Sleeper's player
database, so he was skipped.

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
