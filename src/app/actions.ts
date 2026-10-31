"use server";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { JOB_STATUSES, type JobStatus } from "@/db/schema";
import { isLocale } from "@/i18n/dictionaries";
import { LOCALE_COOKIE } from "@/i18n/locale";
import { getLocale } from "@/i18n/locale";
import { waitForStatus, writeStatus, type AutofillResult } from "@/lib/autofill/status";
import { createBoard, deleteBoard, updateBoard } from "@/lib/board-store";
import { addCompany, DATA_DIR, removeCompany } from "@/lib/companies";
import { DEMO } from "@/lib/demo";
import { cleanRules, type BoardRules } from "@/lib/filter";
import { getBoardPreview } from "@/lib/jobs";
import { deleteWorkaround, loadSourceSettings, removeDirectSource, saveDirectSource, saveWorkaround, setSourceEnabled } from "@/lib/source-settings";
import { WORKAROUND_STATUSES, type WorkaroundStatus } from "@/lib/sources";

function assertWritable() {
  if (DEMO) throw new Error("The demo is read-only");
}

export async function setJobStatus(formData: FormData) {
  assertWritable();
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || !JOB_STATUSES.includes(status as JobStatus)) {
    throw new Error("Invalid job status update");
  }
  // The same job can appear in several sources: update the whole group (same dedupe key)
  const job = db.select({ key: schema.jobs.dedupeKey }).from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  if (!job) throw new Error("Job not found");
  db.update(schema.jobs)
    .set({ status: status as JobStatus, statusUpdatedAt: new Date().toISOString() })
    .where(job.key ? eq(schema.jobs.dedupeKey, job.key) : eq(schema.jobs.id, id))
    .run();
  refresh();
}

// Longer than the longest normal run: reading the form, starting Chrome and filling it
const AUTOFILL_WAIT_MS = 45_000;

// Start `pnpm autofill <id>` in the background: it opens Chrome, fills the form and exits.
// Chrome stays open for the user to review and submit.
export async function startAutofill(_previous: AutofillResult | null, formData: FormData): Promise<AutofillResult> {
  assertWritable();
  const id = formData.get("id");
  if (typeof id !== "string" || !db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.id, id)).get()) {
    throw new Error("Job not found");
  }
  const log = fs.openSync(path.join(/*turbopackIgnore: true*/ DATA_DIR, "autofill.log"), "a");
  const statusFile = path.join(os.tmpdir(), `offer-pilot-autofill-${randomUUID()}.json`);
  const dryRun = process.env.OFFER_PILOT_AUTOFILL_DRY_RUN === "1" ? ["--dry-run"] : []; // end-to-end tests stay out of real Chrome
  const child = spawn("pnpm", ["autofill", id, ...dryRun], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, OFFER_PILOT_AUTOFILL_STATUS: statusFile },
  });
  child.on("error", () => writeStatus(statusFile, { state: "failed" }));
  child.unref();
  return waitForStatus(statusFile, AUTOFILL_WAIT_MS);
}

// Live preview on the board form; reads only, so it also works in the demo
export async function previewBoard(input: Partial<BoardRules>) {
  return getBoardPreview(cleanRules(input));
}

const MAX_NAME_LENGTH = 40;

export async function saveBoard(id: number | null, nameInput: string, input: Partial<BoardRules>) {
  assertWritable();
  const name = String(nameInput).trim().slice(0, MAX_NAME_LENGTH);
  const rules = cleanRules(input);
  if (!name || !rules.include.length) throw new Error("A board needs a name and at least one title keyword");
  const board = id === null ? createBoard(name, rules) : updateBoard(id, name, rules);
  if (!board) throw new Error("Board not found");
  revalidatePath("/", "layout"); // the top navigation lists the boards
  redirect(`/boards/${board.slug}`);
}

export async function removeBoard(id: number) {
  assertWritable();
  deleteBoard(id);
  revalidatePath("/", "layout");
  redirect("/");
}

const field = (form: FormData, name: string, max: number) => String(form.get(name) ?? "").trim().slice(0, max);

function sourceField(form: FormData): string {
  const source = field(form, "source", 40);
  if (!/^[a-z0-9-]+$/.test(source)) throw new Error("Invalid source id");
  return source;
}

function atsSource(form: FormData): string {
  const source = sourceField(form);
  if (loadSourceSettings().direct.find((d) => d.id === source)?.kind !== "ats") throw new Error("Companies apply to ATS sources only");
  return source;
}

// Only web links: these values become an href on the page
const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

export async function toggleSource(form: FormData) {
  assertWritable();
  setSourceEnabled(sourceField(form), form.get("enabled") === "true");
  refresh();
}

export async function addSource(form: FormData) {
  assertWritable();
  const label = field(form, "label", 60);
  const url = field(form, "url", 300);
  const kind = field(form, "kind", 10);
  if (!label || !isWebUrl(url) || (kind !== "ats" && kind !== "board")) throw new Error("Invalid source");
  saveDirectSource({ id: sourceField(form), label, kind, url, how: field(form, "how", 200) });
  refresh();
}

export async function removeSource(form: FormData) {
  assertWritable();
  removeDirectSource(sourceField(form));
  refresh();
}

export async function addTrackedCompany(form: FormData) {
  assertWritable();
  const name = field(form, "name", 80);
  const slug = field(form, "slug", 200);
  if (!name || !slug) throw new Error("A company needs a name and a slug");
  addCompany({ name, ats: atsSource(form), slug });
  refresh();
}

export async function removeTrackedCompany(form: FormData) {
  assertWritable();
  removeCompany(atsSource(form), field(form, "slug", 200));
  refresh();
}

export async function saveWorkaroundSource(form: FormData) {
  assertWritable();
  const label = field(form, "label", 60);
  const url = field(form, "url", 300);
  const status = field(form, "status", 20) as WorkaroundStatus;
  if (!label || !isWebUrl(url) || !WORKAROUND_STATUSES.includes(status)) throw new Error("Invalid source");
  const input = { label, url, status, kind: field(form, "kind", 80), plan: field(form, "plan", 300) };
  saveWorkaround(field(form, "id", 80) || null, input, await getLocale());
  refresh();
}

export async function removeWorkaround(form: FormData) {
  assertWritable();
  deleteWorkaround(field(form, "id", 80));
  refresh();
}

// Language switch: remember the choice for a year, then re-render the current page
export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (!isLocale(locale)) throw new Error("Invalid locale");
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  refresh();
}
