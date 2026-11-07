import {
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

export const sessionKindEnum = pgEnum("session_kind", ["practice", "game"]);

export type SessionKind = (typeof sessionKindEnum.enumValues)[number];

/**
 * One practice or game. Stats are recorded against a session rather than as a
 * single running total, so a coach can see change over time instead of one
 * cumulative number that only ever grows.
 *
 * Season-to-date figures are a SUM across sessions, computed on read.
 */
export const sessionsTable = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teamsTable.id, { onDelete: "cascade" }),
    kind: sessionKindEnum("kind").notNull().default("practice"),
    label: text("label").notNull(),
    occurredOn: date("occurred_on").notNull(),
    opponent: text("opponent"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    teamDateIdx: index("sessions_team_date_idx").on(table.teamId, table.occurredOn),
  }),
);

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
