"use client";

import { useEffect } from "react";

// <html lang> is rendered in the static shell, before the language cookie is read; update it here.
export function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
