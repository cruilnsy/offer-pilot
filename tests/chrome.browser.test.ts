// Browser test: several autofill runs share one Chrome, and a profile held by another window is reported.
// Run: pnpm test:browser (needs Google Chrome installed)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { ChromeBusyError, openChromeTab } from "../src/lib/autofill/runner";

const tempProfile = () => fs.mkdtempSync(path.join(os.tmpdir(), "offer-pilot-chrome-"));

test("a second run opens a new tab in the Chrome that is already open", async () => {
  const opts = { headless: true, profileDir: tempProfile(), port: 9341 };
  const first = await openChromeTab(opts);
  const second = await openChromeTab(opts);
  await first.page.goto("data:text/html,<title>first</title>");
  await second.page.goto("data:text/html,<title>second</title>");
  assert.equal(await first.page.title(), "first");
  assert.equal(await second.page.title(), "second");

  // Closing the second job's tab ends only that run: the first tab stays open
  await second.page.close();
  await second.closed;
  await second.release();
  assert.equal(await first.page.title(), "first");

  const third = await openChromeTab(opts);
  assert.equal(third.page.isClosed(), false);
  await third.release();
  await first.page.context().close();
  await first.closed;
});

test("a window the tool cannot reach is reported as busy, not as a crash", async () => {
  const profileDir = tempProfile();
  const holder = await chromium.launchPersistentContext(profileDir, { channel: "chrome", headless: true });
  await assert.rejects(openChromeTab({ headless: true, profileDir, port: 9342 }), ChromeBusyError);
  await holder.close();
});
