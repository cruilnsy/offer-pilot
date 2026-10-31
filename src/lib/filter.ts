import type { NormalizedJob } from "./ats/types";

// A board's rules, set by the user on the board form. Keywords are plain words or phrases:
// case and punctuation do not matter, plurals match, and a trailing * matches a prefix ("recruit*").
export interface BoardRules {
  include: string[]; // the title has at least one of these
  exclude: string[]; // the title has none of these
  require: string[]; // when set, the title must also have one of these
  remoteUS: boolean;
  worldwide: boolean;
  cities: string[]; // words in the job location, e.g. a city, state or country
}

type FilterInput = Pick<NormalizedJob, "title" | "location" | "country" | "isRemote">;

const MAX_KEYWORDS = 100;
const MAX_KEYWORD_LENGTH = 60;

/** Lowercase, punctuation to spaces, and one spelling for "front end", "front-end" and "frontend". */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ") // "Product & Engineering" is not "product engineering"
    .replace(/[^\p{L}\p{N}+#.*]+/gu, " ")
    .replace(/\.(?=\s|$)/g, "")
    .replace(/\b(front|back) end\b/g, "$1end")
    .replace(/\bfull stack\b/g, "fullstack")
    .replace(/\bgen ai\b/g, "genai")
    .trim();
}

function keywordPattern(keyword: string): string {
  const word = normalize(keyword);
  const prefix = word.endsWith("*");
  const body = (prefix ? word.slice(0, -1) : word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return prefix ? `${body}[\\p{L}\\p{N}]*` : `${body}s?`;
}

/** One regex for a keyword list, or null when the list is empty. */
function compile(keywords: string[]): RegExp | null {
  const patterns = keywords.filter((k) => normalize(k).replace("*", "")).map(keywordPattern);
  return patterns.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${patterns.join("|")})(?![\\p{L}\\p{N}])`, "u") : null;
}

const US_WORDS = /united states|\busa\b|u\.s\.|north america|americas|new york|san francisco|seattle|austin|denver|boston|chicago/i;
// State codes and "US" match uppercase only: otherwise "or" in "Copenhagen or London" reads as Oregon (OR) and "join us" as the US
const US_CODES = /\b(US|NY|CA|WA|TX|CO|MA|IL|OR|GA)\b/;
const isUS = (loc: string) => US_WORDS.test(loc) || US_CODES.test(loc);
const NON_US =
  /canada|toronto|vancouver|united kingdom|london|\buk\b|europe|emea|india|bengaluru|bangalore|singapore|japan|tokyo|korea|busan|australia|sydney|germany|berlin|france|paris|ireland|dublin|netherlands|amsterdam|brazil|mexico|poland|spain|israel|apac|latam|argentina|colombia|philippines/i;
const US_COUNTRY = /^(us|usa|united states( of america)?)$/i;
// Worldwide remote jobs (We Work Remotely often says "Anywhere in the World") include the US
const WORLDWIDE = /anywhere|worldwide|global|work from anywhere/i;

function isRemoteMatch(job: FilterInput, rules: BoardRules): boolean {
  const loc = job.location;
  const countryIsUS = job.country ? US_COUNTRY.test(job.country.trim()) : null;
  if (countryIsUS === false) return false;
  if (!job.isRemote && !/remote/i.test(loc)) return false;

  if (rules.remoteUS) {
    if (countryIsUS) return true;
    if (NON_US.test(loc) && !isUS(loc)) return false;
    if (isUS(loc) || /^\s*remote\s*$/i.test(loc)) return true;
  }
  return rules.worldwide && WORLDWIDE.test(loc) && !NON_US.test(loc);
}

/** Title rules only, for sources that need a request per job. */
export function titleMatcher(rules: BoardRules): (title: string) => boolean {
  const include = compile(rules.include);
  const exclude = compile(rules.exclude);
  const required = compile(rules.require);
  return (title) => {
    const t = normalize(title);
    return Boolean(include?.test(t)) && !exclude?.test(t) && (!required || required.test(t));
  };
}

/** Build a matcher once per board: it runs over every job on every page view. */
export function jobMatcher(rules: BoardRules): (job: FilterInput) => boolean {
  const title = titleMatcher(rules);
  const cities = compile(rules.cities);
  const anywhere = !rules.remoteUS && !rules.worldwide && !cities;
  return (job) => {
    if (!title(job.title)) return false;
    return anywhere || Boolean(cities?.test(normalize(job.location))) || isRemoteMatch(job, rules);
  };
}

/** Search terms for sources too large to fetch whole. Short words like "ai" find too much alone, so they are searched with a role. */
export function searchTerms(rules: BoardRules): string[] {
  return rules.include.map((k) => {
    const word = k.replace(/\*$/, "");
    return word.length <= 3 ? `${word} ${(rules.require[0] ?? "engineer").replace(/\*$/, "")}` : word;
  });
}

const cleanList = (list: unknown): string[] =>
  Array.isArray(list)
    ? [...new Set(list.filter((k): k is string => typeof k === "string").map((k) => k.trim().slice(0, MAX_KEYWORD_LENGTH)).filter(Boolean))].slice(0, MAX_KEYWORDS)
    : [];

/** Rules coming from the browser: keep strings only, trimmed, deduped and within limits. */
export function cleanRules(input: Partial<Record<keyof BoardRules, unknown>>): BoardRules {
  return {
    include: cleanList(input.include),
    exclude: cleanList(input.exclude),
    require: cleanList(input.require),
    remoteUS: input.remoteUS === true,
    worldwide: input.worldwide === true,
    cities: cleanList(input.cities),
  };
}
