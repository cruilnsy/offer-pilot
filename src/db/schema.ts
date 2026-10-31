import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const JOB_STATUSES = ["new", "prepared", "applied", "interviewing", "offer", "rejected", "skipped"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const jobs = sqliteTable(
  "jobs",
  {
    // `${source}:${companySlug}:${externalId}`: the same job gets the same id on every fetch
    id: text("id").primaryKey(),
    source: text("source").notNull(), // a source id, or "manual"
    companyName: text("company_name").notNull(),
    companySlug: text("company_slug").notNull(),
    externalId: text("external_id").notNull(),

    title: text("title").notNull(),
    location: text("location").notNull().default(""),
    country: text("country"), // given by some sources; the location rules use it
    isRemote: integer("is_remote", { mode: "boolean" }).notNull().default(false),
    department: text("department"),
    compensation: text("compensation"),
    url: text("url").notNull(),
    applyUrl: text("apply_url"),
    descriptionText: text("description_text"), // stored only for jobs that pass the filters, which keeps the database small
    postedAt: text("posted_at"),

    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    closedAt: text("closed_at"), // the job is gone from the ATS

    // normalized "company|title", used to merge the same job across sources (see src/lib/dedupe.ts)
    dedupeKey: text("dedupe_key"),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("new"),
    statusUpdatedAt: text("status_updated_at"),
    note: text("note"),

    // used later by LLM scoring
    score: integer("score"),
    scoreReason: text("score_reason"),
  },
  (t) => [
    index("jobs_company_idx").on(t.companySlug),
    index("jobs_status_idx").on(t.status),
    index("jobs_dedupe_idx").on(t.dedupeKey),
  ],
);

export const fetchRuns = sqliteTable("fetch_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  companies: integer("companies").notNull().default(0), // sources fetched in this run (companies + job boards)
  jobsSeen: integer("jobs_seen").notNull().default(0),
  newMatches: integer("new_matches").notNull().default(0),
  closedJobs: integer("closed_jobs").notNull().default(0),
  errors: text("errors"), // JSON: companies that failed
  stats: text("stats"), // JSON: jobs and matches per source
});

// A board is a saved search set by the user; which jobs match is worked out when a page loads (src/lib/filter.ts)
export const boards = sqliteTable("boards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  include: text("include", { mode: "json" }).$type<string[]>().notNull(),
  exclude: text("exclude", { mode: "json" }).$type<string[]>().notNull(),
  require: text("require", { mode: "json" }).$type<string[]>().notNull(),
  remoteUS: integer("remote_us", { mode: "boolean" }).notNull().default(false),
  worldwide: integer("worldwide", { mode: "boolean" }).notNull().default(false),
  cities: text("cities", { mode: "json" }).$type<string[]>().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type Board = typeof boards.$inferSelect;
