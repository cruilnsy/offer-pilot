import { decodeHtml, htmlToText } from "../ats/text";
import type { BoardJob } from "../ats/types";

const FEEDS = ["remote-front-end-programming-jobs", "remote-full-stack-programming-jobs"];

function field(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decodeHtml(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "")).trim() : "";
}

export async function fetchWeWorkRemotely(): Promise<BoardJob[]> {
  const jobs = new Map<string, BoardJob>();
  for (const feed of FEEDS) {
    const res = await fetch(`https://weworkremotely.com/categories/${feed}.rss`, {
      signal: AbortSignal.timeout(30_000),
      headers: { "User-Agent": "offer-pilot (personal job search)" },
    });
    if (!res.ok) throw new Error(`We Work Remotely ${feed}: HTTP ${res.status}`);
    const xml = await res.text();

    for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const link = field(item, "link");
      const id = link.split("/").filter(Boolean).pop() ?? link;
      // titles look like "Company: Role"
      const rawTitle = field(item, "title");
      const sep = rawTitle.indexOf(": ");
      const pubDate = field(item, "pubDate");
      jobs.set(id, {
        companyName: sep > 0 ? rawTitle.slice(0, sep) : "Unknown",
        externalId: id,
        title: sep > 0 ? rawTitle.slice(sep + 2) : rawTitle,
        location: [field(item, "region"), field(item, "state"), field(item, "country")].filter(Boolean).join(", "),
        country: null,
        isRemote: true, // this board only lists remote jobs
        department: field(item, "category") || null,
        compensation: null,
        url: link,
        applyUrl: link,
        descriptionText: htmlToText(field(item, "description")),
        postedAt: pubDate ? new Date(pubDate).toISOString() : null,
      });
    }
  }
  return [...jobs.values()];
}
