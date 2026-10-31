// Demo mode: sample data is complete and fictional, the real database is never touched, and actions are read-only.
// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jobMatcher } from "../src/lib/filter";

const realDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "offer-pilot-")), "must-not-exist", "jobs.db");
process.env.OFFER_PILOT_DEMO = "1";
process.env.OFFER_PILOT_DB = realDb;

test("demo mode serves sample data without creating a database file", async () => {
  const { db, schema } = await import("../src/db");
  const rows = db.select().from(schema.jobs).all();
  assert.ok(rows.length >= 12);
  assert.equal(new Set(rows.map((j) => j.id)).size, rows.length);
  assert.equal(db.select().from(schema.fetchRuns).all().length, 1);
  assert.equal(fs.existsSync(path.dirname(realDb)), false);
});

test("sample data shows every part of the UI and links nowhere real", async () => {
  const { db, schema } = await import("../src/db");
  const rows = db.select().from(schema.jobs).all();
  const boards = db.select().from(schema.boards).all();
  assert.deepEqual(boards.map((b) => b.name), ["AI", "Data"]);
  for (const board of boards) assert.ok(rows.filter(jobMatcher(board)).length >= 3, board.name);
  assert.equal(rows.some((j) => /front.?end/i.test(j.title)), false);
  for (const status of ["new", "applied", "interviewing", "skipped"]) assert.ok(rows.some((j) => j.status === status), status);
  assert.ok(rows.some((j) => j.closedAt));
  const keys = rows.map((j) => j.dedupeKey);
  assert.ok(new Set(keys).size < keys.length, "at least one job appears on two sources");
  for (const j of rows) assert.match(j.url, /^https:\/\/example\.com\//);
});

test("the demo shows the fictional sources from the sample file", async () => {
  const { db, schema } = await import("../src/db");
  const { loadSourceSettings, sourceBadge } = await import("../src/lib/source-settings");
  const settings = loadSourceSettings();
  assert.deepEqual(settings.direct.map((s) => s.label), ["Acme ATS", "Globex Jobs", "Initech Careers"]);
  assert.equal(settings.workarounds.length, 3);
  const ids = settings.direct.map((s) => s.id);
  for (const j of db.select().from(schema.jobs).all()) assert.ok(ids.includes(j.source), j.source);
  assert.equal(sourceBadge("mock-jobs", settings, "Manual").label, "Globex Jobs");
});

test("the demo never reads the user's local company list or settings", async () => {
  const { loadCompanies } = await import("../src/lib/companies");
  const { loadSourceSettings } = await import("../src/lib/source-settings");
  const local = path.join(path.dirname(path.dirname(realDb)), "local.json");
  fs.writeFileSync(local, JSON.stringify([{ name: "Real Company", ats: "source-a", slug: "real" }]));
  assert.ok(loadCompanies(local).length > 5);
  assert.equal(loadCompanies(local).some((c) => c.name === "Real Company"), false);
  fs.writeFileSync(local, JSON.stringify({ disabled: ["source-a"], workarounds: [] }));
  assert.equal(loadSourceSettings(local).workarounds.length, 3);
});

test("posting dates follow the clock, so the demo never goes stale", async () => {
  const { demoJobs } = await import("../src/db/demo");
  const later = Date.UTC(2031, 0, 1);
  const ages = demoJobs(later).map((j) => (later - new Date(j.postedAt!).getTime()) / 86_400_000);
  assert.ok(Math.max(...ages) < 100);
});

test("server actions refuse to write or start autofill, but previews work", async () => {
  const actions = await import("../src/app/actions");
  const { previewBoard, removeBoard, saveBoard, setJobStatus, startAutofill } = actions;
  const { db, schema } = await import("../src/db");
  const job = db.select().from(schema.jobs).all()[0];
  const form = new FormData();
  form.set("id", job.id);
  form.set("status", "skipped");
  await assert.rejects(setJobStatus(form), /read-only/i);
  await assert.rejects(startAutofill(form), /read-only/i);
  await assert.rejects(saveBoard(null, "Mine", { include: ["react"] }), /read-only/i);
  await assert.rejects(removeBoard(1), /read-only/i);
  for (const action of [actions.toggleSource, actions.addSource, actions.removeSource, actions.addTrackedCompany, actions.removeTrackedCompany, actions.saveWorkaroundSource, actions.removeWorkaround]) {
    await assert.rejects(action(form), /read-only/i);
  }
  assert.equal(db.select().from(schema.boards).all().length, 2);
  assert.ok((await previewBoard({ include: ["data engineer"], remoteUS: true })).count >= 1);
  assert.equal(db.select().from(schema.jobs).all()[0].status, job.status);
});
