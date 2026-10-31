// i18n: both dictionaries have the same keys, and the English UI has no Chinese left in it.
// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { DICTIONARIES, isLocale, LOCALES } from "../src/i18n/dictionaries";
import { sourceBadge } from "../src/lib/source-settings";

const CJK = /[　-〿一-鿿＀-￯]/;

/** Flatten a dictionary into [path, text]; functions are called with sample arguments. */
function strings(obj: unknown, prefix = ""): [string, string][] {
  if (typeof obj === "string") return [[prefix, obj]];
  if (typeof obj === "function") return [[prefix, String(obj("X", 3, 3, 3, 3))]];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => strings(v, prefix ? `${prefix}.${k}` : k));
}

test("zh and en dictionaries have exactly the same keys", () => {
  const keys = (l: (typeof LOCALES)[number]) => strings(DICTIONARIES[l]).map(([k]) => k).sort();
  assert.deepEqual(keys("en"), keys("zh"));
});

test("no empty strings, and the English UI contains no Chinese", () => {
  for (const locale of LOCALES) {
    for (const [key, text] of strings(DICTIONARIES[locale])) assert.ok(text.trim(), `${locale}.${key} is empty`);
  }
  for (const [key, text] of strings(DICTIONARIES.en)) assert.doesNotMatch(text, CJK, `en.${key}: ${text}`);
});

test("jobs added by hand use the translated label", () => {
  const empty = { direct: [], disabled: [], workarounds: [] };
  assert.equal(sourceBadge("manual", empty, DICTIONARIES.en.jobs.manualSource).label, "Added manually");
});

test("isLocale only accepts supported languages", () => {
  assert.equal(isLocale("zh"), true);
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("fr"), false);
  assert.equal(isLocale(undefined), false);
});
