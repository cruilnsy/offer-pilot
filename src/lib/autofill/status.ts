import fs from "node:fs";

// How a background autofill run tells the web app what happened. The run writes one small file;
// the Server Action waits for it, so the button can show the result.

export interface AutofillResult {
  state: "filled" | "opened" | "login" | "busy" | "failed" | "timeout";
  filled?: number;
  manual?: number;
}

export function writeStatus(file: string | undefined, result: AutofillResult) {
  if (!file) return;
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(result));
  fs.renameSync(`${file}.tmp`, file); // the reader never sees half a file
}

/** The run's result, or `timeout` if it is still working when the wait ends. */
export async function waitForStatus(file: string, timeoutMs: number, pollMs = 150): Promise<AutofillResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(/*turbopackIgnore: true*/ file)) {
      const result = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as AutofillResult;
      fs.rmSync(/*turbopackIgnore: true*/ file, { force: true });
      return result;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { state: "timeout" };
}
