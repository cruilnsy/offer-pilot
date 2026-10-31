// Browser tests: fill plans against local Lever-like and Ashby-like pages in headless Chrome.
// Run: pnpm test:browser (needs Google Chrome installed)
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { fillPage } from "../src/lib/autofill/runner";
import type { FillPlan, FillStep } from "../src/lib/autofill/plan";

let browser: Browser;
const resume = path.join(os.tmpdir(), "offer-pilot-test-resume-ats.pdf");

before(async () => {
  fs.writeFileSync(resume, "%PDF-1.4 test");
  browser = await chromium.launch({ channel: "chrome", headless: true });
});

after(async () => {
  await browser?.close();
  fs.rmSync(resume, { force: true });
});

async function open(fixture: string): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(__dirname, "fixtures", fixture)).href);
  return page;
}

const plan = (ats: string, steps: FillStep[]): FillPlan => ({ ats, url: "file://test", title: "Test", company: "Test", ready: "form", steps });
const fill = (id: string, kind: FillStep["kind"], value: string, extra: Partial<FillStep> = {}): FillStep => ({
  id,
  label: id,
  required: true,
  kind,
  status: "fill",
  value,
  why: "test",
  selector: `[name="${id}"]`,
  ...extra,
});
const submitted = (page: Page) => page.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted);

test("Lever-like page: text, file, native select, radios, checkbox, location autocomplete", async () => {
  const page = await open("lever-like-form.html");
  const results = await fillPage(
    page,
    plan("lever", [
      fill("name", "text", "Jane Doe"),
      fill("resume", "file", resume),
      fill("opportunityLocationId", "select", "Springfield, California"),
      fill("location", "select", "Springfield, California", { optionSelector: ".dropdown-results .dropdown-location", search: "Springfield" }),
      fill("cards[c1][field0]", "radio", "No"),
      fill("cards[c2][field1]", "checkbox", "Springfield, California"),
      fill("eeo[race]", "radio", "Decline to self-identify"),
    ]),
  );
  assert.deepEqual(results.filter((r) => r.outcome !== "filled"), []);

  assert.equal(await page.inputValue('[name="name"]'), "Jane Doe");
  assert.equal(await page.locator('[name="resume"]').evaluate((el: HTMLInputElement) => el.files?.[0]?.name), path.basename(resume));
  assert.equal(await page.locator('[name="opportunityLocationId"]').evaluate((el: HTMLSelectElement) => el.selectedOptions[0].text), "Springfield, California");
  // typed only the city, then picked Lever's abbreviated suggestion
  assert.equal(await page.inputValue('[name="location"]'), "Springfield, CA, USA");
  assert.match(await page.inputValue("#selected-location"), /Springfield, CA, USA/);
  assert.equal(await page.isChecked('[name="cards[c1][field0]"][value="No"]'), true);
  assert.equal(await page.isChecked('[name="cards[c1][field0]"][value="Yes"]'), false);
  assert.equal(await page.isChecked('[name="cards[c2][field1]"][value="Springfield, California"]'), true);
  // the label holds a long description too; the option text still matches
  assert.equal(await page.isChecked('[name="eeo[race]"][value="Decline to self-identify"]'), true);
  assert.equal(await submitted(page), false);
  await page.close();
});

test("Lever-like page: a radio option that does not exist fails, nothing is guessed", async () => {
  const page = await open("lever-like-form.html");
  const [r] = await fillPage(page, plan("lever", [fill("cards[c1][field0]", "radio", "Maybe")]));
  assert.equal(r.outcome, "failed");
  assert.match(r.detail ?? "", /no option matches/);
  assert.equal(await page.locator('[name="cards[c1][field0]"]:checked').count(), 0);
  await page.close();
});

test("Ashby-like page: question boxes, yes/no buttons, hidden radios, combobox; manual box highlighted", async () => {
  const page = await open("ashby-like-form.html");
  const box = (p: string) => `[data-field-path="${p}"]`;
  const results = await fillPage(
    page,
    plan("ashby", [
      fill("_systemfield_name", "text", "Jane Doe", { selector: `${box("_systemfield_name")} input` }),
      fill("_systemfield_resume", "file", resume, { selector: `${box("_systemfield_resume")} input[type=file]` }),
      fill("q-sponsor", "radio", "No", { selector: box("q-sponsor") }),
      fill("q-domain", "radio", "Full Stack", { selector: box("q-domain") }),
      { id: "q-ack", label: "Acknowledgement", required: true, kind: "checkbox", status: "manual", why: "user reads and ticks", selector: box("q-ack") },
      fill("_systemfield_location", "select", "Springfield, California", {
        selector: `${box("_systemfield_location")} input[role=combobox]`,
        optionSelector: "[role=listbox] [role=option]",
        search: "Springfield",
      }),
      fill("q-missing", "text", "x", { selector: box("q-missing"), required: false }),
    ]),
  );
  const outcome = (id: string) => results.find((r) => r.id === id)?.outcome;
  for (const id of ["_systemfield_name", "_systemfield_resume", "q-sponsor", "q-domain", "_systemfield_location"]) assert.equal(outcome(id), "filled", id);
  assert.equal(outcome("q-ack"), "highlighted");
  assert.equal(outcome("q-missing"), "missing");

  assert.equal(await page.inputValue("#_systemfield_name"), "Jane Doe");
  assert.equal(await page.getAttribute('[data-option="no"]', "aria-pressed"), "true");
  assert.equal(await page.getAttribute('[data-option="yes"]', "aria-pressed"), "false");
  assert.equal(await page.isChecked("#r1"), true);
  assert.equal(await page.inputValue("[role=combobox]"), "Springfield, California, United States");
  // acknowledgement left for the user, and only its own box is marked
  assert.equal(await page.isChecked("#c0"), false);
  assert.match((await page.getAttribute(box("q-ack"), "class")) ?? "", /offer-pilot-needs-you/);
  assert.equal(await page.locator("form.offer-pilot-needs-you").count(), 0);
  assert.equal(await submitted(page), false);
  await page.close();
});
