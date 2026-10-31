// Unit tests for autofill: URL classification, question rules, and the Greenhouse fill plan.
// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { classifyApplyUrl } from "../src/lib/autofill/classify";
import { answerQuestion, pickOption } from "../src/lib/autofill/rules";
import { planGreenhouseFill, type GhJobWithQuestions } from "../src/lib/autofill/greenhouse";
import type { Profile } from "../src/lib/autofill/profile";

const profile: Profile = {
  ...JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "profile.example.json"), "utf8")),
  resumePath: "/tmp/resume.pdf",
};

test("classifyApplyUrl: direct-fill ATS", () => {
  assert.deepEqual(classifyApplyUrl("https://job-boards.greenhouse.io/globex/jobs/8032173003"), { kind: "direct", ats: "greenhouse" });
  assert.deepEqual(classifyApplyUrl("https://boards.greenhouse.io/wonka/jobs/1"), { kind: "direct", ats: "greenhouse" });
  assert.deepEqual(classifyApplyUrl("https://jobs.lever.co/acme/abc-123/apply"), { kind: "direct", ats: "lever" });
  assert.deepEqual(classifyApplyUrl("https://jobs.ashbyhq.com/acme/uuid/application"), { kind: "direct", ats: "ashby" });
  assert.deepEqual(classifyApplyUrl("https://www.acme.example/careers/positions/8285182?gh_jid=8285182"), { kind: "direct", ats: "greenhouse" });
});

test("classifyApplyUrl: login-first ATS and unknown sites", () => {
  assert.deepEqual(classifyApplyUrl("https://humana.wd5.myworkdayjobs.com/en-US/Humana_External_Career_Site/job/R-1"), { kind: "login", ats: "workday" });
  assert.deepEqual(classifyApplyUrl("https://careers-acme.icims.com/jobs/1/job"), { kind: "login", ats: "icims" });
  assert.deepEqual(classifyApplyUrl("https://acme.jibeapply.com/jobs/33575"), { kind: "manual", ats: null });
  assert.deepEqual(classifyApplyUrl("not a url"), { kind: "manual", ats: null });
  // look-alike host must not match
  assert.equal(classifyApplyUrl("https://greenhouse.io.evil.com/jobs/1").kind, "manual");
});

test("answerQuestion: text fields from profile", () => {
  assert.equal(value("First Name"), "Jane");
  assert.equal(value("Last Name*"), "Doe");
  assert.equal(value("Preferred Name"), "Jane");
  assert.equal(value("Current Company"), "ABC");
  assert.equal(value("Email"), "jane@example.com");
});

test("answerQuestion: TODO values are never filled", () => {
  assert.equal(answerQuestion("Desired salary", profile)?.status, "unknown");
  assert.equal(answerQuestion("Pronouns", profile, ["He/him/his", "She/her/hers", "I prefer not to say"])?.status, "unknown");
  assert.equal(answerQuestion("Portfolio", profile)?.status, "unknown");
  // A template URL still holding its TODO must never reach a real form
  assert.equal(answerQuestion("LinkedIn Profile", profile)?.status, "unknown");
  assert.equal(answerQuestion("GitHub", profile)?.status, "unknown");
});

test("answerQuestion: yes/no questions", () => {
  const yn = ["Yes", "No"];
  assert.equal(value("Do you require immigration sponsorship to work for Globex in the United States?", yn), "No");
  assert.equal(value("Will you require immigration sponsorship at any point in the future?", yn), "No");
  assert.equal(value("Are you legally authorized to work in the United States?", yn), "Yes");
  assert.equal(value("Are you willing to relocate?", yn), "No");
});

test("answerQuestion: dropdowns with non yes/no wording", () => {
  assert.equal(
    value("Have you previously been employed at Globex for any length of time?", [
      "I have not previously been employed at Globex",
      "I have been employed at Globex as a full-time employee",
    ]),
    "I have not previously been employed at Globex",
  );
  assert.equal(value("How did you first learn about Globex as an employer?", ["Globex blog", "Globex’s Career Site", "LinkedIn", "Other"]), "Globex’s Career Site");
  assert.equal(value("How did you hear about us?", ["Referral", "LinkedIn", "Other"]), "LinkedIn");
  assert.equal(value("Which U.S. State or Canadian Province do you reside in?", ["Arizona", "California", "Colorado"]), "California");
});

test("answerQuestion: time zone", () => {
  assert.equal(value("What time zone are you located in?"), "United States, Pacific Time (PT)");
  assert.equal(value("What time zone are you in?", ["Eastern (ET)", "Pacific (PT)"]), "Pacific (PT)");
});

test("answerQuestion: EEO defaults to decline", () => {
  assert.equal(value("Gender", ["Decline To Self Identify", "Female", "Male"]), "Decline To Self Identify");
  assert.equal(value("VeteranStatus", ["I don't wish to answer", "I am not a protected veteran"]), "I don't wish to answer");
  assert.equal(value("How do you identify? (race/ethnicity)", ["East Asian", "White", "I prefer not to say"]), "I prefer not to say");
  assert.equal(value("Are you Hispanic/Latino?", ["Yes", "No", "Decline To Self Identify"]), "Decline To Self Identify");
});

test("answerQuestion: open questions have no rule", () => {
  assert.equal(answerQuestion("Why do you want to work at Globex?", profile), null);
  assert.equal(answerQuestion("Twitter", profile), null);
});

test("pickOption: exact match beats prefix match", () => {
  assert.equal(pickOption(["No - but later", "No"], ["No"]), "No");
  assert.equal(pickOption(["California (CA)"], ["California"]), "California (CA)");
  assert.equal(pickOption(["A", "B"], ["C"]), null);
});

test("planGreenhouseFill: a real form", () => {
  const job = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "greenhouse-questions.json"), "utf8")) as GhJobWithQuestions;
  const plan = planGreenhouseFill(job, profile);
  const step = (id: string) => plan.steps.find((s) => s.id === id);

  assert.equal(plan.url, "https://job-boards.greenhouse.io/globex/jobs/8032173003");
  assert.equal(step("first_name")?.value, "Jane");
  assert.equal(step("resume")?.status, "fill");
  assert.equal(step("resume")?.kind, "file");
  assert.equal(step("cover_letter")?.status, "skip");
  assert.equal(step("question_33128970003")?.value, "No"); // sponsorship now
  assert.equal(step("question_33128971003")?.value, "No"); // sponsorship later
  assert.equal(step("question_33128972003")?.value, "California");
  assert.equal(step("question_33128978003")?.value, "I have not previously been employed at Globex");
  assert.equal(step("question_33128969003")?.status, "manual"); // pronouns: required, TODO in profile
  assert.equal(step("veteran_status")?.value, "I don't wish to answer");
  assert.equal(step("4028768003")?.value, "I prefer not to say");
  assert.equal(step("question_33128975003")?.status, "skip"); // Twitter: optional, no rule
  // the "paste resume text" textarea is not a separate step
  assert.equal(step("resume_text"), undefined);
  // every required step is either filled or flagged for the user
  for (const s of plan.steps.filter((s) => s.required)) assert.notEqual(s.status, "skip", s.label);
});

function value(label: string, options?: string[]) {
  const a = answerQuestion(label, profile, options);
  assert.ok(a, `no rule for "${label}"`);
  assert.equal(a.status, "fill", `"${label}" → ${JSON.stringify(a)}`);
  return a.status === "fill" ? a.value : null;
}
