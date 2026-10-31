import { fetchAshby } from "./ashby";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import { fetchRecruitee } from "./recruitee";
import { fetchSmartRecruiters } from "./smartrecruiters";
import { fetchWorkable } from "./workable";
import { fetchWorkday } from "./workday";
import { fetchHackerNews } from "../boards/hackernews";
import { fetchJobicy } from "../boards/jobicy";
import { fetchWeWorkRemotely } from "../boards/weworkremotely";
import type { AtsSource, BoardJob, BoardSource, FetchScope, NormalizedJob } from "./types";

/** Applicant tracking systems, fetched per company */
export const atsFetchers: Record<AtsSource, (slug: string, scope: FetchScope) => Promise<NormalizedJob[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  workable: fetchWorkable,
  smartrecruiters: fetchSmartRecruiters,
  recruitee: fetchRecruitee,
  workday: fetchWorkday,
};

/** Connectors that rate-limit hard: fetch one company at a time, with a gap */
export const oneAtATime = new Set<string>(["workable"]);
export const ONE_AT_A_TIME_GAP_MS = 3000;

/** Job boards: many companies' jobs in one request */
export const boardFetchers: Record<BoardSource, () => Promise<BoardJob[]>> = {
  hackernews: fetchHackerNews,
  weworkremotely: fetchWeWorkRemotely,
  jobicy: fetchJobicy,
};

export type { AtsSource, BoardJob, BoardSource, Company, DirectSource, FetchScope, NormalizedJob } from "./types";
