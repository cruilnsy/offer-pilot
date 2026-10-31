// Browser test: runs a fill plan against a local Greenhouse-like page in headless Chrome.
// Run: pnpm test:browser (needs Google Chrome installed)
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { fillPage } from "../src/lib/autofill/runner";
import type { FillPlan } from "../src/lib/autofill/plan";

let browser: Browser;
let page: Page;
const resume = path.join(os.tmpdir(), "offer-pilot-test-resume.pdf");

before(async () => {
  fs.writeFileSync(resume, "%PDF-1.4 test");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(__dirname, "fixtures", "greenhouse-like-form.html")).href);
});

after(async () => {
  await browser?.close();
  fs.rmSync(resume, { force: true });
});

const plan: FillPlan = {
  ats: "greenhouse",
  url: "file://test",
  title: "Test",
  company: "Test",
  ready: "#first_name",
  steps: [
    { id: "first_name", label: "First Name", required: true, kind: "text", status: "fill", value: "Jane", why: "test" },
    { id: "email", label: "Email", required: true, kind: "text", status: "fill", value: "jane@example.com", why: "test" },
    { id: "resume", label: "Resume", required: true, kind: "file", status: "fill", value: resume, why: "test" },
    { id: "question_1", label: "Sponsorship", required: true, kind: "select", status: "fill", value: "No", why: "test" },
    { id: "4028768003", label: "Gender", required: false, kind: "select", status: "fill", value: "I prefer not to say", why: "test" },
    { id: "question_pronouns", label: "Pronouns", required: true, kind: "select", status: "manual", why: "needs confirmation" },
    { id: "country", label: "Country", required: false, kind: "select", status: "fill", value: "United States", why: "test" },
    { id: "native", label: "State", required: true, kind: "select", status: "fill", value: "California", why: "test" },
    { id: "question_missing", label: "Not on page", required: false, kind: "text", status: "fill", value: "x", why: "test", optionalOnPage: true },
    { id: "email_typo", label: "Bad option", required: true, kind: "select", status: "fill", value: "Maybe", why: "test" },
  ],
};

test("fillPage fills text, file, react-select and native select fields", async () => {
  const results = await fillPage(page, plan);
  const outcome = (id: string) => results.find((r) => r.id === id)?.outcome;

  assert.equal(await page.inputValue("#first_name"), "Jane");
  assert.equal(await page.inputValue("#email"), "jane@example.com");
  assert.equal(await page.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name), path.basename(resume));
  assert.equal(await page.getAttribute("#question_1", "data-selected"), "No");
  assert.equal(await page.getAttribute('[id="4028768003"]', "data-selected"), "I prefer not to say");
  assert.equal(await page.inputValue("#native"), "California");
  assert.equal(await page.getAttribute("#country", "data-selected"), "United States +1"); // whole-word prefix fallback

  assert.equal(outcome("question_pronouns"), "highlighted");
  assert.equal(outcome("question_missing"), "missing");
  assert.equal(outcome("email_typo"), "missing"); // no element with that id
});

test("manual fields are highlighted for the user", async () => {
  const cls = await page.getAttribute("#question_pronouns", "class");
  assert.match(cls ?? "", /offer-pilot-needs-you/);
  assert.equal(await page.getAttribute("#question_pronouns", "data-selected"), null);
});

test("an option that does not exist fails and is highlighted, not guessed", async () => {
  const [r] = await fillPage(page, { ...plan, steps: [{ id: "question_1", label: "Sponsorship", required: true, kind: "select", status: "fill", value: "Maybe", why: "test" }] });
  assert.equal(r.outcome, "failed");
  assert.match((await page.getAttribute("#question_1", "class")) ?? "", /offer-pilot-needs-you/);
});

test("the form is never submitted", async () => {
  assert.equal(await page.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted), false);
});
