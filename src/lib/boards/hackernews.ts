import { decodeHtml, fetchJson, htmlToText } from "../ats/text";
import type { BoardJob } from "../ats/types";

// The monthly "Ask HN: Who is hiring?" thread (first weekday of the month), read via the free Algolia API
interface HnSearch {
  hits: { objectID: string; title: string; created_at: string }[];
}
interface HnItem {
  id: number;
  created_at: string;
  text: string | null;
  children: HnItem[];
}

/** The first line is usually "Company | Role | Location | Remote | Link"; separators may also be — or – */
function parseFirstLine(html: string) {
  const firstLine = decodeHtml(html.split(/<p>/i)[0].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  const parts = firstLine.split(/\s*[|—–]\s*|\s+-\s+/);
  const company = parts[0]
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
  // Display title: drop the leading company name, keep "Role | Location | …"
  const title =
    parts
      .slice(1)
      .filter((p) => p && !/^(https?:\/\/|www\.)\S+$/i.test(p)) // drop parts that are just a URL
      .join(" | ") || firstLine;
  return { firstLine, company: company || "Unknown", title };
}

function firstExternalLink(html: string): string | null {
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = decodeHtml(m[1]);
    if (!href.includes("news.ycombinator.com")) return href;
  }
  return null;
}

export async function fetchHackerNews(): Promise<BoardJob[]> {
  const search = await fetchJson<HnSearch>(
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=who%20is%20hiring",
    { label: "Hacker News search" },
  );
  const story = search.hits.find((h) => /who is hiring/i.test(h.title));
  if (!story) throw new Error("Hacker News: no 'Who is hiring?' thread found");

  const thread = await fetchJson<HnItem>(`https://hn.algolia.com/api/v1/items/${story.objectID}`, { label: "Hacker News thread" });

  return thread.children
    .filter((c) => c.text) // skip deleted comments
    .map((c) => {
      const { firstLine, company, title } = parseFirstLine(c.text!);
      return {
        companyName: company,
        externalId: String(c.id),
        title: title.slice(0, 200),
        location: firstLine.slice(0, 200), // the location is in the first line too; the filter rules decide
        country: null,
        isRemote: /remote/i.test(firstLine),
        department: null,
        compensation: null,
        url: `https://news.ycombinator.com/item?id=${c.id}`,
        applyUrl: firstExternalLink(c.text!),
        descriptionText: htmlToText(c.text),
        postedAt: c.created_at,
      };
    });
}
