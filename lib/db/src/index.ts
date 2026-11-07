import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. In production this is the Neon pooled connection string.",
  );
}

/**
 * Serverless functions get frozen between requests and there can be many
 * instances at once, so each one keeps a single connection rather than a fan of
 * them. Neon's pooler does the real pooling on its side.
 *
 * The module scope is reused across warm invocations, so this pool is created
 * once per instance rather than once per request.
 */
export const pool: pg.Pool = new Pool({
  connectionString,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

pool.on("error", (err) => {
  // A dropped idle connection is normal against a serverless database and must
  // not be allowed to take the process down.
  console.error("[db] idle client error", err.message);
});

export const db: ReturnType<typeof drizzle<typeof schema>> = drizzle(pool, {
  schema,
});

export * from "./passcode";
export * from "./schema";
