// End-to-end: every page fits phones and tablets, even with long names and many boards.
// Run: pnpm build && pnpm test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import { seedDemo } from "../../src/db/demo";

const PORT = 3213;
const BASE = `http://localhost:${PORT}`;
const MIN_TARGET = 36; // px, on phones

const SIZES: [string, BrowserContextOptions][] = [
  ["small phone", { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }],
  ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
  ["tablet", { viewport: { width: 768, height: 1024 } }],
  ["desktop", { viewport: { width: 1280, height: 800 } }],
];

const LONG_WORD = "Supercalifragilisticexpialidocious".repeat(2);

let server: ChildProcess;
let browser: Browser;

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offer-pilot-e2e-"));
  const dbPath = path.join(dir, "jobs.db");
  const sqlite = new Database(dbPath);
  seedDemo(sqlite);
  // The worst case: many boards, unbroken long text in names, titles and locations
  const addBoard = sqlite.prepare(`INSERT INTO boards (id, slug, name, position, include, exclude, require, remote_us, worldwide, cities) VALUES (?, ?, ?, ?, '["engineer"]', '[]', '[]', 1, 0, '[]')`);
  for (let i = 0; i < 12; i++) addBoard.run(100 + i, `extra-${i}`, `Extra board number ${i}`, 10 + i);
  addBoard.run(200, "long", LONG_WORD.slice(0, 40), 30);
  sqlite.prepare("UPDATE jobs SET title = ?, location = ?, company_name = ? WHERE company_name = 'Cyberdyne'").run(`AI Engineer ${LONG_WORD}`, `Remote - US ${LONG_WORD}`, LONG_WORD);
  sqlite.close();

  const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "sources.example.json"), "utf8"));
  sample.direct.push({ id: "long-source", label: LONG_WORD, kind: "board", url: "https://example.com", how: LONG_WORD });
  sample.workarounds.push({ id: "long-site", label: LONG_WORD, url: "https://example.com", kind: LONG_WORD, plan: LONG_WORD, status: "planned" });
  fs.writeFileSync(path.join(dir, "sources.json"), JSON.stringify(sample));
  fs.writeFileSync(path.join(dir, "companies.json"), JSON.stringify([{ name: LONG_WORD, ats: "mock-ats", slug: "long" }]));

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
});

after(async () => {
  await browser?.close();
  if (server?.pid) process.kill(-server.pid);
});

const PAGES = ["/", "/boards/ai", "/boards/ai?view=all", "/boards/long", "/boards/new", "/boards/ai/edit"];

/** Elements that stick out past the right edge of the screen, so the page can scroll sideways. */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // Inside the browser: tsx rewrites named functions in a way the page cannot run, so everything here is inline
    const scrollers = [...document.querySelectorAll("body *")].filter((e) => ["auto", "scroll"].includes(getComputedStyle(e).overflowX));
    const wide = [...document.querySelectorAll("body *")].filter(
      (e) => e.getBoundingClientRect().right > width + 1 && !e.closest("nextjs-portal") && !scrollers.some((s) => s !== e && s.contains(e)),
    );
    return { scrollWidth: document.documentElement.scrollWidth, width, wide: wide.slice(0, 4).map((e) => `${e.tagName} ${e.textContent?.slice(0, 30)}`) };
  });

for (const [name, options] of SIZES) {
  test(`no page scrolls sideways on a ${name}`, async () => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    for (const url of PAGES) {
      await page.goto(BASE + url, { waitUntil: "networkidle" });
      const { scrollWidth, width, wide } = await overflowing(page);
      assert.ok(scrollWidth <= width, `${url}: page is ${scrollWidth}px on a ${width}px screen: ${wide.join(" | ")}`);
    }
    await context.close();
  });
}

test("controls are large enough to tap on a phone", async () => {
  const context = await browser.newContext(SIZES[1][1]);
  const page = await context.newPage();
  for (const url of ["/", "/boards/ai", "/boards/new"]) {
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    const small = await page.evaluate((min) => {
      const controls = [...document.querySelectorAll("button, select, input:not([type=checkbox]):not([type=hidden]), body > nav a, summary, [role=switch]")];
      return controls
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.height < min && !e.closest("nextjs-portal");
        })
        .slice(0, 5)
        .map((e) => `${e.tagName} "${e.textContent?.slice(0, 20)}" ${Math.round(e.getBoundingClientRect().height)}px`);
    }, MIN_TARGET);
    assert.deepEqual(small, [], url);
  }
  await context.close();
});

test("control labels stay on one line on a small phone", async () => {
  const context = await browser.newContext(SIZES[0][1]);
  const page = await context.newPage();
  for (const url of ["/boards/ai", "/boards/long"]) {
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    const box = await page.getByRole("link", { name: "Edit", exact: true }).boundingBox();
    assert.ok(box && box.height < 50 && box.width > 40, `${url}: Edit is ${box?.width}x${box?.height}`);
  }
  await context.close();
});

test("inputs use 16px text on a phone, so iOS does not zoom in", async () => {
  const context = await browser.newContext(SIZES[1][1]);
  const page = await context.newPage();
  await page.goto(`${BASE}/boards/new`, { waitUntil: "networkidle" });
  const sizes = await page.$$eval("input:not([type=checkbox]):not([type=hidden])", (inputs) => inputs.map((i) => parseFloat(getComputedStyle(i).fontSize)));
  assert.ok(sizes.length > 0 && sizes.every((s) => s >= 16), sizes.join());
  await context.close();
});

test("on a phone, source tables become cards that still show every value", async () => {
  const context = await browser.newContext(SIZES[1][1]);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  assert.equal(await page.locator("thead").first().isVisible(), false);
  const card = page.locator("tbody tr").filter({ hasText: "Acme ATS" });
  for (const text of ["Companies tracked", "Last fetch", "Open & matching", "Sample source"]) await card.getByText(text).first().waitFor();
  assert.equal(await page.getByRole("switch", { name: "Acme ATS" }).isVisible(), true);
  await context.close();
});

test("on a desktop, source tables stay tables", async () => {
  const context = await browser.newContext(SIZES[3][1]);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  assert.equal(await page.locator("thead").first().isVisible(), true);
  assert.equal(await page.locator("tbody tr").first().evaluate((tr) => getComputedStyle(tr).display), "table-row");
  await context.close();
});

test("on a phone, the save button and match count stay on screen while editing", async () => {
  const context = await browser.newContext(SIZES[1][1]);
  const page = await context.newPage();
  await page.goto(`${BASE}/boards/new`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).locator("visible=true").scrollIntoViewIfNeeded();
  const save = page.getByRole("button", { name: "Save board" });
  const box = await save.boundingBox();
  const height = page.viewportSize()!.height;
  assert.ok(box && box.y >= 0 && box.y + box.height <= height, `save button at ${box?.y}, screen ${height}`);
  await page.locator("div.sticky").getByText("open jobs right now").waitFor();
  await context.close();
});

test("on a phone, many boards stay on one scrollable row", async () => {
  const context = await browser.newContext(SIZES[1][1]);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const row = page.locator("body > nav a", { hasText: "Extra board number 11" }).locator("..");
  const scrolls = await row.evaluate((e) => ({ scrolls: e.scrollWidth > e.clientWidth, height: e.getBoundingClientRect().height }));
  assert.ok(scrolls.scrolls);
  assert.ok(scrolls.height < 60, `nav row is ${scrolls.height}px tall`);
  await context.close();
});
