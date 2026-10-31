import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { template } from "../lib/board-templates";
import type { Company } from "../lib/ats/types";
import { dedupeKey } from "../lib/dedupe";
import * as schema from "./schema";
import type { Job, JobStatus } from "./schema";

// Sample data for demo mode. Every company is fictional and every link points at example.com.

const DAY = 86_400_000;

type Row = {
  source: Job["source"];
  company: string;
  title: string;
  location: string;
  pay?: string;
  days: number; // posted this many days ago
  status?: JobStatus;
  closed?: boolean;
};

const ROWS: Row[] = [
  { source: "mock-careers", company: "Pied Piper", title: "Senior AI Engineer", location: "Remote - US", pay: "$170K – $220K", days: 0 },
  { source: "mock-jobs", company: "Pied Piper", title: "Senior AI Engineer", location: "Remote - US", days: 1 },
  { source: "mock-careers", company: "Cyberdyne", title: "AI Engineer", location: "Remote - US", pay: "$165K – $210K", days: 0 },
  { source: "mock-ats", company: "Tyrell", title: "Applied AI Engineer, Agents", location: "Austin, TX", days: 1 },
  { source: "mock-jobs", company: "Aperture", title: "Forward Deployed Engineer, AI", location: "Remote - US", days: 2 },
  { source: "mock-careers", company: "Oscorp", title: "Software Engineer, LLM Applications", location: "New York, NY", days: 4 },
  { source: "mock-ats", company: "Massive Dynamic", title: "Staff AI Engineer", location: "Remote - US", pay: "$185K – $230K", days: 5 },
  { source: "mock-jobs", company: "Weyland", title: "AI Product Engineer", location: "Remote - US", days: 7, status: "applied" },
  { source: "mock-careers", company: "Stark Industries", title: "Applied AI Engineer, Growth", location: "Seattle, WA", days: 12, status: "interviewing" },
  { source: "mock-ats", company: "Dunder Mifflin", title: "AI Engineer, Sales Tools", location: "Remote - US", days: 8, status: "skipped" },
  { source: "mock-ats", company: "Umbrella", title: "Prompt Engineer", location: "Remote - US", days: 20, closed: true },
  { source: "mock-ats", company: "Sirius Cybernetics", title: "Senior Data Engineer", location: "Remote - US", pay: "$155K – $195K", days: 1 },
  { source: "mock-careers", company: "Nakatomi", title: "Analytics Engineer", location: "New York, NY", days: 3 },
  { source: "mock-jobs", company: "Prestige Worldwide", title: "Data Scientist, Growth", location: "Remote - US", days: 5 },
];

const DEMO_BOARDS = ["AI", "Data"];
const DEMO_CITIES = ["Austin", "New York", "Seattle"];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function demoJobs(now: number): Job[] {
  return ROWS.map((r, i) => {
    const posted = new Date(now - r.days * DAY).toISOString();
    const companySlug = slug(r.company);
    const url = `https://example.com/${companySlug}/${i + 1}`;
    return {
      id: `${r.source}:${companySlug}:${i + 1}`,
      source: r.source,
      companyName: r.company,
      companySlug,
      externalId: String(i + 1),
      title: r.title,
      location: r.location,
      country: null,
      isRemote: r.location.startsWith("Remote"),
      department: "Engineering",
      compensation: r.pay ?? null,
      url,
      applyUrl: url,
      descriptionText: `Sample posting for the Offer Pilot demo. ${r.company} is a fictional company.`,
      postedAt: posted,
      firstSeenAt: posted,
      lastSeenAt: new Date(now).toISOString(),
      closedAt: r.closed ? new Date(now - DAY).toISOString() : null,
      dedupeKey: dedupeKey(r.company, r.title),
      status: r.status ?? "new",
      statusUpdatedAt: r.status ? posted : null,
      note: null,
      score: null,
      scoreReason: null,
    };
  });
}

/** The companies behind the sample jobs, shown on the Sources page */
export function demoCompanies(): Company[] {
  const unique = new Map(ROWS.map((r) => [`${r.source}:${r.company}`, r]));
  return [...unique.values()].map((r) => ({ name: r.company, ats: r.source, slug: slug(r.company) }));
}

function demoRun(rows: Job[], now: number) {
  const stats: Record<string, { jobs: number; matches: number; newMatches: number; closed: number; errors: number }> = {};
  for (const j of rows) {
    const s = (stats[j.source] ??= { jobs: 0, matches: 0, newMatches: 0, closed: 0, errors: 0 });
    s.jobs += 1;
    s.matches += 1;
  }
  return {
    startedAt: new Date(now - 180_000).toISOString(),
    finishedAt: new Date(now).toISOString(),
    companies: Object.keys(stats).length,
    jobsSeen: rows.length,
    newMatches: rows.filter((j) => j.firstSeenAt === new Date(now).toISOString()).length,
    closedJobs: rows.filter((j) => j.closedAt).length,
    stats: JSON.stringify(stats),
  };
}

/** Create the tables from the Drizzle schema, so they cannot drift from it, and fill them with sample data. */
export function seedDemo(sqlite: Database.Database, now = Date.now()) {
  for (const table of [schema.jobs, schema.fetchRuns, schema.boards]) {
    const { name, columns } = getTableConfig(table);
    const defs = columns.map((c) => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`);
    sqlite.exec(`CREATE TABLE "${name}" (${defs.join(", ")})`);
  }
  const db = drizzle(sqlite, { schema });
  const rows = demoJobs(now);
  db.insert(schema.jobs).values(rows).run();
  db.insert(schema.fetchRuns).values(demoRun(rows, now)).run();
  db.insert(schema.boards)
    .values(DEMO_BOARDS.map((name, i) => ({ ...template(name), cities: DEMO_CITIES, name, slug: name.toLowerCase(), position: i })))
    .run();
}
