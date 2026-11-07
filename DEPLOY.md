# Deploying CourtIQ

Two accounts, both free: **Neon** for the database and **Vercel** for hosting.
Nothing here sleeps, and nothing gets deactivated for going quiet.

---

## 1. Database (Neon)

1. Sign up at [neon.tech](https://neon.tech) and create a project called `courtiq`.
2. On the dashboard, copy the **pooled** connection string. The host contains
   `-pooler`. This matters: serverless functions open many short-lived
   connections and the pooled endpoint is what absorbs them.
3. Keep that string somewhere safe for the next two steps.

## 2. The tables and the import happen automatically

There is nothing to run by hand. The Vercel build applies the schema and imports
`stats.json` on every deploy, using `DATABASE_URL` and `COURTIQ_PASSCODE` from
the environment variables you set in the next step.

Both steps are safe to repeat. `drizzle-kit push` does nothing once the tables
match, and the seed matches players by name, imports the historical stat line
only once, and never deletes. Redeploying does not duplicate or reset anything.

Everything that was in `stats.json` lands in one session labelled
*"Imported from stats.json"*. New practices and games are recorded separately
from there on.

If you ever want to run it yourself instead:

```bash
export DATABASE_URL="<your pooled Neon string>"
export COURTIQ_PASSCODE="<the passcode>"
pnpm install && pnpm run db:setup
```

## 3. Hosting (Vercel)

1. Sign up at [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New > Project**, import `Ray786YT/courtiq`.
3. Vercel reads `vercel.json`, so leave the build settings alone.
4. Add these environment variables before the first deploy:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | your pooled Neon string |
   | `COURTIQ_PASSCODE` | the passcode you and the coach will type |
   | `SESSION_SECRET` | 32+ random characters (see below) |
   | `ANTHROPIC_API_KEY` | your Anthropic key, for voice notes |

   Generate a session secret with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. Deploy. Every push to `master` redeploys automatically from then on.

## 4. Custom domain

1. Buy the domain. `courtiq.app` or `courtiq.com` runs about $12 a year.
2. In Vercel: **Project > Settings > Domains > Add**, enter the domain.
3. Vercel shows the DNS records to create. Add them at your registrar.
4. HTTPS is issued automatically once DNS resolves, usually within an hour.

---

## What changed from the Replit version

**Stats live in Postgres, not a file.** The old build wrote to `stats.json` on
an Autoscale container. Those containers reset their filesystem when they scale
back up, so stats could silently roll back to whatever was in the file at deploy
time. Two copies of `stats.json` had already drifted apart in the repo.

**The API requires a passcode.** Previously `GET /api/stats` returned every
player's name and real student ID to anyone with the URL, and
`POST /api/stats/reset` would wipe the season with no check at all. Now every
route except the health check needs a valid session cookie, and student IDs are
stored but never returned by the API.

**Reset is scoped to one session.** There is no route that clears a whole
season. A misfire costs one practice.

**Stats belong to a practice or a game.** Season figures are a sum across
sessions, so you can see change over time instead of one number that only grows.

---

## Environment variables

| Name | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled connection string |
| `COURTIQ_PASSCODE` | yes | Senior boys passcode. Each other team in `teams.json` names its own variable (e.g. `COURTIQ_PASSCODE_SLSS_SENIOR_GIRLS`). A team whose variable is unset cannot be signed into. |
| `SESSION_SECRET` | yes | Signs the login cookie. Changing it signs everyone out. Not the passcode. |
| `ANTHROPIC_API_KEY` | for voice | Without it, `/api/voice` returns 503 and the rest still works |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5` |

## Changing the passcode

Change `COURTIQ_PASSCODE` in the Vercel environment variables and redeploy. The
next build updates the stored hash and leaves every stat alone. The raw passcode
is never stored, only an scrypt hash of it.

## Adding a team or a school

CourtIQ is one website with one login screen. Each passcode unlocks one team,
so senior boys, senior girls, and a team at another school all live on the same
URL and never see each other's data. The API refuses to read or write across
teams.

To add a team:

1. Add an entry to `teams.json` at the repo root:

   ```json
   {
     "slug": "slss-junior-girls",
     "name": "Junior Girls Volleyball",
     "school": "Stephen Lewis Secondary School",
     "passcodeEnv": "COURTIQ_PASSCODE_SLSS_JUNIOR_GIRLS",
     "starterRoster": ["Jake", "Jack", "John"]
   }
   ```

   `slug` is permanent and lowercase-with-dashes. `starterRoster` is optional:
   placeholder names so the coach sees how the app works before the real roster
   is in. They are only inserted the first time the team is created, so renaming
   or removing them in the Roster tab sticks.

2. In Vercel, add the environment variable named in `passcodeEnv` with that
   team's passcode (6+ characters, and different from every other team's).

3. Push to `master`. The build creates the team on the next deploy.

The seed refuses to run if two teams share a passcode, since the passcode is
the only thing a user types and it has to pick exactly one team.
