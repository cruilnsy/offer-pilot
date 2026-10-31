import { answerQuestion } from "./rules";
import type { Profile } from "./profile";
import { fileStep, fromAnswer, type FillPlan, type FillStep } from "./plan";

// Greenhouse exposes every form question through its public API, so the whole
// fill plan can be built before the page is opened.

interface GhField {
  name: string;
  type: "input_text" | "input_file" | "input_hidden" | "textarea" | "multi_value_single_select" | "multi_value_multi_select";
  values?: { label: string; value: string | number }[];
}
interface GhQuestion {
  label: string;
  required: boolean;
  fields: GhField[];
}
interface GhDemographic {
  id: number;
  label: string;
  required: boolean;
  type: string;
  answer_options?: { label: string }[];
}
export interface GhJobWithQuestions {
  id: number;
  title: string;
  company_name?: string;
  absolute_url: string;
  questions?: GhQuestion[];
  location_questions?: GhQuestion[];
  compliance?: { type: string; questions: GhQuestion[] }[] | null;
  demographic_questions?: { questions: GhDemographic[] } | null;
}

export async function fetchGreenhouseQuestions(slug: string, jobId: string): Promise<GhJobWithQuestions> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}?questions=true`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Greenhouse questions ${slug}/${jobId}: HTTP ${res.status}`);
  return (await res.json()) as GhJobWithQuestions;
}

/** The hosted form URL; company career pages that embed Greenhouse are harder to drive. */
export function greenhouseFormUrl(slug: string, jobId: string): string {
  return `https://job-boards.greenhouse.io/${slug}/jobs/${jobId}`;
}

export function planGreenhouseFill(job: GhJobWithQuestions, profile: Profile): FillPlan {
  const steps: FillStep[] = [];

  for (const q of [...(job.questions ?? []), ...(job.location_questions ?? [])]) {
    steps.push(...planQuestion(q, profile));
  }
  for (const group of job.compliance ?? []) {
    for (const q of group.questions) steps.push(...planQuestion(q, profile));
  }
  for (const q of job.demographic_questions?.questions ?? []) {
    const options = (q.answer_options ?? []).map((o) => o.label);
    steps.push(fromAnswer({ id: String(q.id), label: q.label, required: q.required, kind: "select" }, answerQuestion(q.label, profile, options)));
  }
  // The hosted form adds a Country picker for the phone number that is not in the API.
  steps.push({ id: "country", label: "Country", required: false, kind: "select", status: "fill", value: profile.country, why: "phone country", optionalOnPage: true });

  return {
    ats: "greenhouse",
    url: greenhouseFormUrl(slugFromUrl(job.absolute_url), String(job.id)),
    title: job.title,
    company: job.company_name ?? "",
    ready: "#first_name",
    steps,
  };
}

function planQuestion(q: GhQuestion, profile: Profile): FillStep[] {
  // Resume / cover letter come as a file field plus a "paste text" textarea; we only use the file.
  const file = q.fields.find((f) => f.type === "input_file");
  if (file) return [fileStep({ id: file.name, label: q.label, required: q.required }, file.name === "resume", profile)];

  const field = q.fields.find((f) => f.type !== "input_hidden");
  if (!field) return [];
  const isSelect = field.type.startsWith("multi_value");
  const options = isSelect ? (field.values ?? []).map((v) => v.label) : undefined;
  const kind = isSelect ? "select" : field.type === "textarea" ? "textarea" : "text";
  return [fromAnswer({ id: field.name, label: q.label, required: q.required, kind }, answerQuestion(q.label, profile, options))];
}

function slugFromUrl(url: string): string {
  // https://job-boards.greenhouse.io/globex/jobs/123 or https://boards.greenhouse.io/globex/jobs/123
  const m = url.match(/greenhouse\.io\/([^/]+)\/jobs\//);
  return m?.[1] ?? "";
}
