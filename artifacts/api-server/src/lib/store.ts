import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  emptyStatLine,
  playersTable,
  playerSessionStatsTable,
  sessionsTable,
  STAT_FIELDS,
  teamsTable,
  type Position,
  type StatField,
} from "@workspace/db";

export type StatLine = Record<StatField, number>;

export type PublicPlayer = {
  id: number;
  name: string;
  jerseyNumber?: number;
  position?: Position;
  active: boolean;
};

export type PlayerStats = { player: PublicPlayer; stats: StatLine };

export type SessionSummary = {
  id: number;
  kind: "practice" | "game";
  label: string;
  occurredOn: string;
  opponent?: string;
  notes?: string;
};

/**
 * Strip a player row down to what the API is allowed to return.
 *
 * `studentId` is school-issued personal data. It lives in the database so a
 * coach can reconcile a roster, and it stops here.
 */
export function toPublicPlayer(row: typeof playersTable.$inferSelect): PublicPlayer {
  return {
    id: row.id,
    name: row.name,
    ...(row.jerseyNumber !== null ? { jerseyNumber: row.jerseyNumber } : {}),
    ...(row.position !== null ? { position: row.position } : {}),
    active: row.active,
  };
}

export function toSessionSummary(
  row: typeof sessionsTable.$inferSelect,
): SessionSummary {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    occurredOn: row.occurredOn,
    ...(row.opponent !== null ? { opponent: row.opponent } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}

function pickStatLine(row: Record<string, unknown>): StatLine {
  const line = emptyStatLine();
  for (const field of STAT_FIELDS) {
    line[field] = Number(row[field] ?? 0);
  }
  return line;
}

/* -------------------------------------------------------------------------- */
/* Teams                                                                       */
/* -------------------------------------------------------------------------- */

export async function findTeamBySlug(slug: string) {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.slug, slug))
    .limit(1);
  return team ?? null;
}

/** Every team, for the passcode-to-team lookup at login. */
export async function listTeams() {
  return db.select().from(teamsTable).orderBy(teamsTable.id);
}

export async function findTeamById(id: number) {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, id))
    .limit(1);
  return team ?? null;
}

/* -------------------------------------------------------------------------- */
/* Players                                                                     */
/* -------------------------------------------------------------------------- */

/** Whole roster, active players first, then alphabetical. */
export async function listPlayers(teamId: number) {
  return db
    .select()
    .from(playersTable)
    .where(eq(playersTable.teamId, teamId))
    .orderBy(desc(playersTable.active), asc(playersTable.name));
}

export async function createPlayer(input: {
  teamId: number;
  name: string;
  jerseyNumber?: number | undefined;
  position?: Position | undefined;
}) {
  const [player] = await db
    .insert(playersTable)
    .values({
      teamId: input.teamId,
      name: input.name,
      jerseyNumber: input.jerseyNumber ?? null,
      position: input.position ?? null,
    })
    .returning();
  return player!;
}

export async function updatePlayer(
  teamId: number,
  playerId: number,
  patch: {
    name?: string | undefined;
    jerseyNumber?: number | null | undefined;
    position?: Position | undefined;
    active?: boolean | undefined;
  },
) {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values["name"] = patch.name;
  if (patch.jerseyNumber !== undefined) values["jerseyNumber"] = patch.jerseyNumber;
  if (patch.position !== undefined) values["position"] = patch.position;
  if (patch.active !== undefined) values["active"] = patch.active;

  if (Object.keys(values).length === 0) return findPlayer(teamId, playerId);

  const [player] = await db
    .update(playersTable)
    .set(values)
    .where(and(eq(playersTable.teamId, teamId), eq(playersTable.id, playerId)))
    .returning();
  return player ?? null;
}

/**
 * Take a player off the active roster without touching their stats.
 *
 * Deleting the row would cascade to every stat line they ever recorded and
 * silently rewrite the team's season, so removal is a flag, not a delete.
 */
export async function deactivatePlayer(teamId: number, playerId: number) {
  return updatePlayer(teamId, playerId, { active: false });
}

export async function findPlayer(teamId: number, playerId: number) {
  const [player] = await db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.teamId, teamId), eq(playersTable.id, playerId)))
    .limit(1);
  return player ?? null;
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

export async function listSessions(teamId: number) {
  return db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.teamId, teamId))
    .orderBy(desc(sessionsTable.occurredOn), desc(sessionsTable.id));
}

export async function findSession(teamId: number, sessionId: number) {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.teamId, teamId), eq(sessionsTable.id, sessionId)))
    .limit(1);
  return session ?? null;
}

export async function updateSession(
  teamId: number,
  sessionId: number,
  patch: {
    kind?: "practice" | "game" | undefined;
    label?: string | undefined;
    occurredOn?: string | undefined;
    opponent?: string | undefined;
    notes?: string | undefined;
  },
) {
  const values: Record<string, unknown> = {};
  if (patch.kind !== undefined) values["kind"] = patch.kind;
  if (patch.label !== undefined) values["label"] = patch.label;
  if (patch.occurredOn !== undefined) values["occurredOn"] = patch.occurredOn;
  if (patch.opponent !== undefined) values["opponent"] = patch.opponent;
  if (patch.notes !== undefined) values["notes"] = patch.notes;

  if (Object.keys(values).length === 0) return findSession(teamId, sessionId);

  const [session] = await db
    .update(sessionsTable)
    .set(values)
    .where(and(eq(sessionsTable.teamId, teamId), eq(sessionsTable.id, sessionId)))
    .returning();
  return session ?? null;
}

export async function createSession(input: {
  teamId: number;
  kind: "practice" | "game";
  label: string;
  occurredOn: string;
  opponent?: string | undefined;
  notes?: string | undefined;
}) {
  const [session] = await db
    .insert(sessionsTable)
    .values({
      teamId: input.teamId,
      kind: input.kind,
      label: input.label,
      occurredOn: input.occurredOn,
      opponent: input.opponent ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return session!;
}

/** How many stat rows a session holds. Zero means it is safe to delete. */
export async function sessionStatRowCount(sessionId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playerSessionStatsTable)
    .where(eq(playerSessionStatsTable.sessionId, sessionId));
  return row?.count ?? 0;
}

export async function deleteSession(teamId: number, sessionId: number) {
  const [session] = await db
    .delete(sessionsTable)
    .where(and(eq(sessionsTable.teamId, teamId), eq(sessionsTable.id, sessionId)))
    .returning();
  return session ?? null;
}

/* -------------------------------------------------------------------------- */
/* Stat lines                                                                  */
/* -------------------------------------------------------------------------- */

const sumColumns = Object.fromEntries(
  STAT_FIELDS.map((field) => [
    field,
    sql<number>`coalesce(sum(${playerSessionStatsTable[field]}), 0)::int`,
  ]),
) as Record<StatField, ReturnType<typeof sql<number>>>;

/**
 * Season-to-date totals for every player on the roster.
 *
 * Players with no recorded stats still appear, with an all-zero line, so the
 * roster never silently shrinks.
 */
export async function seasonTotals(teamId: number): Promise<PlayerStats[]> {
  const players = await listPlayers(teamId);

  const rows = await db
    .select({ playerId: playerSessionStatsTable.playerId, ...sumColumns })
    .from(playerSessionStatsTable)
    .innerJoin(sessionsTable, eq(playerSessionStatsTable.sessionId, sessionsTable.id))
    .where(eq(sessionsTable.teamId, teamId))
    .groupBy(playerSessionStatsTable.playerId);

  const byPlayer = new Map<number, StatLine>();
  for (const row of rows) {
    byPlayer.set(row.playerId, pickStatLine(row as Record<string, unknown>));
  }

  return players.map((player) => ({
    player: toPublicPlayer(player),
    stats: byPlayer.get(player.id) ?? emptyStatLine(),
  }));
}

/** Every player's line for one session, zero-filled for players who did not play. */
export async function sessionTotals(
  teamId: number,
  sessionId: number,
): Promise<PlayerStats[]> {
  const players = await listPlayers(teamId);

  const rows = await db
    .select()
    .from(playerSessionStatsTable)
    .where(eq(playerSessionStatsTable.sessionId, sessionId));

  const byPlayer = new Map<number, StatLine>();
  for (const row of rows) {
    byPlayer.set(row.playerId, pickStatLine(row as unknown as Record<string, unknown>));
  }

  return players.map((player) => ({
    player: toPublicPlayer(player),
    stats: byPlayer.get(player.id) ?? emptyStatLine(),
  }));
}

/**
 * Add `delta` to one stat, creating the session row if this is the player's
 * first recorded action of the session.
 *
 * Written as a single upsert so two people tapping on two phones cannot
 * clobber each other or create duplicate rows. Counters are clamped at zero.
 */
export async function applyDelta(input: {
  sessionId: number;
  playerId: number;
  stat: StatField;
  delta: number;
}): Promise<StatLine> {
  const column = playerSessionStatsTable[input.stat];

  const [row] = await db
    .insert(playerSessionStatsTable)
    .values({
      sessionId: input.sessionId,
      playerId: input.playerId,
      [input.stat]: Math.max(0, input.delta),
    })
    .onConflictDoUpdate({
      target: [playerSessionStatsTable.sessionId, playerSessionStatsTable.playerId],
      set: {
        [input.stat]: sql`greatest(0, ${column} + ${input.delta})`,
        updatedAt: new Date(),
      },
    })
    .returning();

  return pickStatLine(row as unknown as Record<string, unknown>);
}

/** Set one stat to an exact value. Used by the inline table edit. */
export async function setStatValue(input: {
  sessionId: number;
  playerId: number;
  stat: StatField;
  value: number;
}): Promise<StatLine> {
  const value = Math.max(0, Math.trunc(input.value));

  const [row] = await db
    .insert(playerSessionStatsTable)
    .values({
      sessionId: input.sessionId,
      playerId: input.playerId,
      [input.stat]: value,
    })
    .onConflictDoUpdate({
      target: [playerSessionStatsTable.sessionId, playerSessionStatsTable.playerId],
      set: { [input.stat]: value, updatedAt: new Date() },
    })
    .returning();

  return pickStatLine(row as unknown as Record<string, unknown>);
}

/** Zero every stat line in one session. Deliberately not season-wide. */
export async function resetSession(sessionId: number): Promise<void> {
  await db
    .delete(playerSessionStatsTable)
    .where(eq(playerSessionStatsTable.sessionId, sessionId));
}

/** One player's line for every session they appear in, newest session first. */
export async function playerHistory(teamId: number, playerId: number) {
  const rows = await db
    .select({ session: sessionsTable, stats: playerSessionStatsTable })
    .from(playerSessionStatsTable)
    .innerJoin(sessionsTable, eq(playerSessionStatsTable.sessionId, sessionsTable.id))
    .where(
      and(
        eq(playerSessionStatsTable.playerId, playerId),
        eq(sessionsTable.teamId, teamId),
      ),
    )
    .orderBy(desc(sessionsTable.occurredOn), desc(sessionsTable.id));

  return rows.map((row) => ({
    session: toSessionSummary(row.session),
    stats: pickStatLine(row.stats as unknown as Record<string, unknown>),
  }));
}

export function sumStatLines(lines: StatLine[]): StatLine {
  const total = emptyStatLine();
  for (const line of lines) {
    for (const field of STAT_FIELDS) total[field] += line[field];
  }
  return total;
}
