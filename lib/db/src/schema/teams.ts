import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * A team is the unit of access control. One passcode unlocks one team.
 * CourtIQ starts with a single SLSS team, but the shape supports the
 * multi-school rollout without a migration.
 */
export const teamsTable = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    school: text("school"),
    /** scrypt hash, formatted "scrypt$<saltHex>$<keyHex>". Never the raw passcode. */
    passcodeHash: text("passcode_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("teams_slug_idx").on(table.slug),
  }),
);

export type Team = typeof teamsTable.$inferSelect;
export type InsertTeam = typeof teamsTable.$inferInsert;
