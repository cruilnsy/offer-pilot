// Local files: the company list template, a missing list, and autofill run results.
// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { waitForStatus, writeStatus } from "../src/lib/autofill/status";
import { loadCompanies } from "../src/lib/companies";

test("the template lists a company on a sample source", () => {
  const sources = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "sources.example.json"), "utf8"));
  const companies = loadCompanies(path.join(__dirname, "..", "data", "companies.example.json"));
  assert.ok(companies.length > 0);
  for (const c of companies) {
    assert.ok(c.name && c.slug);
    assert.ok(sources.direct.some((s: { id: string }) => s.id === c.ats), c.ats);
  }
});

test("no list yet means no companies", () => {
  assert.deepEqual(loadCompanies(path.join(__dirname, "no-such-file.json")), []);
});

test("an autofill run's result reaches the web app once, and a slow run times out", async () => {
  const file = path.join(os.tmpdir(), `offer-pilot-status-test-${process.pid}.json`);
  writeStatus(undefined, { state: "failed" });
  setTimeout(() => writeStatus(file, { state: "filled", filled: 15, manual: 4 }), 50);
  assert.deepEqual(await waitForStatus(file, 2000, 10), { state: "filled", filled: 15, manual: 4 });
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(await waitForStatus(file, 30, 10), { state: "timeout" });
});
