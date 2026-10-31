// Demo mode (OFFER_PILOT_DEMO=1): fictional jobs in an in-memory database, read-only.
// Used by `pnpm demo` and the hosted demo, where there is no data/jobs.db or writable disk.
export const DEMO = process.env.OFFER_PILOT_DEMO === "1";
