import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

/**
 * Court positions.
 *
 * These exist because hitting efficiency is not comparable across them. A
 * middle swings at quick sets right at the net and routinely hits .350+; an
 * outside swings from the pin into a double block and .200 is a good night; a
 * libero never swings at all. Ranking them together produces a leaderboard that
 * is always topped by middles and that any coach will distrust on sight.
 */
export const positionEnum = pgEnum("player_position", [
  "OH", // outside hitter
  "OPP", // opposite / right side
  "MB", // middle blocker
  "S", // setter
  "L", // libero
  "DS", // defensive specialist
]);

export type Position = (typeof positionEnum.enumValues)[number];

export const POSITION_LABELS: Record<Position, string> = {
  OH: "Outside",
  OPP: "Right side",
  MB: "Middle",
  S: "Setter",
  L: "Libero",
  DS: "Defensive specialist",
};

/** Positions whose players are expected to attack. */
export const ATTACKING_POSITIONS: readonly Position[] = ["OH", "OPP", "MB"];

export const playersTable = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teamsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** School-issued personal data. Stored for roster reconciliation, never returned by the API. */
    studentId: text("student_id"),
    jerseyNumber: integer("jersey_number"),
    position: positionEnum("position"),
    /**
     * Players are deactivated, never deleted. A player who leaves mid-season
     * still owns the stats they earned, and deleting the row would take the
     * team's history with it.
     */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    teamNameIdx: uniqueIndex("players_team_name_idx").on(table.teamId, table.name),
  }),
);

export type Player = typeof playersTable.$inferSelect;
export type InsertPlayer = typeof playersTable.$inferInsert;
