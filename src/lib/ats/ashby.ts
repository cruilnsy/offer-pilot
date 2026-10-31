import type { NormalizedJob } from "./types";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  isRemote?: boolean;
  isListed?: boolean;
  department?: string;
  jobUrl: string;
  applyUrl?: string;
  publishedAt?: string;
  descriptionPlain?: string;
  address?: { postalAddress?: { addressCountry?: string } };
  compensation?: { compensationTierSummary?: string | null };
}

export async function fetchAshby(slug: string): Promise<NormalizedJob[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ashby ${slug}: HTTP ${res.status}`);
  const { jobs } = (await res.json()) as { jobs: AshbyJob[] };

  return jobs
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      externalId: j.id,
      title: j.title.trim(),
      location: [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).join("; "),
      country: j.address?.postalAddress?.addressCountry ?? null,
      isRemote: Boolean(j.isRemote),
      department: j.department ?? null,
      compensation: j.compensation?.compensationTierSummary ?? null,
      url: j.jobUrl,
      applyUrl: j.applyUrl ?? null,
      descriptionText: j.descriptionPlain?.trim() || null,
      postedAt: j.publishedAt ?? null,
    }));
}
