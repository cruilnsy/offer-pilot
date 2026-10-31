import { htmlToText } from "./text";
import type { FetchScope, NormalizedJob } from "./types";

// Workday has no public docs; this uses the JSON API its career pages call, which may change
// Slug format: "tenant|server|site", e.g. "acme|wd5|AcmeCareers"
// (from the career page URL https://acme.wd5.myworkdayjobs.com/AcmeCareers)

interface WdPosting {
  title: string;
  externalPath: string;
  locationsText?: string;
  bulletFields?: string[];
}

interface WdDetail {
  jobPostingInfo: {
    id: string;
    title: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    startDate?: string;
    remoteType?: string;
    jobReqId?: string;
    country?: { descriptor?: string };
    jobRequisitionLocation?: { country?: { alpha2Code?: string } };
    externalUrl?: string;
  };
}

// 20 jobs per page and thousands at big companies, so fetching all is too slow: search by keyword, then pre-filter by title
const PAGE = 20;
const MAX_PAGES = 5; // at most 100 per keyword; later results are less relevant
const DETAIL_CONCURRENCY = 4;

async function wdFetch<T>(url: string, label: string, body?: unknown, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    // some company servers are occasionally slow: retry timeouts too
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "offer-pilot (personal job search)" },
      body: body ? JSON.stringify(body) : undefined,
    }).catch((e: Error) => {
      if (e.name !== "TimeoutError" || attempt >= retries) throw new Error(`${label}: ${e.message}`);
      return null;
    });
    if (res?.ok) return (await res.json()) as T;
    const retryable = !res || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) throw new Error(`${label}: HTTP ${res?.status}`);
    await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt));
  }
}

export async function fetchWorkday(slug: string, { searchTerms, titleMayMatch }: FetchScope): Promise<NormalizedJob[]> {
  const [tenant, server, site] = slug.split("|");
  if (!tenant || !server || !site) throw new Error(`Workday ${slug}: slug must be "tenant|server|site"`);
  const host = `https://${tenant}.${server}.myworkdayjobs.com`;
  const api = `${host}/wday/cxs/${tenant}/${site}`;
  const label = `Workday ${tenant}`;

  const found = new Map<string, WdPosting>();
  for (const searchText of searchTerms) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const d = await wdFetch<{ total: number; jobPostings: WdPosting[] }>(`${api}/jobs`, label, {
        appliedFacets: {},
        limit: PAGE,
        offset: page * PAGE,
        searchText,
      });
      for (const p of d.jobPostings ?? []) found.set(p.externalPath, p);
      // total is only returned on the first page; later pages say 0
      if (d.jobPostings.length < PAGE || (page === 0 && d.total <= PAGE)) break;
    }
  }

  // Fetch details (location, country, remote, description) only for titles that may match
  const candidates = [...found.values()].filter((p) => titleMayMatch(p.title));
  const jobs: NormalizedJob[] = [];
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const p = candidates[next++];
      const { jobPostingInfo: j } = await wdFetch<WdDetail>(`${api}${p.externalPath}`, label);
      const locations = [j.location ?? p.locationsText ?? "", ...(j.additionalLocations ?? [])].filter(Boolean);
      const location = locations.join("; ");
      const url = `${host}/${site}${p.externalPath}`;
      jobs.push({
        externalId: j.jobReqId ?? p.bulletFields?.[0] ?? p.externalPath,
        title: j.title.trim(),
        location,
        // with several locations the country is only the first one's; let the location text decide
        country: locations.length === 1 ? (j.jobRequisitionLocation?.country?.alpha2Code ?? j.country?.descriptor ?? null) : null,
        isRemote: /remote/i.test(j.remoteType ?? "") || /remote/i.test(location),
        department: null,
        compensation: null,
        url,
        applyUrl: `${url}/apply`,
        descriptionText: htmlToText(j.jobDescription),
        postedAt: j.startDate ? new Date(j.startDate).toISOString() : null,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, candidates.length) }, worker));
  return jobs;
}
