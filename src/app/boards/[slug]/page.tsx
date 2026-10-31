import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Board } from "@/db/schema";
import { getDictionary } from "@/i18n/locale";
import type { Dictionary } from "@/i18n/dictionaries";
import { getBoard } from "@/lib/board-store";
import { Dashboard } from "../../job-list";

const SHOWN_KEYWORDS = 6;

export async function generateMetadata({ params }: PageProps<"/boards/[slug]">) {
  const board = getBoard((await params).slug);
  return { title: board ? `${board.name} · Offer Pilot` : "Offer Pilot" };
}

export default function BoardPage({ params, searchParams }: PageProps<"/boards/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<p className="text-neutral-500">…</p>}>
        <BoardContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BoardContent({ params, searchParams }: PageProps<"/boards/[slug]">) {
  const { slug } = await params;
  const board = getBoard(slug);
  if (!board) notFound();
  const t = await getDictionary();
  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{board.name}</h1>
          <p className="text-sm text-neutral-500">{summary(board, t)}</p>
        </div>
        <Link href={`/boards/${board.slug}/edit`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
          {t.boards.edit}
        </Link>
      </header>
      <Dashboard board={board} searchParams={searchParams} />
    </>
  );
}

function summary(board: Board, t: Dictionary) {
  const hidden = board.include.length - SHOWN_KEYWORDS;
  const keywords = board.include.slice(0, SHOWN_KEYWORDS).join(", ") + (hidden > 0 ? ` +${hidden}` : "");
  const places = [board.remoteUS && t.boards.remoteUS, board.worldwide && t.boards.worldwide, ...board.cities].filter(Boolean);
  return `${keywords} · ${places.length ? places.join(", ") : t.boards.anyLocation}`;
}
