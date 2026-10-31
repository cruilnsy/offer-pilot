// Check the filter rules against sample jobs: pnpm check-filter
import { template } from "../src/lib/board-templates";
import { jobMatcher } from "../src/lib/filter";

// "Testville" stands for a city added to a board, on top of the template's remote rules
const frontend = jobMatcher({ ...template("Frontend"), worldwide: true, cities: ["Testville"] });
const ai = jobMatcher({ ...template("AI"), worldwide: true, cities: ["Testville"] });

const cases: [string, string, string | null, boolean, boolean][] = [
  ["Senior Frontend Engineer", "Remote - USA", null, true, true],
  ["Frontend Engineer, Ads", "Remote - United States", null, true, true],
  ["Full Stack Engineer", "Remote Canada", null, true, false],
  ["Full-Stack Engineer", "United Kingdom", "United Kingdom", true, false],
  ["Senior Engineer, Full-Stack - Atlas", "Testville, California", "US", false, true],
  ["Software Engineer, Frontend", "New York, NY", "US", false, false],
  ["Senior Data Scientist - Consumer Frontend", "Remote - US", null, true, false],
  ["Senior Software Engineer, Backend", "Remote - US", null, true, false],
  ["Staff Frontend Engineer", "United States", null, true, true],
  ["Product Engineer", "Remote", null, true, true],
  ["Senior Product Designer", "Remote - US", null, true, false],
  ["Senior Frontend Engineer", "Anywhere in the World", null, true, true],
  ["Full Stack Developer", "USA Only", null, true, true],
  ["React Developer", "Europe Only", null, true, false],
  ["Frontend Engineer", "Testville, CA, US", "us", false, true],
  ["Senior Software Engineer (Full-stack TypeScript)", "Umbrella | Senior Software Engineer (Full-stack TypeScript) | Copenhagen or London | REMOTE (European time zones) or ONSITE", null, true, false],
  ["Senior Full Stack Engineer", "Vandelay | Senior Full Stack Engineer | REMOTE (US or Canada)", null, true, true],
  ["Frontend Developer", "Remote, join us in Berlin", null, true, false],
  ["Senior Frontend Engineer", "Remote - Portland, OR", null, true, true],
  ["Acme | Senior Full-Stack Engineer (React/TypeScript) | REMOTE (US)", "Acme | Senior Full-Stack Engineer (React/TypeScript) | REMOTE (US)", null, true, true],
];

let pass = 0;
for (const [title, location, country, isRemote, expected] of cases) {
  const matches = frontend({ title, location, country, isRemote });
  const ok = matches === expected;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${title} | ${location} → ${matches ? "match" : "no match"}`);
}

// The AI template
const aiCases: [string, string, string | null, boolean, boolean][] = [
  ["Applied AI Engineer", "Remote - US", null, true, true],
  ["AI Engineer", "Testville, CA", "US", false, true],
  ["Senior Software Engineer, LLM Applications", "Remote - United States", null, true, true],
  ["Product Engineer, Full Stack - Agents", "Remote", null, true, true],
  ["Forward Deployed Engineer (FDE), Healthcare - SF", "Remote - US", null, true, true],
  ["GenAI Developer", "USA Only", null, true, true],
  ["Applied AI Engineer - Tokyo", "Tokyo, Japan", "Japan", false, false],
  ["Applied AI Engineer, Studio", "San Francisco, CA", "US", false, false],
  ["Research Engineer / Research Scientist- Personal AGI (Post Training)", "Remote - US", null, true, false],
  ["Software Engineer, Agent Infrastructure", "Remote - US", null, true, false],
  ["Machine Learning Engineer, Monetization AI/ML", "Remote - US", null, true, false],
  ["AI Support Engineer - San Francisco", "Remote - US", null, true, false],
  ["Applied AI Architect", "Remote - US", null, true, false],
  ["Manager, Applied AI Engineering (Startups)", "Remote - US", null, true, false],
  ["AI Trainer - Writing", "Remote - US", null, true, false],
  ["Senior Frontend Engineer", "Remote - US", null, true, false],
];

let aiPass = 0;
console.log("\nApplied AI jobs:");
for (const [title, location, country, isRemote, expected] of aiCases) {
  const matches = ai({ title, location, country, isRemote });
  const ok = matches === expected;
  if (ok) aiPass++;
  console.log(`${ok ? "✅" : "❌"} ${title} | ${location} → ${matches ? "match" : "no match"}`);
}

console.log(`\nFrontend ${pass}/${cases.length} passed; AI ${aiPass}/${aiCases.length} passed`);
if (pass !== cases.length || aiPass !== aiCases.length) process.exit(1);
