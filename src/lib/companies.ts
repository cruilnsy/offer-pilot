import fs from "node:fs";
import path from "node:path";
import { demoCompanies } from "@/db/demo";
import type { Company } from "./ats/types";
import { DEMO } from "./demo";

// Local files the user owns. OFFER_PILOT_DATA_DIR points elsewhere for tests.
// turbopackIgnore: builds must not scan data/, which holds private files and a live Chrome profile
export const DATA_DIR = process.env.OFFER_PILOT_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data");

// The real list lives in data/companies.json (git-ignored); data/companies.example.json shows the shape.
export const COMPANIES_PATH = path.join(/*turbopackIgnore: true*/ DATA_DIR, "companies.json");

/** Companies to fetch, or none yet: a fresh clone has no list. The demo never reads local files. */
export function loadCompanies(file = COMPANIES_PATH): Company[] {
  if (DEMO) return demoCompanies();
  // turbopackIgnore: these are the user's files, never part of a build
  return fs.existsSync(/*turbopackIgnore: true*/ file) ? (JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as Company[]) : [];
}

/** Write through a temp file, so a crash cannot leave half a list. */
export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ `${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(/*turbopackIgnore: true*/ `${file}.tmp`, file);
}

export function addCompany(company: Company, file = COMPANIES_PATH) {
  const list = loadCompanies(file);
  if (list.some((c) => c.ats === company.ats && c.slug === company.slug)) return;
  writeJson(file, [...list, company]);
}

export function removeCompany(ats: Company["ats"], slug: string, file = COMPANIES_PATH) {
  writeJson(file, loadCompanies(file).filter((c) => !(c.ats === ats && c.slug === slug)));
}
