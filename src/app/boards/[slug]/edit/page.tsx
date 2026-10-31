import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDictionary } from "@/i18n/locale";
import { getBoard } from "@/lib/board-store";
import { DEMO } from "@/lib/demo";
import { BoardForm } from "../../board-form";

export async function generateMetadata() {
  return { title: `${(await getDictionary()).boards.editTitle} · Offer Pilot` };
}

export default function EditBoardPage({ params }: PageProps<"/boards/[slug]/edit">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Suspense fallback={<p className="text-neutral-500">…</p>}>
        <EditBoard params={params} />
      </Suspense>
    </main>
  );
}

async function EditBoard({ params }: Pick<PageProps<"/boards/[slug]/edit">, "params">) {
  const { slug } = await params;
  const board = getBoard(slug);
  if (!board) notFound();
  const { boards: t } = await getDictionary();
  const { id, name, include, exclude, require, remoteUS, worldwide, cities } = board;
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t.editTitle}</h1>
      <BoardForm t={t} templates={[]} board={{ id, name, rules: { include, exclude, require, remoteUS, worldwide, cities } }} readOnly={DEMO} />
    </>
  );
}
