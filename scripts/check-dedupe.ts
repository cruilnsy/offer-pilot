// Check dedupe keys: pnpm check-dedupe
import { dedupeKey } from "../src/lib/dedupe";

const same: [string, string, string, string][] = [
  ["NakaTomi", "Full-Stack Engineer - Creative Agents", "Nakatomi", "Full-Stack Engineer - Creative Agents"],
  ["Pied Piper", "Senior Frontend Engineer", "PiedPiper, Inc.", "Senior Front-End Engineer"],
  ["Vandelay", "Senior Full Stack Engineer | REMOTE (US or Canada) | $180k-$200k", "Vandelay", "Senior Fullstack Engineer"],
  ["Initech", "Senior Engineer, Full-Stack - Atlas (R6244)", "Initech", "Senior Engineer, Full Stack - Atlas"],
  ["Acme Labs", "Sr. Frontend Engineer (Remote)", "Acme", "Senior Frontend Engineer"],
  ["Wonka", "Staff Web Engineer", "Wonka", "Staff Web Engineer (US)"],
];
const different: [string, string, string, string][] = [
  ["NakaTomi", "Full-Stack Engineer - Creative Agents", "NakaTomi", "Full-Stack Engineer - TomiMusic"],
  ["Soylent Labs", "Senior Frontend Engineer", "Soylent Labs", "Staff Frontend Engineer"],
  ["Dunder", "Software Engineer, Frontend", "Remote", "Software Engineer, Frontend"],
  ["Globex", "Senior Software Engineer, Fullstack (App Experience)", "Globex", "Senior Software Engineer, Fullstack (Consumer Engineering)"],
  ["Aperture", "Software Engineer, Full Stack (Enterprise Lifecycle) (High Seniority)", "Aperture", "Software Engineer, Full Stack (Process Execution)"],
];

let pass = 0;
for (const [c1, t1, c2, t2] of same) {
  const ok = dedupeKey(c1, t1) === dedupeKey(c2, t2);
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} should match: ${dedupeKey(c1, t1)}  vs  ${dedupeKey(c2, t2)}`);
}
for (const [c1, t1, c2, t2] of different) {
  const ok = dedupeKey(c1, t1) !== dedupeKey(c2, t2);
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} should differ: ${dedupeKey(c1, t1)}  vs  ${dedupeKey(c2, t2)}`);
}
const total = same.length + different.length;
console.log(`\n${pass}/${total} passed`);
if (pass !== total) process.exit(1);
