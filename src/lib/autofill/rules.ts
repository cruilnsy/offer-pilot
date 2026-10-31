import { isUnknown, type Profile } from "./profile";

// Layer 2 of autofill: match common questions by their label text and answer from the profile.
// Open-ended questions ("Why us?") have no rule on purpose; they stay blank until the
// LLM-prepared answers exist.

type Pattern = string | RegExp;

/** What we want to answer: free text for inputs, ordered preferences for dropdowns */
interface Desired {
  text: string;
  prefer: Pattern[];
}

type Rule = [RegExp, (p: Profile) => Desired | string];

const yes: Pattern[] = [/^yes\b/i];
const no: Pattern[] = [/^no\b/i];
const DECLINE: Pattern[] = [/decline/i, /don'?t wish/i, /do not wish/i, /prefer not/i, /choose not/i, /not to (answer|disclose|say)/i, /(do not|don'?t) want to answer/i];

const yesNo = (v: boolean): Desired => ({ text: v ? "Yes" : "No", prefer: v ? yes : no });
const eeo = (v: string): Desired | string => (v === "decline" ? { text: "", prefer: DECLINE } : v);

// Order matters: the first matching rule wins, so specific labels come first.
const RULES: Rule[] = [
  [/preferred (first )?name/i, (p) => p.preferredName],
  [/pronunciation/i, () => ""], // optional, nothing sensible to auto-fill
  [/^(full |legal )?name$|full (legal )?name|^your name/i, (p) => `${p.firstName} ${p.lastName}`],
  [/^first name|^given name|^legal first name/i, (p) => p.firstName],
  [/^last name|surname|family name|^legal last name/i, (p) => p.lastName],
  [/^e-?mail/i, (p) => p.email],
  [/^phone|phone number|mobile/i, (p) => p.phone],
  [/linkedin/i, (p) => p.linkedin],
  [/github/i, (p) => p.github],
  [/portfolio|personal (web)?site|^website/i, (p) => p.portfolio],
  [/current (company|employer)|most recent (company|employer)/i, (p) => p.currentCompany],
  [/current (job )?title|most recent (job )?title/i, (p) => p.currentTitle],
  [/pronoun/i, (p) => p.pronouns],
  [/sponsor/i, (p) => yesNo(p.needsSponsorship)],
  [/\b18 years (of age|old)|\bage of 18\b/i, () => yesNo(true)],
  [/authori[sz]ed to work|eligible to work|right to work|legally (able|permitted) to work/i, (p) => yesNo(p.workAuthorizedUS)],
  // "Are you local to or willing to relocate?" depends on where the job is, so the user answers it
  [/\blocal to\b/i, () => "TODO(confirm): depends on the job location"],
  [/relocat/i, (p) => yesNo(p.willingToRelocate)],
  [/salary|compensation (expectation|requirement)|pay (expectation|range)|expected (pay|compensation)/i, (p) => p.salaryExpectation],
  [/start date|when can you start|available to start|earliest start|notice period/i, (p) => p.startDate],
  [
    /previously (been )?(employed|worked)|(worked|been employed) (at|for|with) .* before|former employee/i,
    () => ({ text: "No", prefer: [...no, /have not|never|not previously/i] }),
  ],
  [/hispanic|latino/i, (p) => eeo(p.eeo.hispanic)],
  [/gender/i, (p) => eeo(p.eeo.gender)],
  [/race|ethnicity/i, (p) => eeo(p.eeo.race)],
  [/veteran/i, (p) => eeo(p.eeo.veteran)],
  [/disabilit/i, (p) => eeo(p.eeo.disability)],
  [/(state|province).*(reside|live|located)|^which (u\.?s\.? )?state|^state$/i, (p) => p.state],
  [
    /time ?zone/i,
    (p) => ({
      text: /country/i.test(p.timeZone) ? p.timeZone : `${p.country}, ${p.timeZone}`,
      prefer: [p.timeZone, /pacific|\bPT\b|PST|PDT/i, /UTC ?-0?[78]\b|GMT ?-0?[78]\b/i],
    }),
  ],
  [/zip|postal code/i, (p) => p.zip],
  [/^country/i, (p) => p.country],
  [/which (office|location).*\bappl(y|ying)\b/i, (p) => ({ text: p.city, prefer: [p.city, /remote/i] })],
  [/^city|^location|current location|where are you (currently )?(located|based)/i, (p) => (isUnknown(p.city) ? "" : `${p.city}, ${p.state}`)],
  [
    /how did you (first )?(hear|learn|find)|where did you (hear|learn|find)|how did you come across/i,
    (p) => ({ text: p.heardFrom, prefer: [p.heardFrom, /company (web)?site|careers? (page|site)/i, /job board/i, /linkedin/i, /^other/i] }),
  ],
  [/^(how many )?(total )?years of (professional |software |relevant |industry )?experience/i, (p) => p.yearsOfExperience],
];

// Follow-ups ("If yes, what type of sponsorship?") and questions about other programs
// contain keywords like "sponsorship" or "start" but must not get the main answer.
const NOT_FOR_US = /^\(?(optional\)?\s*)?if\b|fellowship|internship/i;

export type Answer =
  | { status: "fill"; value: string; rule: string }
  | { status: "unknown"; reason: string };

/**
 * Answer one question. `options` is set for dropdowns; the answer is then one of the options.
 * Returns null when no rule matches the label.
 */
export function answerQuestion(label: string, profile: Profile, options?: string[]): Answer | null {
  const clean = label.replace(/\s+/g, " ").replace(/\*$/, "").trim();
  if (NOT_FOR_US.test(clean)) return null;
  const rule = RULES.find(([re]) => re.test(clean));
  if (!rule) return null;

  const raw = rule[1](profile);
  const desired: Desired = typeof raw === "string" ? { text: raw, prefer: [raw] } : raw;
  const ruleName = rule[0].source;

  if (options) {
    if (desired.prefer.every((p) => typeof p === "string" && isUnknown(p))) {
      return { status: "unknown", reason: "profile value needs confirmation" };
    }
    const picked = pickOption(options, desired.prefer);
    return picked ? { status: "fill", value: picked, rule: ruleName } : { status: "unknown", reason: `no option matches "${desired.text}"` };
  }
  if (isUnknown(desired.text)) return { status: "unknown", reason: "profile value needs confirmation" };
  return { status: "fill", value: desired.text, rule: ruleName };
}

/** First option matching the earliest preference. Strings match exactly, then as a prefix (case-insensitive). */
export function pickOption(options: string[], prefer: Pattern[]): string | null {
  for (const p of prefer) {
    if (typeof p === "string") {
      if (isUnknown(p)) continue;
      const want = p.trim().toLowerCase();
      const hit = options.find((o) => o.trim().toLowerCase() === want) ?? options.find((o) => o.trim().toLowerCase().startsWith(want));
      if (hit) return hit;
    } else {
      const hit = options.find((o) => p.test(o.trim()));
      if (hit) return hit;
    }
  }
  return null;
}
