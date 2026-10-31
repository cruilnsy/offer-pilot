// Fetch jobs once a day: pnpm fetch-jobs
// 1. ATS sources: one request per company in data/companies.json
// 2. Job board sources: many companies at once
// 3. Normalize, filter, save; jobs missing from this run are marked closed
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { ONE_AT_A_TIME_GAP_MS, atsFetchers, boardFetchers, oneAtATime, type AtsSource, type BoardSource, type Company, type FetchScope, type NormalizedJob } from "../src/lib/ats";
import { slugify } from "../src/lib/ats/text";
import { loadCompanies } from "../src/lib/companies";
import { dedupeKey } from "../src/lib/dedupe";
import { activeSources, loadSourceSettings } from "../src/lib/source-settings";
import { listBoards } from "../src/lib/board-store";
import { jobMatcher, searchTerms, titleMatcher } from "../src/lib/filter";

const { jobs, fetchRuns } = schema;
const CONCURRENCY = 6;

type Stat = { jobs: number; matches: number; newMatches: number; closed: number; errors: number };
const stats: Record<string, Stat> = {};
const stat = (s: string) => (stats[s] ??= { jobs: 0, matches: 0, newMatches: 0, closed: 0, errors: 0 });
const errors: { source: string; error: string }[] = [];

const userBoards = listBoards();
const matchers = userBoards.map(jobMatcher);
const titleMatchers = userBoards.map(titleMatcher);
const scope: FetchScope = {
  searchTerms: [...new Set(userBoards.flatMap(searchTerms))],
  titleMayMatch: (title) => titleMatchers.some((m) => m(title)),
};

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

interface Row extends NormalizedJob {
  id: string;
  companyName: string;
  companySlug: string;
  status?: (typeof schema.JOB_STATUSES)[number];
}

/** Save a batch of jobs; closeScope is where "missing this run" means closed (one company, or a whole board) */
function saveJobs(source: string, rows: Row[], runStart: string, closeScope: { companySlug?: string }) {
  const s = stat(source);
  s.jobs += rows.length;
  const existing = new Set<string>();
  for (let i = 0; i < rows.length; i += 500) {
    const ids = rows.slice(i, i + 500).map((r) => r.id);
    db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.id, ids)).all().forEach((r) => existing.add(r.id));
  }

  // The same job was already marked on another source (applied, skipped…): the new source inherits that status
  const keys = [...new Set(rows.map((r) => dedupeKey(r.companyName, r.title)))];
  const knownStatus = new Map<string, Row["status"]>();
  for (let i = 0; i < keys.length; i += 500) {
    db.select({ key: jobs.dedupeKey, status: jobs.status })
      .from(jobs)
      .where(and(inArray(jobs.dedupeKey, keys.slice(i, i + 500)), sql`${jobs.status} != 'new'`))
      .all()
      .forEach((r) => r.key && knownStatus.set(r.key, r.status));
  }

  db.transaction((tx) => {
    for (const j of rows) {
      const matches = matchers.some((m) => m(j));
      const key = dedupeKey(j.companyName, j.title);
      if (matches) s.matches++;
      if (matches && !existing.has(j.id)) s.newMatches++;
      const values = {
        companyName: j.companyName,
        companySlug: j.companySlug,
        title: j.title,
        location: j.location,
        country: j.country,
        isRemote: j.isRemote,
        department: j.department,
        compensation: j.compensation,
        url: j.url,
        applyUrl: j.applyUrl,
        descriptionText: matches ? j.descriptionText : null, // keep descriptions only for jobs on a board
        postedAt: j.postedAt,
        dedupeKey: key,
        lastSeenAt: runStart,
        closedAt: null,
      };
      tx.insert(jobs)
        .values({ id: j.id, source, externalId: j.externalId, firstSeenAt: runStart, status: knownStatus.get(key) ?? "new", ...values })
        .onConflictDoUpdate({ target: jobs.id, set: values })
        .run();
    }
    const scope = closeScope.companySlug ? eq(jobs.companySlug, closeScope.companySlug) : undefined;
    s.closed += tx
      .update(jobs)
      .set({ closedAt: runStart })
      .where(and(eq(jobs.source, source), scope, isNull(jobs.closedAt), lt(jobs.lastSeenAt, runStart)))
      .run().changes;
  });
}

async function fetchCompany(company: Company, runStart: string) {
  try {
    const list = await atsFetchers[company.ats as AtsSource](company.slug, scope);
    const rows = list.map((j) => ({ ...j, id: `${company.ats}:${company.slug}:${j.externalId}`, companyName: company.name, companySlug: company.slug }));
    saveJobs(company.ats, rows, runStart, { companySlug: company.slug });
  } catch (e) {
    // Fetch failed: leave this company's jobs alone so they are not wrongly marked closed
    stat(company.ats).errors++;
    errors.push({ source: `${company.ats}:${company.name}`, error: (e as Error).message });
  }
}

async function fetchBoard(source: BoardSource, runStart: string) {
  try {
    const list = await boardFetchers[source]();
    const rows = list.map((j) => ({ ...j, id: `${source}:${j.externalId}`, companySlug: slugify(j.companyName) }));
    saveJobs(source, rows, runStart, {});
  } catch (e) {
    stat(source).errors++;
    errors.push({ source, error: (e as Error).message });
  }
}

async function main() {
  const settings = loadSourceSettings();
  const active = activeSources(settings);
  if (!active.length) throw new Error("No sources yet: add one on the Sources page of the web app");
  const companies = loadCompanies().filter((c) => active.includes(c.ats) && c.ats in atsFetchers);
  const noConnector = active.filter((id) => !(id in atsFetchers) && !(id in boardFetchers));
  if (noConnector.length) console.log(`No connector for these sources, skipping: ${noConnector.join(", ")}`);
  const boards = (Object.keys(boardFetchers) as BoardSource[]).filter((b) => active.includes(b));
  const runStart = new Date().toISOString();
  const [run] = db.insert(fetchRuns).values({ startedAt: runStart, companies: companies.length + boards.length }).returning().all();

  const sequential = companies.filter((c) => oneAtATime.has(c.ats));
  const others = companies.filter((c) => !oneAtATime.has(c.ats));

  await Promise.all([
    mapLimit(others, CONCURRENCY, (c) => fetchCompany(c, runStart)),
    (async () => {
      for (const c of sequential) {
        await fetchCompany(c, runStart);
        await new Promise((r) => setTimeout(r, ONE_AT_A_TIME_GAP_MS));
      }
    })(),
    Promise.all(boards.map((b) => fetchBoard(b, runStart))),
  ]);

  // Backfill dedupe keys for older rows (e.g. closed jobs)
  const missing = db.select({ id: jobs.id, companyName: jobs.companyName, title: jobs.title }).from(jobs).where(isNull(jobs.dedupeKey)).all();
  db.transaction((tx) => {
    for (const m of missing) tx.update(jobs).set({ dedupeKey: dedupeKey(m.companyName, m.title) }).where(eq(jobs.id, m.id)).run();
  });

  const total = Object.values(stats).reduce(
    (a, s) => ({ jobs: a.jobs + s.jobs, newMatches: a.newMatches + s.newMatches, closed: a.closed + s.closed }),
    { jobs: 0, newMatches: 0, closed: 0 },
  );
  db.update(fetchRuns)
    .set({
      finishedAt: new Date().toISOString(),
      jobsSeen: total.jobs,
      newMatches: total.newMatches,
      closedJobs: total.closed,
      errors: errors.length ? JSON.stringify(errors) : null,
      stats: JSON.stringify(stats),
    })
    .where(eq(fetchRuns.id, run.id))
    .run();

  if (settings.disabled.length) console.log(`Turned off on the Sources page: ${settings.disabled.join(", ")}`);
  console.log(`Fetched ${companies.length} companies + ${boards.length} job boards: ${total.jobs} jobs`);
  console.table(Object.fromEntries(Object.entries(stats).map(([k, s]) => [k, s])));
  console.log(`New jobs on your boards: ${total.newMatches}; closed this run: ${total.closed}`);
  if (!userBoards.length) console.log("No boards yet: create one in the web app so jobs are matched and descriptions are kept");
  if (errors.length) console.log("Failed sources:", errors);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
