import { fetchJson, htmlToText } from "./text";
import type { NormalizedJob } from "./types";

interface RecruiteeOffer {
  id: number;
  title: string;
  city?: string;
  state_name?: string;
  country?: string;
  country_code?: string;
  remote?: boolean;
  department?: string;
  careers_url: string;
  careers_apply_url?: string;
  description?: string;
  requirements?: string;
  published_at?: string;
}

export async function fetchRecruitee(slug: string): Promise<NormalizedJob[]> {
  const { offers } = await fetchJson<{ offers: RecruiteeOffer[] }>(`https://${slug}.recruitee.com/api/offers/`, {
    label: `Recruitee ${slug}`,
  });
  return offers.map((j) => ({
    externalId: String(j.id),
    title: j.title.trim(),
    location: [j.city, j.state_name, j.country].filter(Boolean).join(", "),
    country: j.country_code ?? j.country ?? null,
    isRemote: Boolean(j.remote),
    department: j.department ?? null,
    compensation: null,
    url: j.careers_url,
    applyUrl: j.careers_apply_url ?? j.careers_url,
    descriptionText: htmlToText([j.description, j.requirements].filter(Boolean).join("\n")),
    postedAt: j.published_at ?? null,
  }));
}
