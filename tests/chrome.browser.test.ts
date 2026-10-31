// Browser test: Chrome runs on its own, runs exit and leave it open, and they share one window.
// Run: pnpm test:browser (needs Google Chrome installed)
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { ChromeBusyError, openChromeTab } from "../src/lib/autofill/runner";

const PORT = 9341;
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "offer-pilot-chrome-"));
const opts = { headless: true, profileDir, port: PORT };

/** Everything open in that Chrome, seen from outside the runs. */
async function openTabs() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const urls = browser.contexts()[0].pages().map((p) => p.url());
  await browser.close();
  return urls;
}

after(async () => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch(() => null);
  if (!browser) return;
  const session = await browser.newBrowserCDPSession();
  await session.send("Browser.close").catch(() => {});
});

test("a run leaves Chrome and its page open after the run has exited", async () => {
  const run = `
    import { openChromeTab } from "../src/lib/autofill/runner";
    (async () => {
      const { page, release } = await openChromeTab(${JSON.stringify(opts)});
      await page.goto("data:text/html,<title>first</title>");
      await release();
    })();
  `;
  const file = path.join(process.cwd(), `tests/.tmp-chrome-run-${process.pid}.ts`);
  fs.writeFileSync(file, run);
  try {
    execFileSync("pnpm", ["exec", "tsx", file], { stdio: "ignore", timeout: 30_000 });
  } finally {
    fs.rmSync(file, { force: true });
  }
  assert.deepEqual(await openTabs(), ["data:text/html,<title>first</title>"]);
});

test("the next run adds a tab, and there is no stray empty tab", async () => {
  const second = await openChromeTab(opts);
  await second.page.goto("data:text/html,<title>second</title>");
  await second.release();
  const third = await openChromeTab(opts);
  await third.page.goto("data:text/html,<title>third</title>");
  await third.release();
  assert.equal((await openTabs()).length, 3);
});

test("after every window is closed, Chrome is still running on a Mac and the next run opens a new one", async () => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await Promise.all(browser.contexts()[0].pages().map((p) => p.close()));
  await browser.close();
  const next = await openChromeTab(opts);
  await next.page.goto("data:text/html,<title>again</title>");
  assert.equal(await next.page.title(), "again");
  await next.release();
});

test("a window the tool cannot reach is reported as busy, not as a crash", async () => {
  const held = fs.mkdtempSync(path.join(os.tmpdir(), "offer-pilot-chrome-"));
  const holder = await chromium.launchPersistentContext(held, { channel: "chrome", headless: true });
  await assert.rejects(openChromeTab({ headless: true, profileDir: held, port: 9342, startTimeoutMs: 2500 }), ChromeBusyError);
  await holder.close();
});
