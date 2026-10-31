// The same job can show up on several sources.
// The dedupe key is "normalized company + title"; jobs sharing a key are merged into one row on the page.

const COMPANY_SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|ab|plc|technologies|technology|labs?|ai|hq)\b/g;

export function normalizeCompany(name: string): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/&/g, " and ");
  const stripped = base.replace(/[^a-z0-9 ]+/g, " ").replace(COMPANY_SUFFIX, " ");
  // Drop all spaces so "Pied Piper" and "PiedPiper" match; if nothing is left after removing suffixes, keep the original letters and digits
  return stripped.replace(/\s+/g, "") || base.replace(/[^a-z0-9]+/g, "");
}

const NOISE_PARENS = /^\s*(remote|hybrid|on-?site|us|usa|u\.s\.|united states|north america|americas|r?\d{3,}|[a-z]{1,3}-?\d{3,}|full[\s-]?time|contract)(\s*[,/&]\s*(remote|hybrid|us|usa|canada|full[\s-]?time))*\s*$/i;

export function normalizeTitle(title: string): string {
  return (
    title
      .split("|")[0] // HN titles are often followed by "| Location | Pay"; keep only the role
      .toLowerCase()
      .normalize("NFKD")
      // Only drop parentheses holding a location, remote or a job number, e.g. "(Remote)", "(R6244)", "(US)";
      // keep team names: "Fullstack (App Experience)" and "Fullstack (Consumer)" are different jobs
      .replace(/\(([^)]*)\)/g, (m, inner: string) => (NOISE_PARENS.test(inner) ? " " : ` ${inner} `))
      .replace(/\b(remote|hybrid|onsite|on-site|us|usa|united states|full[\s-]?time)\b/g, " ")
      .replace(/sr\.?\s/g, "senior ")
      .replace(/full[\s-]?stack/g, "fullstack")
      .replace(/front[\s-]?end/g, "frontend")
      .replace(/back[\s-]?end/g, "backend")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
  );
}

export function dedupeKey(companyName: string, title: string): string {
  return `${normalizeCompany(companyName)}|${normalizeTitle(title)}`;
}
