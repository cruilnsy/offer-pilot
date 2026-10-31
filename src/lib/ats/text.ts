const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return m;
  });
}

/** HTML → plain text. Greenhouse content is escaped HTML, so decode once to get real tags */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  let s = html.includes("&lt;") ? decodeEntities(html) : html;
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim() || null;
}

export function decodeHtml(s: string): string {
  return decodeEntities(s);
}

/** Company name → slug, e.g. "Pied Piper, Inc." → "pied-piper-inc" */
export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "unknown";
}

/** fetch with retries: on 429 (too many requests) or 5xx, wait and try again */
export async function fetchJson<T>(url: string, init: { retries?: number; label: string }): Promise<T> {
  const retries = init.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "offer-pilot (personal job search)" } });
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) throw new Error(`${init.label}: HTTP ${res.status}`);
    const wait = Number(res.headers.get("retry-after")) * 1000 || 5000 * 2 ** attempt; // 5s, 10s, 20s
    await new Promise((r) => setTimeout(r, wait));
  }
}
