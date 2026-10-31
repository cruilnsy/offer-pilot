// Decide how an application page should be handled, based on its URL alone.
// "direct": the form is on the page, we can fill it.
// "login": the ATS needs an account first; the user signs in by hand, then we fill.
// "manual": unknown site; we only open the page.

export type PageKind = "direct" | "login" | "manual";
export type FillableAts = "greenhouse" | "lever" | "ashby";

export interface PageClass {
  kind: PageKind;
  ats: string | null;
}

const DIRECT: [RegExp, FillableAts][] = [
  [/(^|\.)greenhouse\.io$/, "greenhouse"],
  [/(^|\.)lever\.co$/, "lever"],
  [/(^|\.)ashbyhq\.com$/, "ashby"],
];

const LOGIN: [RegExp, string][] = [
  [/(^|\.)myworkdayjobs\.com$/, "workday"],
  [/(^|\.)myworkdaysite\.com$/, "workday"],
  [/(^|\.)icims\.com$/, "icims"],
  [/(^|\.)taleo\.net$/, "taleo"],
  [/(^|\.)successfactors\.(com|eu)$/, "successfactors"],
  [/(^|\.)oraclecloud\.com$/, "oracle"],
];

export function classifyApplyUrl(url: string): PageClass {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "manual", ats: null };
  }
  const host = parsed.hostname.toLowerCase();
  for (const [re, ats] of DIRECT) if (re.test(host)) return { kind: "direct", ats };
  for (const [re, ats] of LOGIN) if (re.test(host)) return { kind: "login", ats };
  // Company career pages often embed Greenhouse via ?gh_jid=123
  if (parsed.searchParams.has("gh_jid")) return { kind: "direct", ats: "greenhouse" };
  return { kind: "manual", ats: null };
}
