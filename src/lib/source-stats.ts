import { connection } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { listBoards } from "./board-store";
import { loadCompanies } from "./companies";
import { jobMatcher } from "./filter";

const { jobs, fetchRuns } = schema;
type Stat = { jobs: number; matches: number; newMatches: number; closed: number; errors: number };

/** Stats for the Sources page: companies tracked per source, open matching jobs, and the last fetch */
export async function getSourceStats() {
  await connection();
  const companies = loadCompanies();
  const companyCount: Record<string, number> = {};
  for (const c of companies) companyCount[c.ats] = (companyCount[c.ats] ?? 0) + 1;

  // Open jobs on any board, counted once per job
  const matchers = listBoards().map(jobMatcher);
  const seen = new Set<string>();
  const openMatches: Record<string, number> = {};
  for (const j of db.select().from(jobs).all()) {
    if (j.closedAt || j.source === "manual" || !matchers.some((m) => m(j))) continue;
    const key = `${j.source}:${j.dedupeKey ?? j.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    openMatches[j.source] = (openMatches[j.source] ?? 0) + 1;
  }

  const lastRun = db.select().from(fetchRuns).orderBy(desc(fetchRuns.id)).limit(1).get();
  const lastStats = (lastRun?.stats ? JSON.parse(lastRun.stats) : {}) as Record<string, Stat>;
  const lastErrors = (lastRun?.errors ? JSON.parse(lastRun.errors) : []) as { source: string; error: string }[];

  return { companies, companyCount, openMatches, lastRun, lastStats, lastErrors };
}
