import { Suspense } from "react";
import { getDictionary } from "@/i18n/locale";
import { BOARD_TEMPLATES } from "@/lib/board-templates";
import { DEMO } from "@/lib/demo";
import { BoardForm } from "../board-form";

export async function generateMetadata() {
  return { title: (await getDictionary()).meta.newBoard };
}

export default function NewBoardPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<p className="text-neutral-500">…</p>}>
        <NewBoard />
      </Suspense>
    </main>
  );
}

async function NewBoard() {
  const { boards: t } = await getDictionary();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t.newTitle}</h1>
      <BoardForm t={t} templates={BOARD_TEMPLATES} readOnly={DEMO} />
    </>
  );
}
