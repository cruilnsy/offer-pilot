import { spawn } from "node:child_process";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { DATA_DIR } from "../companies";
import type { FillPlan, FillStep, StepResult } from "./plan";

// Executes a fill plan on an open page. It NEVER clicks a submit button:
// the user reviews the form and submits it themselves.

export const CHROME_PROFILE_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "chrome-profile");

// Chrome runs on its own, not as a child of this script: a run fills the form and exits, and the
// window stays open for the user with nothing waiting on it. Later runs reach it through this
// local port and add a tab.
const DEBUG_PORT = 9339;
const START_TIMEOUT_MS = 10_000;
const CONNECT_GAP_MS = 300;

const CHROME_PATHS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

/** The profile is held by a Chrome window this tool cannot reach, e.g. one opened by an older version. */
export class ChromeBusyError extends Error {}

export interface ChromeTab {
  page: Page;
  release: () => Promise<void>; // lets go of Chrome and leaves it open
}

async function connect(port: number): Promise<ChromeTab | null> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2000 }).catch(() => null);
  if (!browser) return null;
  const context = browser.contexts()[0];
  // A freshly started Chrome has one empty tab: use it instead of leaving it behind
  const page = context.pages().find((p) => /^(about:blank|chrome:\/\/new-tab-page\/?)$/.test(p.url())) ?? (await context.newPage());
  await page.bringToFront();
  return { page, release: () => browser.close() };
}

function startChrome(profileDir: string, port: number, headless: boolean) {
  const args = [`--user-data-dir=${profileDir}`, `--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check"];
  const chrome = spawn(CHROME_PATHS[process.platform] ?? "google-chrome", headless ? [...args, "--headless=new"] : args, { detached: true, stdio: "ignore" });
  const failed = new Promise<never>((_, reject) => chrome.once("error", reject));
  chrome.unref();
  return failed;
}

/**
 * A tab in real Chrome with a dedicated, persistent profile, so sign-ins survive between runs.
 * Chrome allows one window per profile: a second start would only hand over to the first, so
 * when it is open the job gets a new tab there. Call `release` when done; Chrome stays open.
 */
export async function openChromeTab(opts: { headless?: boolean; profileDir?: string; port?: number; startTimeoutMs?: number } = {}): Promise<ChromeTab> {
  const port = opts.port ?? DEBUG_PORT;
  const existing = await connect(port);
  if (existing) return existing;

  const notFound = startChrome(opts.profileDir ?? CHROME_PROFILE_DIR, port, opts.headless ?? false);
  const waitForPort = async () => {
    const deadline = Date.now() + (opts.startTimeoutMs ?? START_TIMEOUT_MS);
    while (Date.now() < deadline) {
      const tab = await connect(port);
      if (tab) return tab;
      await new Promise((r) => setTimeout(r, CONNECT_GAP_MS));
    }
    throw new ChromeBusyError("Close the Offer Pilot Chrome window and try again");
  };
  return Promise.race([waitForPort(), notFound]);
}

const HIGHLIGHT_CLASS = "offer-pilot-needs-you";

export async function fillPage(page: Page, plan: FillPlan): Promise<StepResult[]> {
  await page.addStyleTag({
    content: `.${HIGHLIGHT_CLASS}{outline:3px solid #facc15!important;outline-offset:2px;background:#fef9c3!important}`,
  });
  // Server-rendered inputs appear before React hydrates; clicks on dropdowns are lost until then
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const results: StepResult[] = [];
  for (const step of plan.steps) results.push(await runStep(page, step));
  return results;
}

async function runStep(page: Page, step: FillStep): Promise<StepResult> {
  const base = { id: step.id, label: step.label };
  // Ids can start with a digit (Greenhouse demographic questions), so use an attribute selector.
  const selector = step.selector ?? `[id="${step.id}"]`;
  const input = page.locator(selector).first();
  if ((await input.count()) === 0) {
    const detail = step.optionalOnPage || !step.required ? undefined : "required field not found on page (it may appear after another answer)";
    return { ...base, outcome: "missing", detail };
  }
  if (step.status === "skip") return { ...base, outcome: "skipped", detail: step.why };
  if (step.status === "manual") {
    await highlight(input);
    return { ...base, outcome: "highlighted", detail: step.why };
  }

  try {
    const value = step.value ?? "";
    if (step.kind === "file") await input.setInputFiles(value);
    else if (step.kind === "select") await chooseOption(page, input, step, value);
    else if (step.kind === "radio" || step.kind === "checkbox") await chooseChoice(page.locator(selector), value);
    else await input.fill(value);
    return { ...base, outcome: "filled", detail: step.kind === "file" ? path.basename(value) : value };
  } catch (err) {
    await highlight(input);
    return { ...base, outcome: "failed", detail: (err as Error).message.split("\n")[0] };
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Dropdowns: native <select>, or a combobox whose options appear after a click or typing. */
async function chooseOption(page: Page, input: Locator, step: FillStep, value: string) {
  if ((await input.evaluate((el) => el.tagName)) === "SELECT") {
    await input.selectOption({ label: value });
    return;
  }
  // Greenhouse react-select options are #react-select-<id>-option-<n>; scoping matters because
  // the phone-country list on the same page also uses role=option.
  const all = () => page.locator(step.optionSelector ?? `[id^="react-select-${step.id}-option-"]`);
  const exact = (text: string) => all().filter({ hasText: new RegExp(`^\\s*${escapeRe(text)}\\s*$`, "i") });
  // Some labels carry extras, e.g. "United States +1"; accept a whole-word prefix only as a fallback
  const prefix = (text: string) => all().filter({ hasText: new RegExp(`^\\s*${escapeRe(text)}\\b`, "i") });
  await input.click();
  if ((await exact(value).count()) === 0) {
    await input.pressSequentially((step.search ?? value).slice(0, 40), { delay: 10 });
    await all().first().waitFor({ timeout: 5_000 }).catch(() => {});
  }
  const candidates = [exact(value), prefix(value), ...(step.search ? [prefix(step.search)] : [])];
  let target = candidates[0].first();
  for (const c of candidates) {
    if ((await c.count()) > 0) {
      target = c.first();
      break;
    }
  }
  await target.waitFor({ timeout: 3_000 });
  await target.click();
}

/**
 * Radio groups, checkbox lists and yes/no buttons: pick the option whose value or label text
 * matches. `scope` is either the inputs themselves (Lever: [name=...]) or a box around them (Ashby).
 */
async function chooseChoice(scope: Locator, value: string) {
  const options = scope.locator(
    "xpath=descendant-or-self::*[self::input[@type='radio' or @type='checkbox'] or self::button[@aria-pressed or @data-option]]",
  );
  const texts = await options.evaluateAll((els) =>
    els.map((el) => {
      if (el.tagName === "BUTTON") return [el.textContent ?? ""];
      const input = el as HTMLInputElement;
      const label = input.labels?.[0] ?? input.closest("label");
      // Lever labels also hold a long description, so the first text node is the option itself
      const first = label?.querySelector("span")?.textContent ?? label?.textContent ?? "";
      return [input.getAttribute("value") ?? "", first, label?.textContent ?? ""];
    }),
  );
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const want = norm(value);
  let index = texts.findIndex((t) => t.some((x) => norm(x) === want));
  if (index < 0) index = texts.findIndex((t) => t.some((x) => new RegExp(`^${escapeRe(want)}\\b`).test(norm(x))));
  if (index < 0) throw new Error(`no option matches "${value}"`);

  const option = options.nth(index);
  if ((await option.evaluate((el) => el.tagName)) === "BUTTON") await option.click();
  else await option.check({ force: true }); // custom-styled inputs are visually hidden
}

async function highlight(input: Locator) {
  await input.evaluate((el, cls) => {
    // Custom dropdowns hide the real input, so mark its wrapper too. A question box (Ashby) is marked alone.
    el.classList.add(cls);
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.parentElement?.classList.add(cls);
  }, HIGHLIGHT_CLASS);
}
