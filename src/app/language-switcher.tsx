import { getLocale } from "@/i18n/locale";
import { DICTIONARIES, LOCALES } from "@/i18n/dictionaries";
import { setLocale } from "./actions";
import { HtmlLang } from "./html-lang";
import { ThemeToggle } from "./theme-toggle";

const NAMES = { zh: "中文", en: "EN" } as const;

// Top-right controls: theme, then language. The language toggle is a plain form + Server Action, so it works without client JS.
export async function LanguageSwitcher() {
  const locale = await getLocale();
  const t = DICTIONARIES[locale];
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 sm:order-last">
      <ThemeToggle label={t.nav.theme} />
      <form action={setLocale} aria-label={t.nav.language} className="flex overflow-hidden rounded-md border border-neutral-300 text-xs dark:border-neutral-700">
        <HtmlLang lang={t.htmlLang} />
        {LOCALES.map((l) => (
          <button
            key={l}
            name="locale"
            value={l}
            aria-pressed={l === locale}
            className={`px-2.5 py-1 ${
              l === locale ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            {NAMES[l]}
          </button>
        ))}
      </form>
    </div>
  );
}
