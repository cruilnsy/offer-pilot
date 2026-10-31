import { connection } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Job, JobStatus } from "@/db/schema";
import { jobMatcher, type BoardRules } from "./filter";
import { loadSourceSettings } from "./source-settings";

const { jobs, fetchRuns } = schema;

export const VIEWS = {
  new: { statuses: ["new", "prepared"] },
  applied: { statuses: ["applied", "interviewing", "offer", "rejected"] },
  skipped: { statuses: ["skipped"] },
  all: { statuses: null },
} satisfies Record<string, { statuses: JobStatus[] | null }>; // labels live in the i18n dictionaries
export type View = keyof typeof VIEWS;
export type Source = Job["source"];

export function parseView(v: unknown): View {
  return typeof v === "string" && v in VIEWS ? (v as View) : "new";
}

/** Postings of the same job (same dedupe key) across sources and cities, merged into one group */
export interface JobGroup {
  key: string;
  primary: Job; // the posting shown on the page: open ones first, ATS before job boards
  others: Job[]; // the same job on other sources or in other cities
  status: JobStatus;
  closed: boolean; // closed on every source
  stale: boolean; // posted more than MAX_AGE_DAYS ago (jobs without a date never count)
  sources: Source[];
}

// ATS links go straight to the application, so they come first in a group
function sourcePriority() {
  const { direct } = loadSourceSettings();
  const rank = { ats: 0, board: 1 };
  return (s: Source) => rank[direct.find((d) => d.id === s)?.kind ?? "board"];
}
const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

// Old postings are usually filled already, just never taken down
const MAX_AGE_DAYS = 100;

function groupJobs(rows: Job[], now: number): JobGroup[] {
  const cutoff = now - MAX_AGE_DAYS * 86_400_000;
  const priority = sourcePriority();
  const byKey = new Map<string, Job[]>();
  for (const j of rows) {
    const key = j.dedupeKey ?? j.id;
    byKey.set(key, [...(byKey.get(key) ?? []), j]);
  }
  return [...byKey.entries()].map(([key, members]) => {
    const sorted = [...members].sort(
      (a, b) =>
        Number(Boolean(a.closedAt)) - Number(Boolean(b.closedAt)) || priority(a.source) - priority(b.source) || time(b.postedAt) - time(a.postedAt),
    );
    const [primary, ...others] = sorted;
    // A group's status is changed together; if it ever differs, a handled status wins
    const status = sorted.find((j) => j.status !== "new")?.status ?? "new";
    return {
      key,
      primary,
      others,
      status,
      closed: members.every((j) => j.closedAt),
      stale: members.every((j) => j.postedAt && time(j.postedAt) < cutoff),
      sources: [...new Set(sorted.map((j) => j.source))],
    };
  });
}

function inView(g: JobGroup, view: View) {
  const statuses = VIEWS[view].statuses as readonly JobStatus[] | null;
  if (statuses && !statuses.includes(g.status)) return false;
  // Applied jobs stay visible even when closed or old; other views show only open, recent jobs
  return view === "applied" || (!g.closed && !g.stale);
}

function matchesSearch(g: JobGroup, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [g.primary, ...g.others].some((j) => `${j.title} ${j.companyName} ${j.location}`.toLowerCase().includes(needle));
}

/** What a board would show right now, for the live preview on the board form */
export function getBoardPreview(rules: BoardRules, sampleSize = 6) {
  const now = Date.now();
  const open = groupJobs(db.select().from(jobs).all().filter(jobMatcher(rules)), now)
    .filter((g) => !g.closed && !g.stale)
    .sort((a, b) => time(b.primary.postedAt) - time(a.primary.postedAt));
  const sample = open.slice(0, sampleSize).map(({ key, primary: j }) => ({ key, company: j.companyName, title: j.title, location: j.location }));
  return { count: open.length, sample };
}

export async function getDashboard(rules: BoardRules, view: View, q: string, source: Source | null) {
  // better-sqlite3 is synchronous: without connection(), Next.js would freeze the result at build time
  await connection();
  const now = Date.now();
  const groups = groupJobs(db.select().from(jobs).all().filter(jobMatcher(rules)), now);

  const counts = Object.fromEntries((Object.keys(VIEWS) as View[]).map((v) => [v, groups.filter((g) => inView(g, v)).length])) as Record<
    View,
    number
  >;

  // Open, matching jobs per source (distinct jobs)
  const bySource: Record<string, number> = {};
  for (const g of groups) {
    if (g.closed || g.stale) continue;
    for (const s of g.sources) bySource[s] = (bySource[s] ?? 0) + 1;
  }

  const list = groups
    .filter((g) => inView(g, view) && matchesSearch(g, q) && (!source || g.sources.includes(source)))
    .sort((a, b) => time(b.primary.postedAt) - time(a.primary.postedAt));

  const lastRun = db.select().from(fetchRuns).orderBy(desc(fetchRuns.id)).limit(1).get();
  const duplicates = groups.filter((g) => !g.closed && !g.stale && g.others.length > 0).length;

  // Read the current time here too (after connection()), so components never call Date.now()
  return { list, counts, bySource, lastRun, duplicates, now };
}
