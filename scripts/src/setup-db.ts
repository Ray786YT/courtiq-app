/**
 * Applies the schema and seeds the team, run automatically during the Vercel
 * build so nobody needs a local toolchain to get a database going.
 *
 * Both steps are idempotent: `drizzle-kit push` is a no-op once the tables
 * match, and the seed matches players by name, imports the historical stat line
 * only once, and never deletes anything. Re-running on every deploy is safe.
 *
 * The tradeoff is that a build now depends on the database being reachable. For
 * a one-team app that is a fair trade against asking a coach to run migrations
 * by hand. If CourtIQ ever grows past that, move this to a deliberate step.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function run(label: string, command: string, args: string[]): void {
  console.log(`\n[setup-db] ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

if (!process.env["DATABASE_URL"]) {
  console.log(
    "\n[setup-db] DATABASE_URL is not set, so the database step is being skipped.\n" +
      "           The app will build but every API call will fail until you add it.",
  );
  process.exit(0);
}

run("Applying schema", "pnpm", ["--filter", "@workspace/db", "run", "push"]);

const hasAnyPasscode = Object.keys(process.env).some((key) =>
  key.startsWith("COURTIQ_PASSCODE"),
);

if (hasAnyPasscode) {
  run("Seeding teams and rosters", "pnpm", ["--filter", "@workspace/scripts", "run", "seed"]);
} else {
  console.log(
    "\n[setup-db] No COURTIQ_PASSCODE* variable is set, so no team was created and nobody can sign in.\n" +
      "           Add the passcode variables listed in teams.json to the Vercel environment and redeploy.",
  );
}

console.log("\n[setup-db] Done.");
