/**
 * Seeds every team listed in `teams.json` at the repo root.
 *
 * For each team: create the row if it is missing, set its name and school from
 * the file, and store the scrypt hash of the passcode found in that team's
 * `passcodeEnv` variable. A team whose passcode variable is not set is skipped
 * (its row and stats are left alone) and nobody can sign into it.
 *
 * Safe to re-run on every deploy:
 *   - Players are never deleted.
 *   - The senior boys' historical stat line (stats.json) is imported only once.
 *   - A starter roster (placeholder names) is inserted only when the team row is
 *     created for the first time, so renaming or removing the placeholders in
 *     the app sticks across redeploys.
 *
 *   DATABASE_URL=... COURTIQ_PASSCODE=... pnpm --filter @workspace/scripts run seed
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import {
  db,
  hashPasscode,
  playersTable,
  playerSessionStatsTable,
  pool,
  sessionsTable,
  STAT_FIELDS,
  teamsTable,
  type StatField,
} from "@workspace/db";

const IMPORT_LABEL = "Season to date";
const MIN_PASSCODE_LENGTH = 6;

type TeamConfig = {
  slug: string;
  name: string;
  school?: string;
  passcodeEnv: string;
  importLegacyStats?: boolean;
  starterRoster?: string[];
};

type LegacyPlayer = { name: string; studentId?: string } & Partial<
  Record<StatField, number>
>;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

async function readTeams(): Promise<TeamConfig[]> {
  const raw = await readFile(path.join(repoRoot, "teams.json"), "utf-8");
  const parsed = JSON.parse(raw) as { teams?: TeamConfig[] };
  const teams = parsed.teams ?? [];
  if (teams.length === 0) {
    throw new Error("teams.json lists no teams.");
  }

  const slugs = new Set<string>();
  for (const team of teams) {
    if (!/^[a-z0-9-]+$/.test(team.slug)) {
      throw new Error(`Team slug "${team.slug}" must be lowercase letters, digits, and dashes.`);
    }
    if (slugs.has(team.slug)) {
      throw new Error(`Team slug "${team.slug}" appears twice in teams.json.`);
    }
    slugs.add(team.slug);
    if (!team.passcodeEnv) {
      throw new Error(`Team "${team.slug}" has no passcodeEnv in teams.json.`);
    }
  }
  return teams;
}

async function readLegacyStats(): Promise<LegacyPlayer[]> {
  try {
    const raw = await readFile(path.join(repoRoot, "stats.json"), "utf-8");
    const parsed = JSON.parse(raw) as { players?: LegacyPlayer[] };
    return parsed.players ?? [];
  } catch {
    console.log("No stats.json found at the repo root; skipping the legacy import.");
    return [];
  }
}

async function upsertPlayers(
  teamId: number,
  entries: { name: string; studentId?: string }[],
): Promise<Map<string, number>> {
  const playerIdByName = new Map<string, number>();
  for (const entry of entries) {
    const [row] = await db
      .insert(playersTable)
      .values({
        teamId,
        name: entry.name,
        studentId: entry.studentId ?? null,
      })
      .onConflictDoUpdate({
        target: [playersTable.teamId, playersTable.name],
        set: { studentId: entry.studentId ?? null },
      })
      .returning();
    playerIdByName.set(entry.name, row!.id);
  }
  return playerIdByName;
}

async function importLegacyStats(teamId: number): Promise<void> {
  const legacy = await readLegacyStats();
  const playerIdByName = await upsertPlayers(teamId, legacy);
  console.log(`  Roster: ${playerIdByName.size} players.`);

  // The guard is "does this team have ANY session yet", not "is there a session
  // with the import label". Keying off the label meant that renaming a session
  // made the next deploy silently double every stat in the season.
  const [anySession] = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(eq(sessionsTable.teamId, teamId))
    .limit(1);

  if (anySession) {
    console.log("  Already has sessions; skipping the historical import.");
    return;
  }

  const [session] = await db
    .insert(sessionsTable)
    .values({
      teamId,
      kind: "practice",
      label: IMPORT_LABEL,
      occurredOn: new Date().toISOString().slice(0, 10),
      notes:
        "Season-to-date totals carried over from the original file-based tracker. " +
        "Everything recorded before CourtIQ moved to a database is collapsed into this one entry.",
    })
    .returning();

  let imported = 0;
  for (const entry of legacy) {
    const playerId = playerIdByName.get(entry.name);
    if (playerId === undefined) continue;

    const values: Record<string, number> = {};
    let hasAny = false;
    for (const field of STAT_FIELDS) {
      const value = Number(entry[field] ?? 0);
      values[field] = Number.isFinite(value) ? Math.max(0, value) : 0;
      if (values[field]! > 0) hasAny = true;
    }
    if (!hasAny) continue;

    await db.insert(playerSessionStatsTable).values({
      sessionId: session!.id,
      playerId,
      ...values,
    });
    imported += 1;
  }
  console.log(`  Imported stat lines for ${imported} players.`);
}

async function seedTeam(config: TeamConfig, seenPasscodes: Map<string, string>): Promise<void> {
  console.log(`\n[${config.slug}] ${config.name}`);

  const passcode = process.env[config.passcodeEnv];
  if (!passcode) {
    console.log(`  ${config.passcodeEnv} is not set; skipping. Nobody can sign into this team until it is.`);
    return;
  }
  if (passcode.length < MIN_PASSCODE_LENGTH) {
    throw new Error(`${config.passcodeEnv} must be at least ${MIN_PASSCODE_LENGTH} characters.`);
  }

  // Login tries the passcode against every team, so two teams sharing one
  // passcode would make the first one in the table win silently.
  const normalized = passcode.normalize("NFKC");
  const clash = seenPasscodes.get(normalized);
  if (clash) {
    throw new Error(`Teams "${clash}" and "${config.slug}" have the same passcode. Each team needs its own.`);
  }
  seenPasscodes.set(normalized, config.slug);

  let [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.slug, config.slug))
    .limit(1);

  let created = false;
  if (team) {
    await db
      .update(teamsTable)
      .set({
        name: config.name,
        school: config.school ?? null,
        passcodeHash: hashPasscode(passcode),
      })
      .where(eq(teamsTable.id, team.id));
    console.log("  Team already existed; name, school, and passcode updated.");
  } else {
    [team] = await db
      .insert(teamsTable)
      .values({
        slug: config.slug,
        name: config.name,
        school: config.school ?? null,
        passcodeHash: hashPasscode(passcode),
      })
      .returning();
    created = true;
    console.log("  Created team.");
  }

  const teamId = team!.id;

  if (config.importLegacyStats) {
    await importLegacyStats(teamId);
  }

  if (config.starterRoster && config.starterRoster.length > 0) {
    if (created) {
      const roster = await upsertPlayers(
        teamId,
        config.starterRoster.map((name) => ({ name })),
      );
      console.log(`  Starter roster: ${roster.size} placeholder players. Rename them in the Roster tab.`);
    } else {
      console.log("  Starter roster skipped (only added when the team is first created).");
    }
  }
}

async function main() {
  const teams = await readTeams();
  const seenPasscodes = new Map<string, string>();
  for (const team of teams) {
    await seedTeam(team, seenPasscodes);
  }
  console.log("\nSeed complete.");
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("\nSeed failed:", error);
    await pool.end();
    process.exit(1);
  });
