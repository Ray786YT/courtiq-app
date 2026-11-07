# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains the SLSS Senior Boys Volleyball Stats Tracker — a full-stack web app for tracking high school volleyball player statistics.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Frontend**: React + Vite (Tailwind CSS v4, shadcn/ui, framer-motion)
- **Validation**: Zod (`zod/v4`)
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **AI**: Anthropic Claude (`claude-sonnet-5`, override with `ANTHROPIC_MODEL`) for voice note parsing
- **Data storage**: PostgreSQL via Drizzle (`lib/db`). Hosted on Neon in production
- **Auth**: team passcode (scrypt hash) exchanged for an HMAC-signed httpOnly cookie
- **Hosting**: Vercel. Static frontend plus one serverless function at `api/[...slug].js`

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (backend)
│   │   └── src/routes/     # stats.ts, voice.ts, health.ts
│   ├── volleyball-app/     # React + Vite frontend (served at /)
│   │   └── src/
│   │       ├── pages/tracker/     # Manual entry + voice note
│   │       ├── pages/stats/       # Team stats table
│   │       ├── components/        # StatRow, AppLayout
│   │       └── hooks/             # use-stats-mutations.ts
│   └── mockup-sandbox/     # Mockup prototyping (design tool)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   └── api-zod/            # Generated Zod schemas
├── stats.json              # Historical archive only. Read once by the seed script,
│                           # never written to. Live data lives in Postgres.
├── build-vercel.mjs        # Bundles the Express app into a Vercel function
├── vercel.json             # Build, routing, and header config for Vercel
├── DEPLOY.md               # Deployment and environment setup
├── pnpm-workspace.yaml
└── package.json
```

## App Features

### Page 1 — Stat Editor (`/`)
- **Manual Entry tab**: Player dropdown → Stat category tabs (Hitting/Blocking/Passing/Serving/Digs) → Large +/- buttons → Live mini stat card
- **Voice Note tab**: Record speech → AI parses transcript via Claude → Shows changes applied

### Page 2 — Team Stats Table (`/stats`)
- Inline-editable cells for all players and stats
- CSV export button
- Reset All Stats with confirmation dialog
- Top Hitters leaderboard

### API Routes

Every route except `/healthz` and `/auth/login` requires a valid session cookie.

- `GET  /api/healthz` — health check, unauthenticated
- `GET  /api/auth/me` — current auth state
- `POST /api/auth/login` — `{ passcode }` to a session cookie
- `POST /api/auth/logout` — clear the cookie
- `GET  /api/players` — roster, without student IDs
- `GET  /api/players/:id/history` — one player, session by session, plus season total
- `GET  /api/sessions` — practices and games, newest first
- `POST /api/sessions` — start a practice or game
- `GET  /api/stats` — season totals; add `?sessionId=` for one session
- `POST /api/stats/update` — `{ sessionId, playerId, stat, delta }`
- `POST /api/stats/set` — `{ sessionId, playerId, stat, value }`
- `POST /api/stats/reset` — `{ sessionId }`, zeroes one session only
- `POST /api/voice` — `{ sessionId, transcript }` to parsed and applied changes

## Data Model

Postgres, defined in `lib/db/src/schema`:

- `teams` — one row per team. Holds the scrypt passcode hash.
- `players` — roster, scoped to a team. `student_id` is stored but never returned by the API.
- `sessions` — one practice or game.
- `player_session_stats` — one row per (session, player), sixteen non-negative counters.
  Unique on (session, player), so an increment is a single upsert and two phones
  cannot create duplicate rows.

Season figures are a `SUM` across sessions, computed on read. `STAT_FIELDS` in
`lib/db/src/schema/stat-fields.ts` is the single source of truth for the stat
list: the columns, the API contract, the voice parser allow-list, and the UI
columns all derive from it.

## Environment Secrets

- `DATABASE_URL` — Postgres connection string. Use Neon's pooled endpoint in production.
- `SESSION_SECRET` — 32+ random characters, signs the login cookie.
- `ANTHROPIC_API_KEY` — voice note parsing. Without it `/api/voice` returns 503.

See `DEPLOY.md` and `.env.example`.

## Running

- Frontend (Vite): `pnpm --filter @workspace/volleyball-app run dev`
- Backend (Express): `pnpm --filter @workspace/api-server run dev`

## Codegen

Run after changing `lib/api-spec/openapi.yaml`:
```bash
pnpm --filter @workspace/api-spec run codegen
```

## Database

```bash
pnpm --filter @workspace/db run push        # apply the schema
pnpm --filter @workspace/scripts run seed   # import stats.json, set the passcode
```

The seed is idempotent. Re-running it updates the team passcode and leaves stats
untouched, which is how you rotate the passcode.

## Deploying

```bash
pnpm run build:vercel   # builds the frontend and the serverless function
```

`DEPLOY.md` has the full walkthrough.
