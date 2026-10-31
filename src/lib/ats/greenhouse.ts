import { htmlToText } from "./text";
import type { NormalizedJob } from "./types";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  departments?: { name: string }[];
  first_published?: string;
  updated_at?: string;
  content?: string;
}

export async function fetchGreenhouse(slug: string): Promise<NormalizedJob[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Greenhouse ${slug}: HTTP ${res.status}`);
  const { jobs } = (await res.json()) as { jobs: GreenhouseJob[] };

  return jobs.map((j) => {
    const location = j.location?.name ?? "";
    return {
      externalId: String(j.id),
      title: j.title.trim(),
      location,
      country: null,
      isRemote: /remote/i.test(location),
      department: j.departments?.[0]?.name ?? null,
      compensation: null, // Greenhouse only mentions pay inside the description text
      url: j.absolute_url,
      applyUrl: j.absolute_url,
      descriptionText: htmlToText(j.content),
      postedAt: j.first_published ?? j.updated_at ?? null,
    };
  });
}
