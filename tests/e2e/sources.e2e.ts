// End-to-end: the Sources page and the theme toggle in real Chrome, on temporary files.
// Run: pnpm build && pnpm test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { seedDemo } from "../../src/db/demo";

const PORT = 3212;
const BASE = `http://localhost:${PORT}`;

let server: ChildProcess;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let dir: string;

const readJson = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "offer-pilot-e2e-"));
  const dbPath = path.join(dir, "jobs.db");
  const sqlite = new Database(dbPath);
  seedDemo(sqlite);
  sqlite.close();
  fs.writeFileSync(path.join(dir, "companies.json"), JSON.stringify([{ name: "Acme", ats: "first-ats", slug: "acme" }]));
  // No sources.json: the tests start as a new user

  server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
    env: { ...process.env, OFFER_PILOT_DB: dbPath, OFFER_PILOT_DATA_DIR: dir, OFFER_PILOT_DEMO: "" },
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; ; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) break;
    assert.ok(i < 60, "server did not start; run pnpm build first");
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ channel: "chrome" });
  context = await browser.newContext({ colorScheme: "dark" });
  page = await context.newPage();
});

after(async () => {
  await browser?.close();
  if (server?.pid) process.kill(-server.pid);
});

const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("the theme follows the system until the user picks, then stays across pages and reloads", async () => {
  await page.goto(BASE);
  assert.equal(await isDark(), true);
  const toggle = page.getByRole("button", { name: "Switch light / dark theme" });
  await toggle.click();
  assert.equal(await isDark(), false);
  assert.equal(await background(), "rgb(255, 255, 255)");

  await page.getByRole("navigation").getByRole("link", { name: "Data" }).click();
  await page.waitForURL(`${BASE}/boards/data`);
  assert.equal(await isDark(), false);
  await page.reload();
  assert.equal(await isDark(), false);

  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await toggle.click();
  assert.equal(await isDark(), true);
  await page.reload();
  assert.equal(await isDark(), true);
  assert.notEqual(await background(), "rgb(255, 255, 255)");
  await page.emulateMedia({ colorScheme: "dark" });
});

test("the theme button sits to the left of the language buttons", async () => {
  const theme = await page.getByRole("button", { name: "Switch light / dark theme" }).boundingBox();
  const language = await page.getByRole("button", { name: "中文" }).boundingBox();
  assert.ok(theme && language && theme.x + theme.width <= language.x);
});

async function addSource(label: string, id: string) {
  await page.locator("summary", { hasText: "Add source" }).click();
  await page.getByLabel("Name", { exact: true }).locator("visible=true").fill(label);
  await page.getByLabel("Connector id", { exact: true }).fill(id);
  await page.locator("form").filter({ hasText: "Save source" }).getByLabel("URL", { exact: true }).fill("https://example.com/source");
  await page.getByRole("button", { name: "Save source" }).click();
  await page.getByRole("switch", { name: label }).waitFor();
}

test("a new user starts with no sources and adds their own", async () => {
  await page.goto(BASE);
  await page.getByText("No sources yet").waitFor();
  await page.getByText("No manual sources yet").waitFor();
  assert.equal(await page.getByRole("switch").count(), 0);

  await addSource("First ATS", "first-ats");
  await page.reload();
  await addSource("Second ATS", "second-ats");
  assert.deepEqual(readJson("sources.json").direct.map((s: { id: string }) => s.id), ["first-ats", "second-ats"]);
  await page.getByText("No connector").first().waitFor();
});

test("a direct source can be removed, and its companies come back with it", async () => {
  await page.reload();
  await page.getByRole("button", { name: "Remove First ATS" }).click();
  await page.getByRole("switch", { name: "First ATS" }).waitFor({ state: "detached" });
  assert.deepEqual(readJson("sources.json").direct.map((s: { id: string }) => s.id), ["second-ats"]);
  assert.equal(readJson("companies.json").length, 1);
  await page.reload();
  await addSource("First ATS", "first-ats");
  await page.locator("summary", { hasText: "1 company" }).waitFor();
});

test("a source can be turned off and back on", async () => {
  await page.goto(BASE);
  const firstSource = page.getByRole("switch", { name: "First ATS" });
  assert.equal(await firstSource.getAttribute("aria-checked"), "true");
  await firstSource.click();
  await page.waitForFunction(() => document.querySelector('[role=switch][aria-label="First ATS"]')?.getAttribute("aria-checked") === "false");
  assert.deepEqual(readJson("sources.json").disabled, ["first-ats"]);
  await page.reload();
  await page.getByRole("switch", { name: "First ATS" }).click();
  await page.waitForFunction(() => document.querySelector('[role=switch][aria-label="First ATS"]')?.getAttribute("aria-checked") === "true");
  assert.deepEqual(readJson("sources.json").disabled, []);
});

test("companies can be added and removed", async () => {
  await page.locator("summary", { hasText: "Second ATS" }).click();
  await page.getByLabel("Second ATS: Company name").fill("Globex");
  await page.getByLabel("Second ATS: slug").fill("globex");
  await page.getByLabel("Second ATS: slug").press("Enter");
  await page.getByRole("button", { name: "Remove Globex" }).waitFor();
  assert.ok(readJson("companies.json").some((c: { slug: string }) => c.slug === "globex"));
  await page.getByRole("button", { name: "Remove Globex" }).click();
  await page.getByRole("button", { name: "Remove Globex" }).waitFor({ state: "detached" });
  assert.deepEqual(readJson("companies.json").map((c: { slug: string }) => c.slug), ["acme"]);
});

test("workaround sources can be added, edited and deleted", async () => {
  await page.getByRole("button", { name: "+ Add source" }).click();
  await page.getByLabel("Site", { exact: true }).fill("My Board");
  await page.getByLabel("URL", { exact: true }).locator("visible=true").fill("https://example.com/jobs");
  await page.getByLabel("Plan", { exact: true }).fill("Check every Monday");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "My Board" });
  await row.getByRole("link", { name: "My Board" }).waitFor();
  assert.equal(await row.getByRole("link", { name: "My Board" }).getAttribute("href"), "https://example.com/jobs");

  await page.getByRole("button", { name: "Edit My Board" }).click();
  await page.locator("select[name=status]").selectOption("using");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await row.getByText("Using").waitFor();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete My Board" }).click();
  await row.waitFor({ state: "detached" });
  await page.reload();
  assert.equal(await page.getByRole("link", { name: "My Board" }).count(), 0);
});
