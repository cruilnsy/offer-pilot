// Fill an application form in real Chrome, then stop for the user to review and submit.
//   pnpm autofill <job id | apply URL>            open Chrome and fill
//   pnpm autofill <job id | apply URL> --dry-run  only print the fill plan
// The script never clicks submit.
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { classifyApplyUrl } from "../src/lib/autofill/classify";
import { fetchAshbyPosting, planAshbyFill } from "../src/lib/autofill/ashby";
import { fetchGreenhouseQuestions, planGreenhouseFill } from "../src/lib/autofill/greenhouse";
import { fetchLeverForm, planLeverFill } from "../src/lib/autofill/lever";
import { summarize, type FillPlan } from "../src/lib/autofill/plan";
import { loadProfile } from "../src/lib/autofill/profile";
import { ChromeBusyError, fillPage, openChromeTab } from "../src/lib/autofill/runner";
import { writeStatus, type AutofillResult } from "../src/lib/autofill/status";

// Set when the web app started this run, to show the result on the button
const report = (result: AutofillResult) => writeStatus(process.env.OFFER_PILOT_AUTOFILL_STATUS, result);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("Usage: pnpm autofill <job id | application URL> [--dry-run]");
  process.exit(1);
}

interface Target {
  url: string;
  /** Set when we can build a fill plan for this job */
  ats?: { name: "greenhouse" | "lever" | "ashby"; slug: string; jobId: string };
}

const URL_PATTERNS: [RegExp, "greenhouse" | "lever" | "ashby"][] = [
  [/greenhouse\.io\/([^/]+)\/jobs\/(\d+)/, "greenhouse"],
  [/jobs\.(?:eu\.)?lever\.co\/([^/]+)\/([0-9a-f-]{36})/i, "lever"],
  [/jobs\.ashbyhq\.com\/([^/]+)\/([0-9a-f-]{36})/i, "ashby"],
];

function resolveTarget(arg: string): Target {
  if (/^https?:\/\//.test(arg)) {
    for (const [re, name] of URL_PATTERNS) {
      const m = arg.match(re);
      if (m) return { url: arg, ats: { name, slug: m[1], jobId: m[2] } };
    }
    return { url: arg };
  }
  const job = db.select().from(schema.jobs).where(eq(schema.jobs.id, arg)).get();
  if (!job) throw new Error(`No such job in the database: ${arg}`);
  const url = job.applyUrl ?? job.url;
  const name = job.source === "greenhouse" || job.source === "lever" || job.source === "ashby" ? job.source : null;
  return { url, ats: name ? { name, slug: job.companySlug, jobId: job.externalId } : undefined };
}

async function buildPlan(t: Target): Promise<FillPlan | null> {
  if (!t.ats) return null;
  const { name, slug, jobId } = t.ats;
  const profile = loadProfile();
  if (name === "greenhouse") return planGreenhouseFill(await fetchGreenhouseQuestions(slug, jobId), profile);
  if (name === "ashby") return planAshbyFill(await fetchAshbyPosting(slug, jobId), slug, profile);
  const leverUrl = t.url.includes("lever.co") ? t.url : `https://jobs.lever.co/${slug}/${jobId}`;
  return planLeverFill(await fetchLeverForm(leverUrl), leverUrl, profile);
}

function printPlan(plan: FillPlan) {
  console.log(`\n${plan.company} · ${plan.title}\n${plan.url}\n`);
  const mark = { fill: "✅", manual: "🟡", skip: "⬜" } as const;
  for (const s of plan.steps) {
    const shown = s.kind === "file" && s.value ? s.value.split("/").pop() : s.value;
    console.log(`${mark[s.status]} ${s.required ? "*" : " "} ${s.label.slice(0, 60).padEnd(60)} ${s.status === "fill" ? `→ ${shown}` : `（${s.why}）`}`);
  }
  const { fill, manual, skip } = summarize(plan);
  console.log(`\nAuto-fill ${fill} · for you to fill ${manual} (highlighted) · skipped ${skip} (optional)`);
}

async function main() {
  const t = resolveTarget(target!);
  const cls = classifyApplyUrl(t.url);

  // The posting may be gone or the form unreadable: the page itself can still be opened
  const plan = await buildPlan(t).catch((err: Error) => {
    console.log(`Could not read the form (${err.message}); only opening the page.`);
    return null;
  });
  if (plan) printPlan(plan);
  else if (cls.kind === "login") {
    console.log(`This is ${cls.ats}, which needs a login or an account first. The tool never creates accounts: sign in and fill the form yourself.`);
  } else if (cls.kind === "direct") {
    console.log(`Could not find a job id in this ${cls.ats} link; only opening the page.`);
  } else {
    console.log("Unknown job site; only opening the page.");
  }
  const counts = plan ? summarize(plan) : null;
  const done: AutofillResult = counts ? { state: "filled", filled: counts.fill, manual: counts.manual } : { state: cls.kind === "login" ? "login" : "opened" };
  if (dryRun) return report(done);

  const { page, release } = await openChromeTab();
  await page.goto(plan?.url ?? t.url, { waitUntil: "domcontentloaded" });

  if (plan) {
    await page.locator(plan.ready).waitFor({ timeout: 20_000 });
    const results = await fillPage(page, plan);
    const failed = results.filter((r) => r.outcome === "failed" || (r.outcome === "missing" && r.detail));
    for (const r of failed) console.log(`⚠️  ${r.label}：${r.detail}`);
    console.log("\nDone. Check the highlighted fields in Chrome, **submit the form yourself**, then mark the job as Applied in Offer Pilot.");
  }
  report(done);
  await release();
  console.log("Chrome stays open for you. Close the tab whenever you are done; nothing is waiting on it.");
}

main().catch((err) => {
  console.error(err);
  report({ state: err instanceof ChromeBusyError ? "busy" : "failed" });
  process.exit(1);
});
