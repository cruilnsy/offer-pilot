import { answerQuestion } from "./rules";
import type { Profile } from "./profile";
import { fileStep, fromAnswer, type FillPlan, type FillStep } from "./plan";

// Ashby's job board calls a GraphQL endpoint that returns the whole application form,
// including the EEO survey. On the page every question sits in a box marked
// data-field-path="<field path>", which is what the runner targets.

interface AshbyField {
  path: string;
  title: string;
  type: "String" | "Email" | "Phone" | "LongText" | "File" | "Boolean" | "ValueSelect" | "MultiValueSelect" | "Location" | "Date" | "Number" | string;
  selectableValues?: { label: string; value: string }[];
}
interface AshbyEntry {
  isRequired: boolean;
  field: AshbyField;
}
interface AshbySection {
  title?: string | null;
  fieldEntries: (AshbyEntry | Record<string, never>)[];
}
export interface AshbyPosting {
  id: string;
  title: string;
  applicationForm: { sections: AshbySection[] } | null;
  surveyForms?: { sections: AshbySection[] }[] | null;
}

const QUERY = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    id title
    applicationForm { sections { title fieldEntries { ... on FormFieldEntry { isRequired field } } } }
    surveyForms { sections { title fieldEntries { ... on FormFieldEntry { isRequired field } } } }
  }
}`;

export async function fetchAshbyPosting(slug: string, jobId: string): Promise<AshbyPosting> {
  const res = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationName: "ApiJobPosting", variables: { organizationHostedJobsPageName: slug, jobPostingId: jobId }, query: QUERY }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ashby form ${slug}/${jobId}: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { jobPosting: AshbyPosting | null }; errors?: { message: string }[] };
  if (!body.data?.jobPosting) throw new Error(`Ashby form ${slug}/${jobId}: ${body.errors?.[0]?.message ?? "job not found"}`);
  return body.data.jobPosting;
}

export function ashbyFormUrl(slug: string, jobId: string): string {
  return `https://jobs.ashbyhq.com/${slug}/${jobId}/application`;
}

export function planAshbyFill(job: AshbyPosting, slug: string, profile: Profile): FillPlan {
  const sections = [...(job.applicationForm?.sections ?? []), ...(job.surveyForms ?? []).flatMap((f) => f.sections)];
  const steps: FillStep[] = [];
  for (const section of sections) {
    for (const entry of section.fieldEntries) {
      if ("field" in entry) steps.push(planField(entry as AshbyEntry, profile));
    }
  }
  return { ats: "ashby", url: ashbyFormUrl(slug, job.id), title: job.title, company: slug, ready: "#_systemfield_name", steps };
}

function planField({ field, isRequired }: AshbyEntry, profile: Profile): FillStep {
  const box = `[data-field-path="${field.path}"]`;
  const base = { id: field.path, label: field.title, required: isRequired };
  const options = field.selectableValues?.map((v) => v.label);

  switch (field.type) {
    case "File":
      return fileStep({ ...base, selector: `${box} input[type=file]` }, field.path === "_systemfield_resume", profile);
    case "Boolean":
      // Rendered as Yes / No buttons
      return fromAnswer({ ...base, kind: "radio", selector: box }, answerQuestion(field.title, profile, ["Yes", "No"]));
    case "ValueSelect":
      return fromAnswer({ ...base, kind: "radio", selector: box }, answerQuestion(field.title, profile, options));
    case "MultiValueSelect":
      // Mostly office lists and legal acknowledgements: the user should read and tick these
      return fromAnswer({ ...base, kind: "checkbox", selector: box }, answerQuestion(field.title, profile, options));
    case "Location":
      return fromAnswer(
        { ...base, kind: "select", selector: `${box} input[role=combobox]`, optionSelector: "[role=listbox] [role=option]", search: profile.city },
        answerQuestion(field.title, profile),
      );
    case "Date":
      // A calendar widget; free text like "Immediately" does not fit it
      return { ...base, kind: "text", selector: `${box} input`, status: isRequired ? "manual" : "skip", why: "date picker, pick a date yourself" };
    case "LongText":
      return fromAnswer({ ...base, kind: "textarea", selector: `${box} textarea` }, answerQuestion(field.title, profile));
    case "String":
    case "Email":
    case "Phone":
    case "Number":
      return fromAnswer({ ...base, kind: "text", selector: `${box} input` }, answerQuestion(field.title, profile));
    default:
      return { ...base, kind: "text", selector: box, status: isRequired ? "manual" : "skip", why: `unsupported field type ${field.type}` };
  }
}
