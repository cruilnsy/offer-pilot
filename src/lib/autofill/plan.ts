import type { answerQuestion } from "./rules";
import { isUnknown, type Profile } from "./profile";

// A fill plan is built before the browser opens, so it can be printed and tested without a page.

export interface FillStep {
  /** Stable key for the field (Greenhouse: DOM id; Lever: input name; Ashby: field path) */
  id: string;
  label: string;
  required: boolean;
  /** radio: pick one labelled option (also yes/no buttons); checkbox: tick one labelled option */
  kind: "text" | "textarea" | "select" | "file" | "radio" | "checkbox";
  /** fill: we have an answer; manual: required but unknown, highlight it; skip: optional and unknown */
  status: "fill" | "manual" | "skip";
  value?: string;
  /** Which rule produced the answer, or why there is none */
  why: string;
  /** Field may not exist on every page; missing it is not an error */
  optionalOnPage?: boolean;
  /** CSS selector for the field, or for the box holding its options. Default: [id="<id>"] */
  selector?: string;
  /** CSS selector for dropdown options that appear after typing. Default: Greenhouse react-select */
  optionSelector?: string;
  /** Text typed to bring up dropdown options when it differs from the value (e.g. just the city) */
  search?: string;
}

export interface FillPlan {
  ats: string;
  url: string;
  title: string;
  company: string;
  /** Selector that exists once the form has rendered */
  ready: string;
  steps: FillStep[];
}

export interface StepResult {
  id: string;
  label: string;
  outcome: "filled" | "highlighted" | "skipped" | "missing" | "failed";
  detail?: string;
}

export function summarize(plan: FillPlan): { fill: number; manual: number; skip: number } {
  const count = (s: FillStep["status"]) => plan.steps.filter((x) => x.status === s).length;
  return { fill: count("fill"), manual: count("manual"), skip: count("skip") };
}

type Base = Pick<FillStep, "id" | "label" | "required" | "kind"> & Partial<Pick<FillStep, "selector" | "optionSelector" | "search">>;

/** Turn a rule answer into a step: unknown answers are highlighted when required, skipped otherwise. */
export function fromAnswer(base: Base, answer: ReturnType<typeof answerQuestion>): FillStep {
  const step = { ...base, label: base.label.trim() };
  if (answer?.status === "fill") return { ...step, status: "fill", value: answer.value, why: answer.rule };
  return { ...step, status: base.required ? "manual" : "skip", why: answer ? answer.reason : "no rule (open question)" };
}

/** Resume uploads come from the profile; other files (cover letters) wait for "prepare materials". */
export function fileStep(base: Omit<Base, "kind">, isResume: boolean, profile: Profile): FillStep {
  const step = { ...base, kind: "file" as const };
  if (!isResume) return { ...step, status: base.required ? "manual" : "skip", why: "cover letter not generated yet" };
  return isUnknown(profile.resumePath)
    ? { ...step, status: "manual", why: "resume path needs confirmation" }
    : { ...step, status: "fill", value: profile.resumePath, why: "profile" };
}
