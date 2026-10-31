import type { Locale } from "@/i18n/dictionaries";

/** Text shown in both UI languages */
export type Text = Record<Locale, string>;

export const WORKAROUND_STATUSES = ["planned", "using", "skipped"] as const;
export type WorkaroundStatus = (typeof WORKAROUND_STATUSES)[number];

/** A source the user added. `id` picks the connector that fetches it (see src/lib/ats/index.ts). */
export interface DirectSourceEntry {
  id: string;
  label: string;
  kind: "ats" | "board"; // an ATS is fetched per company, a job board all at once
  url: string;
  how: string | Text;
}

const BADGES = [
  "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "bg-sky-50 text-sky-700 ring-sky-200",
  "bg-violet-50 text-violet-700 ring-violet-200",
  "bg-teal-50 text-teal-700 ring-teal-200",
  "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "bg-yellow-50 text-yellow-700 ring-yellow-200",
  "bg-orange-50 text-orange-700 ring-orange-200",
  "bg-rose-50 text-rose-700 ring-rose-200",
  "bg-lime-50 text-lime-700 ring-lime-200",
];

/** Each source keeps one color without anyone having to pick it. */
export function badgeFor(id: string): string {
  const hash = [...id].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 1009, 7);
  return BADGES[hash % BADGES.length];
}

export const MANUAL_BADGE = "bg-amber-50 text-amber-700 ring-amber-200";
