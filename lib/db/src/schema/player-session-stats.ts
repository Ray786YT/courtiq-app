import {
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";
import { sessionsTable } from "./sessions";

const counter = (columnName: string) =>
  integer(columnName).notNull().default(0);

/**
 * One player's stat line for one session.
 *
 * Every column is a non-negative counter. There is exactly one row per
 * (session, player) pair, enforced by a unique index, so an increment is a
 * single upsert and concurrent taps from two phones cannot create duplicates.
 */
export const playerSessionStatsTable = pgTable(
  "player_session_stats",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessionsTable.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),

    hittingAttempts: counter("hitting_attempts"),
    hitsIn: counter("hits_in"),
    hitsOut: counter("hits_out"),
    hittingErrors: counter("hitting_errors"),
    tips: counter("tips"),
    blocks: counter("blocks"),
    blockingErrors: counter("blocking_errors"),
    pass0: counter("pass_0"),
    pass1: counter("pass_1"),
    pass2: counter("pass_2"),
    pass3: counter("pass_3"),
    aces: counter("aces"),
    servingNeutral: counter("serving_neutral"),
    servingErrors: counter("serving_errors"),
    digsPositive: counter("digs_positive"),
    digsNegative: counter("digs_negative"),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionPlayerIdx: uniqueIndex("player_session_stats_session_player_idx").on(
      table.sessionId,
      table.playerId,
    ),
  }),
);

export type PlayerSessionStats = typeof playerSessionStatsTable.$inferSelect;
export type InsertPlayerSessionStats = typeof playerSessionStatsTable.$inferInsert;
