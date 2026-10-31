import Link from "next/link";
import type { Board, Job } from "@/db/schema";
import { DICTIONARIES, type Dictionary } from "@/i18n/dictionaries";
import { getLocale } from "@/i18n/locale";
import { DEMO } from "@/lib/demo";
import { getDashboard, parseView, VIEWS, type JobGroup, type View } from "@/lib/jobs";
import { loadSourceSettings, sourceBadge, type SourceSettings } from "@/lib/source-settings";
import { setJobStatus, startAutofill } from "./actions";

// The job list of one board

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function Dashboard({ board, searchParams }: { board: Board; searchParams: SearchParams }) {
  const params = await searchParams;
  const view = parseView(params.view);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const settings = loadSourceSettings();
  const source = typeof params.source === "string" && (settings.direct.some((d) => d.id === params.source) || params.source === "manual") ? params.source : null;
  const { list, counts, bySource, lastRun, duplicates, now } = await getDashboard(board, view, q, source);
  const t = DICTIONARIES[await getLocale()];

  return (
    <>
      <p className="mb-4 text-sm text-neutral-500">
        {lastRun?.finishedAt
          ? t.jobs.lastRun(
              formatDateTime(lastRun.finishedAt, t.dateLocale),
              lastRun.companies,
              lastRun.newMatches,
              lastRun.closedJobs,
              duplicates,
            )
          : t.jobs.neverFetched}
      </p>

      <nav className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={{ query: { view: v, ...(q && { q }), ...(source && { source }) } }}
            className={`rounded-full px-3 py-1 text-sm ${
              v === view ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 dark:bg-neutral-800"
            }`}
          >
            {t.jobs.views[v]} {counts[v]}
          </Link>
        ))}
        <form className="w-full sm:ml-auto sm:w-auto">
          <input type="hidden" name="view" value={view} />
          {source && <input type="hidden" name="source" value={source} />}
          <input
            name="q"
            defaultValue={q}
            placeholder={t.jobs.searchPlaceholder}
            className="w-full rounded-md sm:w-56 border border-neutral-300 bg-transparent px-3 py-1 text-sm dark:border-neutral-700"
          />
        </form>
      </nav>

      {/* Filter by source (counts are open, matching jobs) */}
      <nav className="mb-4 flex flex-wrap gap-1.5 text-xs">
        <Link
          href={{ query: { view, ...(q && { q }) } }}
          className={`rounded px-2 py-0.5 ring-1 ring-inset ring-neutral-300 ${source ? "" : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"}`}
        >
          {t.jobs.allSources}
        </Link>
        {settings.direct
          .map((d) => d.id)
          .filter((s) => bySource[s])
          .map((s) => {
            const { label, badge } = sourceBadge(s, settings, t.jobs.manualSource);
            return (
              <Link
                key={s}
                href={{ query: { view, source: s, ...(q && { q }) } }}
                className={`rounded px-2 py-0.5 ring-1 ring-inset ${badge} ${s === source ? "font-semibold ring-2" : ""}`}
              >
                {label} {bySource[s]}
              </Link>
            );
          })}
      </nav>

      {list.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">{t.jobs.empty}</p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {list.map((group) => (
            <JobRow key={group.key} group={group} view={view} now={now} t={t} settings={settings} />
          ))}
        </ul>
      )}
    </>
  );
}

function JobRow({ group, view, now, t, settings }: { group: JobGroup; view: View; now: number; t: Dictionary; settings: SourceSettings }) {
  const job = group.primary;
  const all = [job, ...group.others];
  const isNew = all.every((j) => now - new Date(j.firstSeenAt).getTime() < 24 * 3600 * 1000);
  const description = all.find((j) => j.descriptionText)?.descriptionText;
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_100%] sm:flex-1">
          <p className="text-sm text-neutral-500">
            {job.companyName}
            <SourceBadge source={job.source} manualLabel={t.jobs.manualSource} settings={settings} />
            {isNew && <span className="ml-2 rounded bg-green-100 px-1.5 text-xs text-green-800">{t.jobs.newBadge}</span>}
            {group.closed && <span className="ml-2 rounded bg-neutral-200 px-1.5 text-xs text-neutral-600">{t.jobs.closedBadge}</span>}
          </p>
          <a href={job.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
            {job.title}
          </a>
          <p className="mt-1 text-sm text-neutral-500">
            {[job.location || "—", job.isRemote && t.jobs.remote, job.compensation, job.postedAt && t.jobs.posted(daysAgo(job.postedAt, now, t))]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {group.others.length > 0 && (
            // The same job on other sources, or posted again for other cities
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
              {t.jobs.alsoOn}
              {group.others.map((o) => {
                const { label, badge } = sourceBadge(o.source, settings, t.jobs.manualSource);
                return (
                  <a key={o.id} href={o.url} target="_blank" rel="noreferrer" className={`rounded px-1.5 ring-1 ring-inset hover:underline ${badge}`}>
                    {label}
                    {o.location && ` · ${o.location.length > 30 ? `${o.location.slice(0, 30)}…` : o.location}`}
                    {o.closedAt && t.jobs.closedSuffix}
                  </a>
                );
              })}
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          <a
            href={job.applyUrl ?? job.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            {t.jobs.openApply}
          </a>
          <form action={startAutofill}>
            <input type="hidden" name="id" value={job.id} />
            <button
              disabled={DEMO}
              title={DEMO ? t.demo.disabled : t.jobs.autofillHint}
              className="rounded-md border border-blue-600 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950"
            >
              {t.jobs.autofill}
            </button>
          </form>
          {view === "new" || view === "all" ? (
            <>
              <StatusButton id={job.id} status="applied" label={t.jobs.markApplied} disabledHint={t.demo.disabled} />
              <StatusButton id={job.id} status="skipped" label={t.jobs.markSkipped} disabledHint={t.demo.disabled} />
            </>
          ) : (
            <StatusButton id={job.id} status="new" label={t.jobs.undo} disabledHint={t.demo.disabled} />
          )}
        </div>
      </div>
      {description && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-neutral-500">{t.jobs.description}</summary>
          <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-line rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
            {description}
          </p>
        </details>
      )}
    </li>
  );
}

// Which platform the job came from
function SourceBadge({ source, manualLabel, settings }: { source: Job["source"]; manualLabel: string; settings: SourceSettings }) {
  const { label, badge } = sourceBadge(source, settings, manualLabel);
  return <span className={`ml-2 rounded px-1.5 text-xs ring-1 ring-inset ${badge}`}>{label}</span>;
}

function StatusButton({ id, status, label, disabledHint }: { id: string; status: string; label: string; disabledHint: string }) {
  return (
    <form action={setJobStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        disabled={DEMO}
        title={DEMO ? disabledHint : undefined}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {label}
      </button>
    </form>
  );
}

function daysAgo(iso: string, now: number, t: Dictionary) {
  const days = Math.floor((now - new Date(iso).getTime()) / (24 * 3600 * 1000));
  return days <= 0 ? t.jobs.today : t.jobs.daysAgo(days);
}

function formatDateTime(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, { timeZone: "America/Los_Angeles", hour12: false });
}
