import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DEMO } from "../lib/demo";
import { seedDemo } from "./demo";
import * as schema from "./schema";

// OFFER_PILOT_DB points at another database file, e.g. demo data for screenshots
export const DB_PATH = process.env.OFFER_PILOT_DB || path.join(process.cwd(), "data", "jobs.db");

// Hot reload in dev re-runs this file; keep the connection on globalThis so we do not open many
const globalForDb = globalThis as unknown as { sqlite?: Database.Database };

function open() {
  if (DEMO) {
    const sqlite = new Database(":memory:");
    seedDemo(sqlite);
    return sqlite;
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  // WAL lets the web app read while the fetch script writes. The mode is stored in the file, so
  // when several processes open a new database at once (parallel `next build` workers), the
  // ones that lose the race get SQLITE_BUSY and can rely on the winner.
  try {
    sqlite.pragma("journal_mode = WAL");
  } catch (err) {
    if ((err as { code?: string }).code !== "SQLITE_BUSY") throw err;
  }
  return sqlite;
}

const sqlite = globalForDb.sqlite ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
