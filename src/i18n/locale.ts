import { cookies } from "next/headers";
import { DEFAULT_LOCALE, DICTIONARIES, isLocale, type Dictionary, type Locale } from "./dictionaries";

// The chosen language lives in a cookie, so URLs stay the same in both languages.
// cookies() is request-time data: under Cache Components, call these only inside <Suspense>.

export const LOCALE_COOKIE = "lang";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE; // English unless the user picked Chinese
}

export async function getDictionary(): Promise<Dictionary> {
  return DICTIONARIES[await getLocale()];
}
