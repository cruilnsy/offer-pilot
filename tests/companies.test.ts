// The company list: the template is valid, and a missing list is not an error for the web app.
// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
