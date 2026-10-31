import fs from "node:fs";
import path from "node:path";

// Personal data used to fill application forms.
// The real file lives in data/profile.json (git-ignored); data/profile.example.json shows the shape.
// Any value containing "TODO", such as a half-filled URL, is treated as unknown: the field is left blank and highlighted.

export interface Profile {
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  city: string;
  state: string; // full name, e.g. "California"
  country: string;
  zip: string;
  timeZone: string; // e.g. "Pacific Time (PT)"
  linkedin: string;
  github: string;
  portfolio: string;
  currentCompany: string;
  currentTitle: string;
  yearsOfExperience: string;
  pronouns: string;
  workAuthorizedUS: boolean;
  needsSponsorship: boolean;
  willingToRelocate: boolean;
  salaryExpectation: string;
  startDate: string;
  heardFrom: string; // preferred answer to "How did you hear about us?"
  /** EEO answers; "decline" picks the "don't wish to answer" option */
  eeo: { gender: string; race: string; hispanic: string; veteran: string; disability: string };
  resumePath: string; // absolute path to the resume PDF
}

export const PROFILE_PATH = path.join(process.cwd(), "data", "profile.json");

export function isUnknown(value: string | null | undefined): boolean {
  return !value || value.trim() === "" || /\bTODO\b/.test(value);
}

export function loadProfile(file = PROFILE_PATH): Profile {
  if (!fs.existsSync(file)) {
    throw new Error(`Profile not found: ${file}. Copy data/profile.example.json to data/profile.json and fill it in.`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Profile;
}
