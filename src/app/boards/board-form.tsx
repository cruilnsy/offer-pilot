"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { BoardTemplate } from "@/lib/board-templates";
import type { BoardRules } from "@/lib/filter";
import { previewBoard, removeBoard, saveBoard } from "../actions";

const PREVIEW_DELAY_MS = 250;
const EMPTY: BoardRules = { include: [], exclude: [], require: [], remoteUS: true, worldwide: false, cities: [] };

type Preview = Awaited<ReturnType<typeof previewBoard>>;

interface Props {
  t: Dictionary["boards"];
  templates: BoardTemplate[]; // empty when editing
  board?: { id: number; name: string; rules: BoardRules };
  readOnly: boolean;
}

export function BoardForm({ t, templates, board, readOnly }: Props) {
  const [name, setName] = useState(board?.name ?? "");
  const [rules, setRules] = useState(board?.rules ?? EMPTY);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();
  const latest = useRef(0); // only the newest preview request may update the page

  const set = <K extends keyof BoardRules>(key: K, value: BoardRules[K]) => setRules((r) => ({ ...r, [key]: value }));

  useEffect(() => {
    const request = ++latest.current;
    const timer = setTimeout(() => {
      if (!rules.include.length) return setPreview(null);
      previewBoard(rules).then((p) => {
        if (request === latest.current) setPreview(p);
      });
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [rules]);

  const submit = () =>
    startSaving(async () => {
      setError("");
      try {
        await saveBoard(board?.id ?? null, name, rules);
      } catch (e) {
        // A successful save navigates away by throwing Next's redirect signal, which must pass through
        if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
        setError(t.saveFailed);
      }
    });

  const remove = () => {
    if (board && window.confirm(t.confirmDelete)) startSaving(() => removeBoard(board.id));
  };

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_18rem]">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {templates.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium">{t.startFrom}</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => {
                    setName(tpl.name);
                    setRules(tpl.rules);
                  }}
                  className="rounded-full bg-neutral-100 px-3 py-1 text-sm hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  {tpl.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setName("");
                  setRules(EMPTY);
                }}
                className="rounded-full px-3 py-1 text-sm text-neutral-600 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-100 dark:text-neutral-300 dark:ring-neutral-700 dark:hover:bg-neutral-800"
              >
                {t.blank}
              </button>
            </div>
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
            placeholder={t.namePlaceholder}
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-700"
          />
        </label>

        <TagInput label={t.include} hint={t.includeHint} placeholder={t.tagPlaceholder} tags={rules.include} onChange={(v) => set("include", v)} />
        <TagInput label={t.exclude} hint={t.excludeHint} placeholder={t.tagPlaceholder} tags={rules.exclude} onChange={(v) => set("exclude", v)} />

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t.location}</legend>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rules.remoteUS} onChange={(e) => set("remoteUS", e.target.checked)} />
              {t.remoteUS}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rules.worldwide} onChange={(e) => set("worldwide", e.target.checked)} />
              {t.worldwide}
            </label>
          </div>
        </fieldset>
        <TagInput label={t.cities} hint={t.citiesHint} placeholder={t.tagPlaceholder} tags={rules.cities} onChange={(v) => set("cities", v)} />

        <details open={rules.require.length > 0}>
          <summary className="cursor-pointer text-sm text-neutral-500">{t.advanced}</summary>
          <div className="mt-3">
            <TagInput label={t.require} hint={t.requireHint} placeholder={t.tagPlaceholder} tags={rules.require} onChange={(v) => set("require", v)} />
          </div>
        </details>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {readOnly && <p className="text-sm text-amber-800 dark:text-amber-300">{t.demoSave}</p>}

        <div className="flex items-center gap-3">
          <button
            disabled={readOnly || saving || !name.trim() || !rules.include.length}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
          {board && (
            <button
              type="button"
              onClick={remove}
              disabled={readOnly || saving}
              className="ml-auto rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950"
            >
              {t.delete}
            </button>
          )}
        </div>
      </form>

      <aside aria-live="polite" className="self-start rounded-lg bg-neutral-50 p-4 md:sticky md:top-4 dark:bg-neutral-900">
        <h2 className="text-sm font-medium text-neutral-500">{t.preview}</h2>
        {!rules.include.length ? (
          <p className="mt-2 text-sm text-neutral-500">{t.previewEmpty}</p>
        ) : preview ? (
          <>
            <p className="mt-1 text-lg font-semibold">{preview.count === 0 ? t.previewNone : t.previewCount.replace("{n}", String(preview.count))}</p>
            <ul className="mt-3 space-y-3">
              {preview.sample.map((j) => (
                <li key={j.key} className="text-sm">
                  <p className="text-xs text-neutral-500">{j.company}</p>
                  <p className="font-medium">{j.title}</p>
                  <p className="truncate text-xs text-neutral-500">{j.location}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-neutral-500">{t.previewNote}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">…</p>
        )}
      </aside>
    </div>
  );
}

function TagInput({
  label,
  hint,
  placeholder,
  tags,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const word = draft.trim();
    if (word && !tags.includes(word)) onChange([...tags, word]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // Enter is picking a word in a Chinese or Japanese input method
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div>
      <label className="block">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mb-1.5 block text-xs text-neutral-500">{hint}</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={placeholder}
          className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-700"
        />
      </label>
      {tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="flex items-center gap-1 rounded bg-blue-50 pl-2 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100">
              {tag}
              <button type="button" aria-label={`${label}: ${tag} ×`} onClick={() => onChange(tags.filter((t) => t !== tag))} className="px-1.5 text-blue-500 hover:text-blue-900 dark:hover:text-white">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
