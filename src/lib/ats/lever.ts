import type { NormalizedJob } from "./types";

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: "remote" | "hybrid" | "on-site" | "unspecified";
  country?: string;
  categories?: { location?: string; allLocations?: string[]; department?: string; team?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min: number; max: number; currency: string; interval: string } | null;
}

const money = (n: number) => `$${Math.round(n / 1000)}K`;

export async function fetchLever(slug: string): Promise<NormalizedJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Lever ${slug}: HTTP ${res.status}`);
  const jobs = (await res.json()) as LeverJob[];

  return jobs.map((j) => {
    const locations = j.categories?.allLocations?.length ? j.categories.allLocations : [j.categories?.location ?? ""];
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${l.content.replace(/<[^>]+>/g, "\n")}`).join("\n\n");
    const s = j.salaryRange;
    return {
      externalId: j.id,
      title: j.text.trim(),
      location: locations.filter(Boolean).join("; "),
      country: j.country ?? null,
      isRemote: j.workplaceType === "remote",
      department: j.categories?.team ?? j.categories?.department ?? null,
      compensation: s ? `${money(s.min)} – ${money(s.max)} ${s.currency} (${s.interval})` : null,
      url: j.hostedUrl,
      applyUrl: j.applyUrl ?? null,
      descriptionText: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n\n").trim() || null,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    };
  });
}
