// Board rules: keyword matching, location options, input cleaning and search terms.
// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_TEMPLATES, template } from "../src/lib/board-templates";
import { cleanRules, jobMatcher, searchTerms, titleMatcher, type BoardRules } from "../src/lib/filter";

const rules = (r: Partial<BoardRules>): BoardRules => ({ include: [], exclude: [], require: [], remoteUS: false, worldwide: false, cities: [], ...r });
const title = (r: Partial<BoardRules>, t: string) => titleMatcher(rules(r))(t);
const job = (location: string, extra = {}) => ({ title: "Data Engineer", location, country: null, isRemote: false, ...extra });

test("keywords ignore case and punctuation, and spelling variants match", () => {
  for (const t of ["Front End Engineer", "front-end engineer", "FRONTEND ENGINEER"]) assert.ok(title({ include: ["frontend"] }, t), t);
  for (const t of ["Frontend Engineer", "Front-End Engineer"]) assert.ok(title({ include: ["front end"] }, t), t);
  assert.ok(title({ include: ["full stack"] }, "Fullstack Developer"));
  assert.ok(title({ include: ["Senior"] }, "SENIOR Engineer"));
});

test("keywords match whole words, plurals, and prefixes with *", () => {
  assert.ok(!title({ include: ["ai"] }, "Email Engineer"));
  assert.ok(!title({ include: ["react"] }, "Reactive Systems Engineer"));
  assert.ok(title({ include: ["agent"] }, "Agents Engineer"));
  assert.ok(title({ include: ["recruit*"] }, "Technical Recruiter"));
  assert.ok(title({ include: ["data scien*"] }, "Data Science Lead"));
  assert.ok(title({ include: ["engineer"], exclude: ["intern"] }, "Internal Tools Engineer"), "intern must not hide Internal");
  assert.ok(!title({ include: ["product engineer*"] }, "Finance Lead, Product & Engineering"));
});

test("symbols and non-Latin keywords work, and regex characters are plain text", () => {
  assert.ok(title({ include: ["c++"] }, "C++ Developer"));
  assert.ok(title({ include: ["node.js"] }, "Senior Node.js Engineer"));
  assert.ok(title({ include: ["前端"] }, "高级 前端 工程师"));
  assert.ok(!title({ include: ["a.b"] }, "axb Engineer"));
  assert.doesNotThrow(() => title({ include: ["(unclosed"] }, "Engineer"));
});

test("exclude wins, require must also match, and an empty include matches nothing", () => {
  assert.ok(!title({ include: ["engineer"], exclude: ["manager"] }, "Engineer Manager"));
  assert.ok(!title({ include: ["ai"], require: ["engineer*"] }, "AI Trainer"));
  assert.ok(title({ include: ["ai"], require: ["engineer*"] }, "AI Engineering Lead"));
  assert.ok(!title({}, "Anything"));
});

test("location options: none set means anywhere; cities and remote options add up", () => {
  const data = { include: ["data engineer"] };
  assert.ok(jobMatcher(rules(data))(job("Tokyo, Japan")));
  const city = jobMatcher(rules({ ...data, cities: ["Austin", "Berlin"] }));
  assert.ok(city(job("Austin, TX")));
  assert.ok(city(job("Berlin, Germany", { country: "Germany" })), "a named city wins over the country");
  assert.ok(!city(job("Remote - US", { isRemote: true })));
  const remote = jobMatcher(rules({ ...data, remoteUS: true }));
  assert.ok(remote(job("Remote - US", { isRemote: true })));
  assert.ok(remote(job("Washington, DC", { country: "US", isRemote: true })), "the source's country counts");
  assert.ok(!remote(job("Remote Canada", { isRemote: true })));
  assert.ok(!remote(job("Anywhere in the World", { isRemote: true })));
  assert.ok(jobMatcher(rules({ ...data, worldwide: true }))(job("Anywhere in the World", { isRemote: true })));
});

test("cleanRules keeps only safe input from the browser", () => {
  const r = cleanRules({ include: [" react ", "react", "", 7, null, "x".repeat(99)], remoteUS: "yes", cities: "Austin" });
  assert.deepEqual(r.include, ["react", "x".repeat(60)]);
  assert.equal(r.remoteUS, false);
  assert.deepEqual(r.cities, []);
  assert.equal(cleanRules({ include: Array.from({ length: 500 }, (_, i) => `k${i}`) }).include.length, 100);
});

test("search terms drop wildcards and give short words a role", () => {
  assert.deepEqual(searchTerms(rules({ include: ["ai", "prompt*", "frontend"], require: ["engineer*"] })), ["ai engineer", "prompt", "frontend"]);
  assert.deepEqual(searchTerms(rules({ include: ["ui"] })), ["ui engineer"]);
});

test("every template finds a typical job and keeps personal locations out", () => {
  const typical: Record<string, string> = {
    Frontend: "Senior Frontend Engineer",
    Backend: "Senior Backend Engineer",
    AI: "Applied AI Engineer",
    Data: "Senior Data Engineer",
    Product: "Senior Product Manager",
    Design: "Senior Product Designer",
  };
  assert.deepEqual(Object.keys(typical).sort(), BOARD_TEMPLATES.map((t) => t.name).sort());
  for (const [name, jobTitle] of Object.entries(typical)) {
    assert.ok(jobMatcher(template(name))({ title: jobTitle, location: "Remote - US", country: null, isRemote: true }), name);
    assert.deepEqual(template(name).cities, [], name);
  }
  assert.throws(() => template("Nope"));
});
