import { answerQuestion } from "./rules";
import type { Profile } from "./profile";
import { fileStep, fromAnswer, type FillPlan, type FillStep } from "./plan";

// Lever has no API for application questions, but the apply page is server-rendered:
// standard fields are plain <li class="application-question"> blocks, and every custom
// question card carries its full definition as JSON in a hidden "baseTemplate" input.
// So the plan is built from the page HTML, before the browser opens.

interface LeverCardField {
  type: "multiple-choice" | "multiple-select" | "dropdown" | "text" | "textarea" | string;
  text: string;
  required: boolean;
  options?: { text: string }[];
}
interface LeverCard {
  id: string;
  text: string;
  fields: LeverCardField[];
}

/** https://jobs.lever.co/<slug>/<id>/apply (also jobs.eu.lever.co) */
export function leverApplyUrl(url: string): string {
  const m = url.match(/^(https:\/\/jobs\.(?:eu\.)?lever\.co\/[^/?#]+\/[0-9a-f-]{36})/i);
  if (!m) throw new Error(`Not a Lever job URL: ${url}`);
  return `${m[1]}/apply`;
}

export async function fetchLeverForm(url: string): Promise<string> {
  const res = await fetch(leverApplyUrl(url), { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Lever apply page ${url}: HTTP ${res.status}`);
  return res.text();
}

export function planLeverFill(html: string, url: string, profile: Profile): FillPlan {
  const steps: FillStep[] = [];
  for (const q of standardQuestions(html)) steps.push(planStandard(q, profile));
  for (const card of cards(html)) {
    card.fields.forEach((f, i) => steps.push(planCardField(`cards[${card.id}][field${i}]`, f, profile)));
  }
  steps.push(...eeoSteps(html, profile));

  const title = decode(html.match(/<h2>([^<]+)<\/h2>/)?.[1] ?? html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "");
  return {
    ats: "lever",
    url: leverApplyUrl(url),
    title: title.replace(/\s+/g, " ").trim(),
    company: url.match(/lever\.co\/([^/]+)/)?.[1] ?? "",
    ready: 'input[name="name"]',
    steps,
  };
}

interface StandardQuestion {
  name: string;
  label: string;
  required: boolean;
  tag: "input" | "select" | "textarea";
  type: string;
  options: string[];
}

/** The fixed fields (name, email, resume, links...), one per <li class="application-question">. */
export function standardQuestions(html: string): StandardQuestion[] {
  const out: StandardQuestion[] = [];
  const blocks = html.split(/<li class="application-question/).slice(1);
  for (const block of blocks) {
    if (block.startsWith(" custom-question")) continue; // handled by cards()
    const body = block.split(/<\/li>/)[0];
    const label = body.match(/class="application-label[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const field = [...body.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].find(([, , attrs]) => !/type="hidden"/.test(attrs) && /name="/.test(attrs));
    if (!field) continue; // e.g. the "Apply with LinkedIn" button
    const [, tag, attrs] = field;
    out.push({
      name: attrs.match(/name="([^"]+)"/)![1],
      label: stripTags(label).replace("✱", "").trim(),
      required: /class="required"/.test(label) || /\brequired\b/.test(attrs),
      tag: tag as StandardQuestion["tag"],
      type: attrs.match(/type="([^"]+)"/)?.[1] ?? tag,
      options: tag === "select" ? selectOptions(body) : [],
    });
  }
  return out;
}

function planStandard(q: StandardQuestion, profile: Profile): FillStep {
  const base = { id: q.name, label: q.label, required: q.required, selector: `[name="${q.name}"]` };
  if (q.type === "file") return fileStep(base, q.name === "resume", profile);
  if (q.tag === "select") return fromAnswer({ ...base, kind: "select" }, answerQuestion(q.label, profile, q.options));
  if (q.name === "location") {
    // Autocomplete: type the city, then pick a suggestion ("Springfield, CA, USA") so Lever stores a structured location
    return fromAnswer(
      { ...base, kind: "select", optionSelector: ".dropdown-results .dropdown-location", search: profile.city },
      answerQuestion(q.label, profile),
    );
  }
  return fromAnswer({ ...base, kind: q.tag === "textarea" ? "textarea" : "text" }, answerQuestion(q.label, profile));
}

export function cards(html: string): LeverCard[] {
  const out: LeverCard[] = [];
  for (const m of html.matchAll(/<input type="hidden" value="([^"]*)" name="cards\[([^\]]+)\]\[baseTemplate\]">/g)) {
    const card = JSON.parse(decode(m[1])) as LeverCard;
    out.push({ ...card, id: m[2] });
  }
  return out;
}

function planCardField(name: string, f: LeverCardField, profile: Profile): FillStep {
  const options = f.options?.map((o) => o.text);
  const base = { id: name, label: f.text, required: Boolean(f.required), selector: `[name="${name}"]` };
  switch (f.type) {
    case "multiple-choice":
      return fromAnswer({ ...base, kind: "radio" }, answerQuestion(f.text, profile, options));
    case "multiple-select":
      return fromAnswer({ ...base, kind: "checkbox" }, answerQuestion(f.text, profile, options));
    case "dropdown":
      return fromAnswer({ ...base, kind: "select" }, answerQuestion(f.text, profile, options));
    case "textarea":
      return fromAnswer({ ...base, kind: "textarea" }, answerQuestion(f.text, profile));
    default:
      return fromAnswer({ ...base, kind: "text" }, answerQuestion(f.text, profile));
  }
}

const EEO_LABELS: Record<string, string> = { gender: "Gender", race: "Race", veteran: "Veteran status", disability: "Disability status" };

/** US EEO survey at the bottom: gender/veteran/disability are <select>, race is radios. All optional. */
function eeoSteps(html: string, profile: Profile): FillStep[] {
  const steps: FillStep[] = [];
  for (const [key, label] of Object.entries(EEO_LABELS)) {
    const name = `eeo[${key}]`;
    const selector = `[name="${name}"]`;
    const select = html.match(new RegExp(`<select[^>]*name="eeo\\[${key}\\]"[^>]*>([\\s\\S]*?)</select>`));
    if (select) {
      steps.push(fromAnswer({ id: name, label, required: false, kind: "select", selector }, answerQuestion(label, profile, selectOptions(select[1]))));
      continue;
    }
    const radios = [...html.matchAll(new RegExp(`name="eeo\\[${key}\\]" value="([^"]*)"`, "g"))].map((m) => decode(m[1]));
    if (radios.length) steps.push(fromAnswer({ id: name, label, required: false, kind: "radio", selector }, answerQuestion(label, profile, radios)));
  }
  return steps;
}

function selectOptions(html: string): string[] {
  return [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)/g)].filter(([, v]) => v !== "").map(([, , text]) => decode(text).trim());
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
