// Unit tests for the Lever and Ashby fill plans, built from real pages with the company details replaced.
// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { answerQuestion } from "../src/lib/autofill/rules";
import { leverApplyUrl, planLeverFill, standardQuestions } from "../src/lib/autofill/lever";
import { planAshbyFill, type AshbyPosting } from "../src/lib/autofill/ashby";
import type { FillPlan } from "../src/lib/autofill/plan";
import type { Profile } from "../src/lib/autofill/profile";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const profile: Profile = {
  ...JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "profile.example.json"), "utf8")),
  resumePath: "/tmp/resume.pdf",
};
const stepOf = (plan: FillPlan) => (label: RegExp) => {
  const s = plan.steps.find((x) => label.test(x.label));
  assert.ok(s, `no step for ${label}`);
  return s;
};

test("rules: names, follow-ups and location questions", () => {
  const fill = (label: string, options?: string[]) => {
    const a = answerQuestion(label, profile, options);
    return a?.status === "fill" ? a.value : a?.status;
  };
  assert.equal(fill("Full name"), "Jane Doe");
  assert.equal(fill("Name"), "Jane Doe");
  assert.equal(fill("Please state your full legal name:"), "Jane Doe");
  assert.equal(fill("Legal Name"), "Jane Doe");
  assert.equal(fill("Preferred Name"), "Jane"); // still the preferred-name rule
  assert.equal(fill("Are you at least 18 years of age?", ["Yes", "No"]), "Yes");
  assert.equal(fill("At the time of applying, are you 18 years of age or older?", ["Yes", "No"]), "Yes");
  // follow-ups must not inherit the main answer
  assert.equal(answerQuestion("If yes, what type of sponsorship?", profile), null);
  assert.equal(answerQuestion("(Optional) If you selected other or would like to expand on the above", profile), null);
  assert.equal(answerQuestion("When are you available to start your fellowship?", profile), null);
  // "local to" depends on the job, so it goes to the user even though "relocate" has a rule
  assert.equal(fill("Are you local to or willing to relocate?", ["Yes", "No"]), "unknown");
  assert.equal(fill("Are you willing to relocate?", ["Yes", "No"]), "No");
  assert.equal(fill("Where are you currently located?"), "San Francisco, California");
  assert.equal(fill("Which location are you applying for?", ["New York, NY", "San Francisco, California"]), "San Francisco, California");
  assert.equal(fill("Disability status", ["Yes, I have a disability", "No, I do not have a disability", "I do not want to answer"]), "I do not want to answer");
});

test("leverApplyUrl: posting and apply links", () => {
  const id = "3b4ee7c2-7daf-48b2-bfb2-bdb6ebdcd515";
  assert.equal(leverApplyUrl(`https://jobs.lever.co/initech/${id}`), `https://jobs.lever.co/initech/${id}/apply`);
  assert.equal(leverApplyUrl(`https://jobs.lever.co/initech/${id}/apply?lever-source=x`), `https://jobs.lever.co/initech/${id}/apply`);
  assert.equal(leverApplyUrl(`https://jobs.eu.lever.co/acme/${id}`), `https://jobs.eu.lever.co/acme/${id}/apply`);
  assert.throws(() => leverApplyUrl("https://example.com/jobs/1"));
});

test("Lever: standard fields are parsed from the page", () => {
  const qs = standardQuestions(fixture("lever-apply.html"));
  const byName = Object.fromEntries(qs.map((q) => [q.name, q]));
  assert.equal(byName.name.label, "Full name");
  assert.equal(byName.name.required, true);
  assert.equal(byName.resume.type, "file");
  assert.equal(byName.resume.required, true);
  assert.equal(byName.org.label, "Current company");
  assert.deepEqual(byName.opportunityLocationId.options, ["Springfield, California", "San Mateo, California"]);
  assert.ok(byName["urls[GitHub]"]);
  assert.equal(qs.some((q) => q.name.startsWith("cards[")), false);
});

test("Lever: plan from a real form", () => {
  const url = "https://jobs.lever.co/initech/3b4ee7c2-7daf-48b2-bfb2-bdb6ebdcd515";
  const plan = planLeverFill(fixture("lever-apply.html"), url, profile);
  const step = stepOf(plan);

  assert.equal(plan.url, `${url}/apply`);
  assert.equal(plan.company, "initech");
  assert.match(plan.title, /Senior Engineer, Full-Stack/);
  assert.equal(step(/^Full name$/).value, "Jane Doe");
  assert.equal(step(/^Full name$/).selector, '[name="name"]');
  assert.equal(step(/^Resume/).kind, "file");
  assert.equal(step(/^Resume/).status, "fill");
  assert.equal(step(/^Current location/).search, "San Francisco"); // type the city, pick "San Francisco, CA, USA"

  const auth = step(/authorized to work/);
  assert.equal(auth.kind, "radio");
  assert.equal(auth.value, "Yes");
  assert.match(auth.selector!, /^\[name="cards\[115d9079-[^\]]+\]\[field0\]"\]$/);
  assert.equal(step(/require sponsorship/).value, "No");
  assert.equal(step(/what type of sponsorship/).status, "skip"); // follow-up, optional
  assert.equal(step(/full legal name/).value, "Jane Doe");
  assert.equal(step(/local to or willing to relocate/).status, "manual");
  assert.equal(step(/local to or willing to relocate/).kind, "select");
  assert.equal(step(/office\(s\) would you be willing/).kind, "checkbox");
  assert.equal(step(/transitioning service member/).status, "manual");

  assert.equal(step(/^Gender$/).value, "Decline to self-identify");
  assert.equal(step(/^Race$/).kind, "radio");
  assert.equal(step(/^Race$/).value, "Decline to self-identify");
  assert.equal(step(/^Veteran status$/).value, "I decline to self-identify for protected veteran status");
  assert.equal(step(/^Disability status$/).value, "I do not want to answer");

  for (const s of plan.steps.filter((s) => s.required)) assert.notEqual(s.status, "skip", s.label);
});

test("Ashby: plan from a real form", () => {
  const posting = JSON.parse(fixture("ashby-posting.json")) as AshbyPosting;
  const plan = planAshbyFill(posting, "hooli", profile);
  const step = stepOf(plan);

  assert.equal(plan.url, `https://jobs.ashbyhq.com/hooli/${posting.id}/application`);
  assert.equal(plan.ready, "#_systemfield_name");
  assert.equal(step(/^Name$/).value, "Jane Doe");
  assert.equal(step(/^Name$/).selector, '[data-field-path="_systemfield_name"] input');
  assert.equal(step(/^Resume$/).selector, '[data-field-path="_systemfield_resume"] input[type=file]');
  assert.equal(step(/^Resume$/).status, "fill");
  assert.equal(step(/currently located/).kind, "select");
  assert.equal(step(/currently located/).optionSelector, "[role=listbox] [role=option]");
  assert.equal(step(/start a new role/).status, "manual"); // date picker

  const sponsor = step(/require sponsorship/);
  assert.equal(sponsor.kind, "radio"); // yes/no buttons
  assert.equal(sponsor.value, "No");
  assert.equal(sponsor.selector, '[data-field-path="8077b143-e659-471e-9476-cc47d0924c0b"]');
  assert.equal(step(/years of industry experience/).value, "10");
  assert.equal(step(/Arbitration Agreement/).status, "manual"); // legal acknowledgements: the user ticks them
  assert.equal(step(/Arbitration Agreement/).kind, "checkbox");

  assert.equal(step(/^Gender$/).value, "Decline to self-identify");
  assert.equal(step(/^Race$/).value, "Decline to self-identify");
  assert.equal(step(/^Veteran Status$/).value, "I decline to self-identify for protected veteran status");

  for (const s of plan.steps.filter((s) => s.required)) assert.notEqual(s.status, "skip", s.label);
});
