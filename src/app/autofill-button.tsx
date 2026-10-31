"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { AutofillResult } from "@/lib/autofill/status";
import { startAutofill } from "./actions";

const STATE_CLASS: Record<AutofillResult["state"], string> = {
  filled: "text-green-700 dark:text-green-400",
  opened: "text-neutral-600 dark:text-neutral-400",
  login: "text-neutral-600 dark:text-neutral-400",
  timeout: "text-neutral-600 dark:text-neutral-400",
  busy: "text-red-600",
  failed: "text-red-600",
};

interface Props {
  id: string;
  label: string;
  hint: string;
  disabled: boolean;
  t: Dictionary["jobs"]["autofillStatus"];
}

export function AutofillButton({ id, label, hint, disabled, t }: Props) {
  const [result, action, pending] = useActionState(startAutofill, null);
  const message = result && t[result.state].replace("{filled}", String(result.filled ?? 0)).replace("{manual}", String(result.manual ?? 0));
  return (
    <form action={action} className="flex flex-col items-start">
      <input type="hidden" name="id" value={id} />
      <button
        disabled={disabled || pending}
        title={hint}
        className="rounded-md border border-blue-600 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950"
      >
        {pending ? t.opening : label}
      </button>
      {!pending && message && (
        <p role="status" className={`mt-1 max-w-56 text-xs ${STATE_CLASS[result.state]}`}>
          {message}
        </p>
      )}
    </form>
  );
}
