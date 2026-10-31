"use client";

import { useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { WORKAROUND_STATUSES, type WorkaroundStatus } from "@/lib/sources";
import { removeWorkaround, saveWorkaroundSource } from "./actions";

export interface WorkaroundRow {
  id: string;
  label: string;
  url: string;
  kind: string;
  plan: string;
  status: WorkaroundStatus;
}

type Labels = Dictionary["sources"]["workaround"] & { colSite: string; colKind: string; colStatus: string; colPlan: string };

const STATUS_STYLE: Record<WorkaroundStatus, string> = {
  planned: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  using: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  skipped: "bg-neutral-100 text-neutral-400 line-through dark:bg-neutral-900 dark:text-neutral-500",
};

const INPUT = "w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700";

export function WorkaroundTable({ rows, t, readOnly }: { rows: WorkaroundRow[]; t: Labels; readOnly: boolean }) {
  const [editing, setEditing] = useState<string | null>(null); // a row id, or "new"
  const close = () => setEditing(null);

  return (
    <>
      {rows.length === 0 && editing !== "new" && <p className="text-sm text-neutral-500">{t.empty}</p>}
      <table className={`w-full text-left text-sm ${rows.length === 0 ? "hidden" : ""}`}>
        <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
          <tr>
            <th className="py-2 pr-4 font-normal">{t.colSite}</th>
            <th className="py-2 pr-4 font-normal">{t.colKind}</th>
            <th className="py-2 pr-4 font-normal">{t.colStatus}</th>
            <th className="py-2 pr-4 font-normal">{t.colPlan}</th>
            <th className="py-2 font-normal" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {rows.map((w) =>
            editing === w.id ? (
              <tr key={w.id}>
                <td colSpan={5} className="py-3">
                  <WorkaroundForm row={w} t={t} onDone={close} />
                </td>
              </tr>
            ) : (
              <tr key={w.id}>
                <td className="py-2 pr-4">
                  <a href={w.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {w.label}
                  </a>
                </td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">{w.kind}</td>
                <td className="py-2 pr-4">
                  <span className={`whitespace-nowrap rounded px-1.5 text-xs ${STATUS_STYLE[w.status]}`}>{t.statuses[w.status]}</span>
                </td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">{w.plan}</td>
                <td className="whitespace-nowrap py-2 text-right">
                  {!readOnly && (
                    <>
                      <button type="button" onClick={() => setEditing(w.id)} aria-label={`${t.edit} ${w.label}`} className="text-xs text-blue-700 hover:underline dark:text-blue-300">
                        {t.edit}
                      </button>
                      <form action={removeWorkaround} className="ml-3 inline" onSubmit={(e) => window.confirm(t.confirmDelete) || e.preventDefault()}>
                        <input type="hidden" name="id" value={w.id} />
                        <button aria-label={`${t.delete} ${w.label}`} className="text-xs text-red-600 hover:underline">
                          {t.delete}
                        </button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {!readOnly &&
        (editing === "new" ? (
          <div className="mt-3">
            <WorkaroundForm t={t} onDone={close} />
          </div>
        ) : (
          <button type="button" onClick={() => setEditing("new")} className="mt-3 text-sm text-blue-700 hover:underline dark:text-blue-300">
            + {t.add}
          </button>
        ))}
    </>
  );
}

function WorkaroundForm({ row, t, onDone }: { row?: WorkaroundRow; t: Labels; onDone: () => void }) {
  return (
    <form
      action={async (form) => {
        await saveWorkaroundSource(form);
        onDone();
      }}
      className="grid gap-2 rounded-lg bg-neutral-50 p-3 sm:grid-cols-2 dark:bg-neutral-900"
    >
      <input type="hidden" name="id" value={row?.id ?? ""} />
      <label className="text-xs text-neutral-500">
        {t.colSite}
        <input name="label" required maxLength={60} defaultValue={row?.label} className={INPUT} />
      </label>
      <label className="text-xs text-neutral-500">
        URL
        <input name="url" type="url" required maxLength={300} defaultValue={row?.url} placeholder="https://" className={INPUT} />
      </label>
      <label className="text-xs text-neutral-500">
        {t.colKind}
        <input name="kind" maxLength={80} defaultValue={row?.kind} className={INPUT} />
      </label>
      <label className="text-xs text-neutral-500">
        {t.colStatus}
        <select name="status" defaultValue={row?.status ?? "planned"} className={`${INPUT} dark:bg-neutral-900`}>
          {WORKAROUND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.statuses[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-neutral-500 sm:col-span-2">
        {t.colPlan}
        <input name="plan" maxLength={300} defaultValue={row?.plan} className={INPUT} />
      </label>
      <div className="flex gap-3 sm:col-span-2">
        <button className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700">{t.save}</button>
        <button type="button" onClick={onDone} className="text-sm text-neutral-500 hover:underline">
          {t.cancel}
        </button>
      </div>
    </form>
  );
}
