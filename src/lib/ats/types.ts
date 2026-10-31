/** ATSs fetched per company (one slug per company) */
export type AtsSource = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "recruitee" | "workday";
/** Job boards: many companies' jobs in one request */
export type BoardSource = "hackernews" | "weworkremotely" | "jobicy";
export type DirectSource = AtsSource | BoardSource;

export interface Company {
  name: string;
  ats: string; // the id of a source on the Sources page
  slug: string;
}

/** What the user's boards look for, for sources too large to fetch whole (Workday) */
export interface FetchScope {
  searchTerms: string[];
  titleMayMatch: (title: string) => boolean;
}

/** Every source is normalized to this shape */
export interface NormalizedJob {
  externalId: string;
  title: string;
  location: string;
  country: string | null; // country given by the source (when available), used to tell US jobs apart
  isRemote: boolean;
  department: string | null;
  compensation: string | null;
  url: string;
  applyUrl: string | null;
  descriptionText: string | null;
  postedAt: string | null; // ISO timestamp
}

/** Job board entries also carry the company name */
export interface BoardJob extends NormalizedJob {
  companyName: string;
}
