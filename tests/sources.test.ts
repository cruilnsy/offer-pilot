// The Sources page settings: on/off, tracked companies and workaround sources, stored in local files.
// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addCompany, loadCompanies, removeCompany } from "../src/lib/companies";
import { activeSources, deleteWorkaround, loadSourceSettings, localText, removeDirectSource, saveDirectSource, saveWorkaround, setSourceEnabled, sourceBadge } from "../src/lib/source-settings";
import { badgeFor, type DirectSourceEntry } from "../src/lib/sources";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offer-pilot-sources-"));
const file = (name: string) => path.join(dir, name);
const source = (id: string): DirectSourceEntry => ({ id, label: id.toUpperCase(), kind: "ats", url: "https://example.com", how: "Sample" });
const input = { label: "My Board", url: "https://example.com", kind: "Job board", plan: "Check weekly", status: "using" as const };

test("a new install has no sources of any kind", () => {
  assert.deepEqual(loadSourceSettings(file("none.json")), { direct: [], disabled: [], workarounds: [] });
  assert.deepEqual(activeSources(loadSourceSettings(file("none.json"))), []);
});

test("direct sources are saved once per id, and removing one clears its switch", () => {
  const f = file("direct.json");
  saveDirectSource(source("one"), f);
  saveDirectSource({ ...source("one"), label: "Renamed" }, f);
  saveDirectSource(source("two"), f);
  setSourceEnabled("one", false, f);
  assert.deepEqual(activeSources(loadSourceSettings(f)), ["two"]);
  assert.equal(loadSourceSettings(f).direct.find((s) => s.id === "one")?.label, "Renamed");
  removeDirectSource("one", f);
  assert.deepEqual(loadSourceSettings(f).direct.map((s) => s.id), ["two"]);
  assert.deepEqual(loadSourceSettings(f).disabled, []);
});

test("badges come from the user's file, and a removed source still shows its id", () => {
  const settings = { direct: [source("one")], disabled: [], workarounds: [] };
  assert.equal(sourceBadge("one", settings, "Manual").label, "ONE");
  assert.equal(sourceBadge("gone", settings, "Manual").label, "gone");
  assert.equal(badgeFor("one"), badgeFor("one"));
  assert.notEqual(new Set(["a", "b", "c", "d", "e", "f"].map(badgeFor)).size, 1);
});

test("the sample file holds three fictional direct and workaround sources", () => {
  const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "sources.example.json"), "utf8"));
  assert.equal(sample.direct.length, 3);
  assert.equal(sample.workarounds.length, 3);
  for (const s of [...sample.direct, ...sample.workarounds]) assert.match(s.url, /^https:\/\/example\.com\//);
});

test("sources turn off and on without duplicates", () => {
  const f = file("toggle.json");
  setSourceEnabled("source-a", false, f);
  setSourceEnabled("source-a", false, f);
  assert.deepEqual(loadSourceSettings(f).disabled, ["source-a"]);
  setSourceEnabled("source-a", true, f);
  assert.deepEqual(loadSourceSettings(f).disabled, []);
});

test("workarounds can be added, edited and deleted, and same names get different ids", () => {
  const f = file("workarounds.json");
  saveWorkaround(null, input, "en", f);
  saveWorkaround(null, input, "en", f);
  const added = loadSourceSettings(f).workarounds.filter((w) => w.label === "My Board");
  assert.deepEqual(added.map((w) => w.id), ["my-board", "my-board-2"]);
  saveWorkaround("my-board", { ...input, status: "skipped" }, "en", f);
  assert.equal(loadSourceSettings(f).workarounds.find((w) => w.id === "my-board")?.status, "skipped");
  deleteWorkaround("my-board", f);
  assert.equal(loadSourceSettings(f).workarounds.some((w) => w.id === "my-board"), false);
});

test("text saved in both languages is kept unless it changed", () => {
  const f = file("languages.json");
  fs.writeFileSync(f, JSON.stringify({ workarounds: [{ id: "a", label: "A", url: "https://example.com", status: "planned", kind: { zh: "招聘网站", en: "Job board" }, plan: { zh: "计划", en: "Plan" } }] }));
  const row = () => loadSourceSettings(f).workarounds[0];
  const base = { label: "A", url: "https://example.com", status: "using" as const, kind: "Job board", plan: "Plan" };
  saveWorkaround("a", base, "en", f);
  assert.deepEqual(row().kind, { zh: "招聘网站", en: "Job board" });
  saveWorkaround("a", { ...base, plan: "My own plan" }, "en", f);
  assert.equal(localText(row().plan, "zh"), "My own plan");
  assert.deepEqual(row().kind, { zh: "招聘网站", en: "Job board" });
});

test("companies are added once, removed by ATS and slug, and keep extra fields", () => {
  const f = file("companies.json");
  fs.writeFileSync(f, JSON.stringify([{ name: "Acme", ats: "source-a", slug: "acme", note: "mine" }]));
  addCompany({ name: "Acme again", ats: "source-a", slug: "acme" }, f);
  addCompany({ name: "Acme", ats: "source-b", slug: "acme" }, f);
  assert.equal(loadCompanies(f).length, 2);
  assert.equal((loadCompanies(f)[0] as unknown as { note: string }).note, "mine");
  removeCompany("source-b", "acme", f);
  assert.deepEqual(loadCompanies(f).map((c) => c.ats), ["source-a"]);
  assert.equal(fs.existsSync(`${f}.tmp`), false);
});
