import { fetchJson, htmlToText } from "../ats/text";
import type { BoardJob } from "../ats/types";

interface JobicyJob {
  id: number | string;
  url: string;
  jobTitle: string;
  companyName: string;
  jobGeo: string;
  jobLevel?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number | string;
  salaryMax?: number | string;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

const money = (n: number | string) => `$${Math.round(Number(n) / 1000)}K`;

export async function fetchJobicy(): Promise<BoardJob[]> {
  // Only remote engineering jobs open to the US (geo=usa)
  const { jobs } = await fetchJson<{ jobs: JobicyJob[] }>("https://jobicy.com/api/v2/remote-jobs?count=100&geo=usa&industry=engineering", {
    label: "Jobicy",
  });
  return jobs.map((j) => ({
    companyName: j.companyName,
    externalId: String(j.id),
    title: j.jobTitle.trim(),
    location: j.jobGeo.replace(/\s+/g, " "),
    country: null,
    isRemote: true, // this board only lists remote jobs
    department: j.jobLevel ?? null,
    compensation:
      j.salaryMin && j.salaryMax ? `${money(j.salaryMin)} – ${money(j.salaryMax)} ${j.salaryCurrency ?? ""} (${j.salaryPeriod ?? ""})`.trim() : null,
    url: j.url,
    applyUrl: j.url,
    descriptionText: htmlToText(j.jobDescription),
    postedAt: j.pubDate ?? null,
  }));
}
