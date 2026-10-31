import { fetchJson } from "./text";
import type { NormalizedJob } from "./types";

interface WorkableJob {
  title: string;
  shortcode: string;
  url: string;
  application_url?: string;
  telecommuting?: boolean;
  department?: string;
  city?: string;
  state?: string;
  country?: string;
  published_on?: string;
  created_at?: string;
}

// ⚠️ Workable rate-limits hard: the fetch script goes one company at a time, a few seconds apart
export async function fetchWorkable(slug: string): Promise<NormalizedJob[]> {
  const { jobs } = await fetchJson<{ jobs: WorkableJob[] }>(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, {
    label: `Workable ${slug}`,
  });
  return jobs.map((j) => ({
    externalId: j.shortcode,
    title: j.title.trim(),
    location: [j.city, j.state, j.country].filter(Boolean).join(", "),
    country: j.country ?? null,
    isRemote: Boolean(j.telecommuting),
    department: j.department || null,
    compensation: null,
    url: j.url,
    applyUrl: j.application_url ?? j.url,
    descriptionText: null, // the list endpoint has no description; fetch it separately when needed
    postedAt: j.published_on ?? j.created_at ?? null,
  }));
}
