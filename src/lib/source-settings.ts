import fs from "node:fs";
import path from "node:path";
import type { Locale } from "@/i18n/dictionaries";
import { slugify } from "./ats/text";
import sample from "../../data/sources.example.json";
import { DATA_DIR, writeJson } from "./companies";
import { DEMO } from "./demo";
import { badgeFor, MANUAL_BADGE, type DirectSourceEntry, type Text, type WorkaroundStatus } from "./sources";

// Each user's own sources, in data/sources.json (git-ignored). A new install starts with none;
// data/sources.example.json shows the shape and is what the demo displays.
export const SETTINGS_PATH = path.join(DATA_DIR, "sources.json");

export interface WorkaroundSource {
  id: string;
  label: string;
  url: string;
  kind: string | Text; // plain text, or one text per UI language
  plan: string | Text;
  status: WorkaroundStatus;
}

export interface SourceSettings {
  direct: DirectSourceEntry[];
  disabled: string[]; // ids that are added, but switched off
  workarounds: WorkaroundSource[];
}

const EMPTY: SourceSettings = { direct: [], disabled: [], workarounds: [] };

const DEMO_SETTINGS = sample as SourceSettings;

export function loadSourceSettings(file = SETTINGS_PATH): SourceSettings {
  if (DEMO) return DEMO_SETTINGS;
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) return EMPTY;
  return { ...EMPTY, ...(JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as Partial<SourceSettings>) };
}

/** Ids of the sources that the next fetch should use. */
export function activeSources(settings: SourceSettings): string[] {
  return settings.direct.map((s) => s.id).filter((id) => !settings.disabled.includes(id));
}

/** Add a source, or replace the one with this id. */
export function saveDirectSource(entry: DirectSourceEntry, file = SETTINGS_PATH) {
  const settings = loadSourceSettings(file);
  writeJson(file, { ...settings, direct: [...settings.direct.filter((s) => s.id !== entry.id), entry] });
}

/** Tracked companies stay in the company list, so adding the source back restores them. */
export function removeDirectSource(id: string, file = SETTINGS_PATH) {
  const settings = loadSourceSettings(file);
  writeJson(file, { ...settings, direct: settings.direct.filter((s) => s.id !== id), disabled: settings.disabled.filter((s) => s !== id) });
}

/** How a source appears on job rows. `manualLabel` is the localized name for jobs added by hand. */
export function sourceBadge(id: string, settings: SourceSettings, manualLabel: string): { label: string; badge: string } {
  if (id === "manual") return { label: manualLabel, badge: MANUAL_BADGE };
  return { label: settings.direct.find((s) => s.id === id)?.label ?? id, badge: badgeFor(id) };
}

export function setSourceEnabled(source: string, enabled: boolean, file = SETTINGS_PATH) {
  const settings = loadSourceSettings(file);
  const others = settings.disabled.filter((s) => s !== source);
  writeJson(file, { ...settings, disabled: enabled ? others : [...others, source] });
}

export const localText = (text: string | Text, locale: Locale) => (typeof text === "string" ? text : text[locale]);

export type WorkaroundInput = Pick<WorkaroundSource, "label" | "url" | "status"> & { kind: string; plan: string };

/** Add a source, or update the one with this id. Text the user left alone keeps both languages. */
export function saveWorkaround(id: string | null, input: WorkaroundInput, locale: Locale, file = SETTINGS_PATH) {
  const settings = loadSourceSettings(file);
  const old = settings.workarounds.find((w) => w.id === id);
  const keep = (before: string | Text | undefined, value: string) => (before !== undefined && localText(before, locale) === value ? before : value);
  const taken = new Set(settings.workarounds.map((w) => w.id));
  let newId = slugify(input.label);
  for (let n = 2; taken.has(newId); n++) newId = `${slugify(input.label)}-${n}`;
  const saved: WorkaroundSource = { ...input, id: old?.id ?? newId, kind: keep(old?.kind, input.kind), plan: keep(old?.plan, input.plan) };
  const workarounds = old ? settings.workarounds.map((w) => (w === old ? saved : w)) : [...settings.workarounds, saved];
  writeJson(file, { ...settings, workarounds });
}

export function deleteWorkaround(id: string, file = SETTINGS_PATH) {
  const settings = loadSourceSettings(file);
  writeJson(file, { ...settings, workarounds: settings.workarounds.filter((w) => w.id !== id) });
}
