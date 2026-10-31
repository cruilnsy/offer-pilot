import { Suspense } from "react";
import { atsFetchers, boardFetchers } from "@/lib/ats";
import type { Company } from "@/lib/ats/types";
import { getLocale } from "@/i18n/locale";
import { DICTIONARIES, type Dictionary, type Locale } from "@/i18n/dictionaries";
import Link from "next/link";
import { listBoards } from "@/lib/board-store";
import { getSourceStats } from "@/lib/source-stats";
import { DEMO } from "@/lib/demo";
import { localText, loadSourceSettings } from "@/lib/source-settings";
import { badgeFor, type DirectSourceEntry } from "@/lib/sources";
import { addSource, addTrackedCompany, removeSource, removeTrackedCompany, toggleSource } from "./actions";
import { WorkaroundTable } from "./workaround-table";

export async function generateMetadata() {
  const t = DICTIONARIES[await getLocale()];
  return { title: t.meta.sources };
}

export default function SourcesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<p className="text-neutral-500">…</p>}>
        <SourcesContent />
      </Suspense>
    </main>
  );
}

async function SourcesContent() {
  const locale = await getLocale();
  const t = DICTIONARIES[locale];
  const s = t.sources;
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{s.title}</h1>
        <p className="text-sm text-neutral-500">{s.subtitle}</p>
      </header>

      {listBoards().length === 0 && (
        <section className="mb-8 rounded-lg bg-blue-50 p-5 dark:bg-blue-950">
          <h2 className="font-semibold">{t.boards.welcomeTitle}</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t.boards.welcomeText}</p>
          <Link href="/boards/new" className="mt-3 inline-block rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
            {t.nav.newBoard}
          </Link>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">{s.directTitle}</h2>
        <Suspense fallback={<p className="text-neutral-500">{t.loading}</p>}>
          <DirectSourcesTable t={t} locale={locale} />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">{s.workaroundTitle}</h2>
        <p className="mb-3 text-sm text-neutral-500">{s.workaroundNote}</p>
        <WorkaroundTable
          rows={loadSourceSettings().workarounds.map((w) => ({ ...w, kind: localText(w.kind, locale), plan: localText(w.plan, locale) }))}
          t={{ ...s.workaround, colSite: s.colSite, colKind: s.colKind, colStatus: s.colStatus, colPlan: s.colPlan }}
          readOnly={DEMO}
        />
      </section>
    </>
  );
}

async function DirectSourcesTable({ t, locale }: { t: Dictionary; locale: Locale }) {
  const { companies, companyCount, openMatches, lastStats, lastErrors } = await getSourceStats();
  const { direct: sources, disabled } = loadSourceSettings();
  const s = t.sources;
  const atsSources = sources.filter((src) => src.kind === "ats");
  const addForm = !DEMO && <AddSourceForm s={s} />;

  if (sources.length === 0) {
    return (
      <>
        <p className="text-sm text-neutral-500">{s.directEmpty}</p>
        {addForm}
      </>
    );
  }

  return (
    <>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
          <tr>
            <th className="py-2 pr-4 font-normal">{s.colEnabled}</th>
            <th className="py-2 pr-4 font-normal">{s.colSource}</th>
            <th className="py-2 pr-4 font-normal">{s.colKind}</th>
            <th className="py-2 pr-4 font-normal">{s.colHow}</th>
            <th className="py-2 pr-4 text-right font-normal">{s.colCompanies}</th>
            <th className="py-2 pr-4 text-right font-normal">{s.colLastFetched}</th>
            <th className="py-2 text-right font-normal">{s.colOpenMatches}</th>
            {!DEMO && <th className="py-2 font-normal" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {sources.map((src) => {
            const key = src.id;
            const stat = lastStats[key];
            const off = disabled.includes(key);
            const connected = key in atsFetchers || key in boardFetchers;
            return (
              <tr key={key} className={off ? "opacity-50" : undefined}>
                <td className="py-2 pr-4">
                  <SourceSwitch source={key} label={src.label} on={!off} hint={s.toggleHint} />
                </td>
                <td className="py-2 pr-4">
                  <a href={src.url} target="_blank" rel="noreferrer" className={`rounded px-1.5 py-0.5 text-xs ring-1 ring-inset ${badgeFor(key)}`}>
                    {src.label}
                  </a>
                  {!DEMO && !connected && <span className="ml-2 whitespace-nowrap text-xs text-amber-700 dark:text-amber-300">{s.noConnector}</span>}
                </td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">{s.kind[src.kind]}</td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">{localText(src.how, locale)}</td>
                <td className="py-2 pr-4 text-right">{src.kind === "ats" ? (companyCount[key] ?? 0) : "—"}</td>
                <td className="py-2 pr-4 text-right">
                  {stat ? s.jobsCount(stat.jobs) : "—"}
                  {stat?.errors ? <span className="ml-1 text-red-600">{s.failedCount(stat.errors)}</span> : null}
                </td>
                <td className="py-2 text-right font-medium">{openMatches[key] ?? 0}</td>
                {!DEMO && (
                  <td className="py-2 pl-3 text-right">
                    <form action={removeSource}>
                      <input type="hidden" name="source" value={key} />
                      <button aria-label={`${s.companies.remove} ${src.label}`} title={s.companies.remove} className="px-1 text-neutral-400 hover:text-red-600">
                        ×
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {addForm}
      {lastErrors.length > 0 && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">{s.lastErrors}</p>
          <ul className="mt-1 list-disc pl-5">
            {lastErrors.map((e) => (
              <li key={e.source}>
                {e.source}: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {atsSources.length > 0 && (
        <>
          <h3 className="mb-1 mt-6 font-semibold">{s.companies.title}</h3>
          <p className="mb-2 text-sm text-neutral-500">{s.companies.note}</p>
          <div className="space-y-1">
            {atsSources.map((src) => (
              <CompanyList key={src.id} source={src} names={companies.filter((c) => c.ats === src.id)} s={s} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SourceSwitch({ source, label, on, hint }: { source: string; label: string; on: boolean; hint: string }) {
  return (
    <form action={toggleSource}>
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="enabled" value={String(!on)} />
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        title={DEMO ? undefined : hint}
        disabled={DEMO}
        className={`relative block h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed ${on ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-700"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </form>
  );
}

const INPUT = "rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700";

function AddSourceForm({ s }: { s: Dictionary["sources"] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-blue-700 dark:text-blue-300">+ {s.addDirect}</summary>
      <form action={addSource} className="mt-2 grid gap-2 rounded-lg bg-neutral-50 p-3 sm:grid-cols-2 dark:bg-neutral-900">
        <label className="text-xs text-neutral-500">
          {s.direct.label}
          <input name="label" required maxLength={60} className={`w-full ${INPUT}`} />
        </label>
        <label className="text-xs text-neutral-500">
          {s.direct.id}
          <input name="source" required maxLength={40} pattern="[a-z0-9\-]+" title={s.direct.idHint} placeholder="my-source" className={`w-full ${INPUT}`} />
        </label>
        <label className="text-xs text-neutral-500">
          URL
          <input name="url" type="url" required maxLength={300} placeholder="https://" className={`w-full ${INPUT}`} />
        </label>
        <label className="text-xs text-neutral-500">
          {s.colKind}
          <select name="kind" className={`w-full ${INPUT} dark:bg-neutral-900`}>
            <option value="ats">{s.kind.ats}</option>
            <option value="board">{s.kind.board}</option>
          </select>
        </label>
        <label className="text-xs text-neutral-500 sm:col-span-2">
          {s.colHow}
          <input name="how" maxLength={200} className={`w-full ${INPUT}`} />
        </label>
        <p className="text-xs text-neutral-500 sm:col-span-2">{s.direct.idHint}</p>
        <div>
          <button className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700">{s.direct.save}</button>
        </div>
      </form>
    </details>
  );
}

function CompanyList({ source, names, s }: { source: DirectSourceEntry; names: Company[]; s: Dictionary["sources"] }) {
  const ats = source.id;
  return (
    <details className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
      <summary className="cursor-pointer text-sm">
        {source.label} <span className="text-neutral-500">· {s.companies.count(names.length)}</span>
      </summary>
      {names.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {names.map((c) => (
            <li key={c.slug} className="flex items-center gap-1 rounded bg-white px-2 text-sm ring-1 ring-inset ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700">
              {c.name}
              {!DEMO && (
                <form action={removeTrackedCompany}>
                  <input type="hidden" name="source" value={ats} />
                  <input type="hidden" name="slug" value={c.slug} />
                  <button aria-label={`${s.companies.remove} ${c.name}`} className="px-1 text-neutral-400 hover:text-red-600">
                    ×
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {!DEMO && (
        <form action={addTrackedCompany} className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="source" value={ats} />
          <input name="name" required maxLength={80} aria-label={`${source.label}: ${s.companies.name}`} placeholder={s.companies.name} className="w-40 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700" />
          <input name="slug" required maxLength={200} aria-label={`${source.label}: slug`} placeholder="slug" className="w-48 rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700" />
          <button className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">{s.companies.add}</button>
        </form>
      )}
    </details>
  );
}
