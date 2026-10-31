// End-to-end: a new user creates, uses, edits and deletes a board in real Chrome, on a temporary database.
// Run: pnpm build && pnpm test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium, type Browser, type Page } from "playwright";
import { seedDemo } from "../../src/db/demo";

const PORT = 3211;
const BASE = `http://localhost:${PORT}`;

let server: ChildProcess;
let browser: Browser;
let page: Page;
let dbPath: string;

before(async () => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "offer-pilot-e2e-")), "jobs.db");
  const sqlite = new Database(dbPath);
  seedDemo(sqlite);
  sqlite.exec("DELETE FROM boards"); // start as a new user
  sqlite.close();

  server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
    env: { ...process.env, OFFER_PILOT_DB: dbPath, OFFER_PILOT_DATA_DIR: path.dirname(dbPath), OFFER_PILOT_DEMO: "" },
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; ; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) break;
    assert.ok(i < 60, "server did not start; run pnpm build first");
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ channel: "chrome" });
  page = await browser.newPage();
});

after(async () => {
  await browser?.close();
  if (server?.pid) process.kill(-server.pid);
});

test("a new user is guided to create a board from a template", async () => {
  await page.goto(BASE);
  await page.getByRole("heading", { name: "Create your first board" }).waitFor();
  await page.getByRole("main").getByRole("link", { name: "New board" }).click();
  await page.getByRole("heading", { name: "New board" }).waitFor();
  await page.getByText("Add a title keyword to see results").waitFor();

  await page.getByRole("button", { name: "Data", exact: true }).click();
  assert.equal(await page.getByLabel("Name", { exact: true }).locator("visible=true").inputValue(), "Data");
  await page.getByRole("complementary").getByText("2 open jobs right now").waitFor();
  await page.getByRole("complementary").getByText("Sirius Cybernetics").waitFor();
});

test("adding a location updates the preview live, and saving opens the board", async () => {
  await page.getByLabel(/Cities or regions/).fill("New York");
  await page.getByLabel(/Cities or regions/).press("Enter");
  await page.getByRole("complementary").getByText("3 open jobs right now").waitFor();

  await page.getByRole("button", { name: "Save board" }).click();
  await page.waitForURL(`${BASE}/boards/data`);
  await page.getByRole("heading", { name: "Data", exact: true }).waitFor();
  await page.getByRole("navigation").getByRole("link", { name: "Data", exact: true }).waitFor();
  await page.getByRole("listitem").filter({ hasText: "Nakatomi" }).waitFor();
});

test("marking a job applied moves it and survives a reload", async () => {
  const row = page.getByRole("listitem").filter({ hasText: "Sirius Cybernetics" });
  await row.getByRole("button", { name: "Applied", exact: true }).click();
  await row.waitFor({ state: "detached" });
  await page.reload();
  await page.getByRole("link", { name: "Applied 1" }).click();
  await page.getByRole("listitem").filter({ hasText: "Sirius Cybernetics" }).waitFor();
});

test("editing a board changes its name and rules, and keeps its link", async () => {
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(`${BASE}/boards/data/edit`);
  await page.getByLabel("Name", { exact: true }).locator("visible=true").fill("Analytics");
  await page.getByRole("button", { name: "Title has: data scientist ×" }).click();
  await page.getByRole("complementary").getByText("2 open jobs right now").waitFor();
  await page.getByRole("button", { name: "Save board" }).click();
  await page.waitForURL(`${BASE}/boards/data`);
  await page.getByRole("heading", { name: "Analytics" }).waitFor();
  await page.getByRole("navigation").getByRole("link", { name: "Analytics" }).waitFor();
});

test("old URLs redirect, unknown boards are 404, and the board UI is translated", async () => {
  await page.goto(`${BASE}/boards/new`);
  await page.getByRole("button", { name: "Frontend", exact: true }).click();
  await page.getByRole("button", { name: "Save board" }).click();
  await page.waitForURL(`${BASE}/boards/frontend`);
  await page.goto(`${BASE}/frontend`);
  assert.equal(new URL(page.url()).pathname, "/boards/frontend");
  await page.goto(`${BASE}/boards/nope`); // streamed, so the HTTP status stays 200
  await page.getByText("could not be found").waitFor();

  await page.goto(`${BASE}/boards/new`);
  await page.getByRole("button", { name: "中文" }).click();
  await page.getByRole("heading", { name: "新建 Board" }).waitFor();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("heading", { name: "New board" }).waitFor();
});

test("two boards with the same name get different links", async () => {
  await page.goto(`${BASE}/boards/new`);
  await page.getByRole("button", { name: "Frontend", exact: true }).click();
  await page.getByRole("button", { name: "Save board" }).click();
  await page.waitForURL(`${BASE}/boards/frontend-2`);
});

test("deleting a board asks first and keeps application status", async () => {
  await page.goto(`${BASE}/boards/data/edit`);
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Delete" }).click();
  assert.equal(new URL(page.url()).pathname, "/boards/data/edit");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(`${BASE}/`);
  assert.equal(await page.getByRole("navigation").getByRole("link", { name: "Analytics" }).count(), 0);

  const sqlite = new Database(dbPath, { readonly: true });
  const job = sqlite.prepare("SELECT status FROM jobs WHERE company_name = 'Sirius Cybernetics'").get() as { status: string };
  sqlite.close();
  assert.equal(job.status, "applied");
});
