import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { getDictionary } from "@/i18n/locale";
import { listBoards } from "@/lib/board-store";
import { DEMO } from "@/lib/demo";
import { LanguageSwitcher } from "./language-switcher";
import { THEME_SCRIPT } from "./theme-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Offer Pilot",
  description: "A personal daily job application tool",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning // THEME_SCRIPT adds the .dark class before React loads
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">
              Offer Pilot
            </Link>
            <Suspense>
              <NavLinks />
              <LanguageSwitcher />
            </Suspense>
          </div>
        </nav>
        {DEMO && (
          <Suspense>
            <DemoBanner />
          </Suspense>
        )}
        {children}
      </body>
    </html>
  );
}

async function DemoBanner() {
  const t = await getDictionary();
  return <p className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{t.demo.banner}</p>;
}

const linkClass = "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white";

async function NavLinks() {
  const t = await getDictionary();
  // On phones the links take their own row below the logo and controls, and scroll sideways when there are many boards
  return (
    <div className="order-last flex w-full items-center gap-x-6 overflow-x-auto whitespace-nowrap sm:order-none sm:w-auto sm:flex-wrap sm:overflow-visible sm:whitespace-normal">
      <Link href="/" className={linkClass}>
        {t.nav.sources}
      </Link>
      {listBoards().map((b) => (
        <Link key={b.id} href={`/boards/${b.slug}`} className={linkClass}>
          {b.name}
        </Link>
      ))}
      <Link href="/boards/new" className="text-blue-700 hover:underline dark:text-blue-300">
        + {t.nav.newBoard}
      </Link>
    </div>
  );
}
