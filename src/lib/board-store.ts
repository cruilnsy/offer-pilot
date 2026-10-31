import { asc, eq, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Board } from "@/db/schema";
import { slugify } from "./ats/text";
import type { BoardRules } from "./filter";

const { boards } = schema;

export function listBoards(): Board[] {
  return db.select().from(boards).orderBy(asc(boards.position), asc(boards.id)).all();
}

export function getBoard(slug: string): Board | undefined {
  return db.select().from(boards).where(eq(boards.slug, slug)).get();
}

// Names can be all non-Latin, and "new" is the /boards/new route
function uniqueSlug(name: string): string {
  const base = slugify(name) || "board";
  const taken = new Set([...listBoards().map((b) => b.slug), "new"]);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export function createBoard(name: string, rules: BoardRules): Board {
  const [{ last }] = db.select({ last: max(boards.position) }).from(boards).all();
  return db
    .insert(boards)
    .values({ ...rules, name, slug: uniqueSlug(name), position: (last ?? 0) + 1 })
    .returning()
    .get();
}

/** The slug stays the same on rename, so saved links keep working. */
export function updateBoard(id: number, name: string, rules: BoardRules): Board | undefined {
  return db.update(boards).set({ ...rules, name }).where(eq(boards.id, id)).returning().get();
}

export function deleteBoard(id: number) {
  db.delete(boards).where(eq(boards.id, id)).run();
}
