import { fetchJson } from "./text";
import type { NormalizedJob } from "./types";

interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  department?: { label?: string };
}

const PAGE = 100;
const MAX = 2000; // big companies have many jobs: at most 20 pages

export async function fetchSmartRecruiters(slug: string): Promise<NormalizedJob[]> {
  const all: SrPosting[] = [];
  for (let offset = 0; offset < MAX; offset += PAGE) {
    const d = await fetchJson<{ content: SrPosting[]; totalFound: number }>(
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${PAGE}&offset=${offset}`,
      { label: `SmartRecruiters ${slug}` },
    );
    all.push(...d.content);
    if (offset + PAGE >= d.totalFound || d.content.length === 0) break;
  }
  return all.map((j) => {
    const l = j.location ?? {};
    return {
      externalId: j.id,
      title: j.name.trim(),
      location: [l.city, l.region, l.country?.toUpperCase()].filter(Boolean).join(", "),
      country: l.country ?? null, // two-letter country code, e.g. "us"
      isRemote: Boolean(l.remote),
      department: j.department?.label ?? null,
      compensation: null,
      url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      applyUrl: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      descriptionText: null,
      postedAt: j.releasedDate ?? null,
    };
  });
}
