import type { BoardRules } from "./filter";

// Starting points on the "New board" form. Users edit the keywords after picking one.

const JUNIOR_AND_LEADERSHIP = ["intern", "internship", "new grad", "manager", "director", "head of", "principal", "vp"];
const NON_ENGINEERING = ["designer", "recruit*", "sales", "salesforce"];
const OTHER_SPECIALTIES = ["mobile", "ios", "android", "qa", "test*", "data scien*", "analyst", "embedded"];

const usRemote = { require: [], remoteUS: true, worldwide: false, cities: [] };

export interface BoardTemplate {
  name: string;
  rules: BoardRules;
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    name: "Frontend",
    rules: {
      ...usRemote,
      include: ["frontend", "fullstack", "ui", "user interface", "react", "web engineer*", "web developer", "javascript", "typescript", "product engineer*"],
      exclude: [...JUNIOR_AND_LEADERSHIP, ...NON_ENGINEERING, ...OTHER_SPECIALTIES, "react native", "analytics lead"],
    },
  },
  {
    name: "Backend",
    rules: {
      ...usRemote,
      include: ["backend", "api engineer", "distributed systems", "platform engineer", "python engineer", "java engineer", "golang", "node.js"],
      exclude: [...JUNIOR_AND_LEADERSHIP, ...NON_ENGINEERING, "frontend", "mobile", "qa"],
    },
  },
  {
    name: "AI",
    rules: {
      ...usRemote,
      include: ["ai", "artificial intelligence", "llm", "genai", "generative", "agent", "agentic", "forward deployed", "rag", "prompt*"],
      require: ["engineer*", "developer"],
      exclude: [
        ...JUNIOR_AND_LEADERSHIP,
        ...NON_ENGINEERING,
        ...OTHER_SPECIALTIES,
        "research*",
        "scientist",
        "phd",
        "training",
        "machine learning engineer",
        "ml engineer",
        "infra*",
        "kernel",
        "gpu",
        "accelerator",
        "compiler",
        "runtime",
        "performance",
        "network*",
        "datacenter",
        "hardware",
        "security",
        "safety",
        "support engineer",
      ],
    },
  },
  {
    name: "Data",
    rules: {
      ...usRemote,
      include: ["data engineer", "data scientist", "data analyst", "analytics engineer", "machine learning engineer", "etl"],
      exclude: [...JUNIOR_AND_LEADERSHIP, ...NON_ENGINEERING],
    },
  },
  {
    name: "Product",
    rules: {
      ...usRemote,
      include: ["product manager", "product owner", "technical program manager"],
      exclude: ["intern", "internship", "new grad", "director", "vp", "sales"],
    },
  },
  {
    name: "Design",
    rules: {
      ...usRemote,
      include: ["product designer", "ux designer", "ui designer", "visual designer", "ux researcher"],
      exclude: ["intern", "internship", "new grad", "director", "vp", "sales"],
    },
  },
];

export function template(name: string): BoardRules {
  const found = BOARD_TEMPLATES.find((t) => t.name === name);
  if (!found) throw new Error(`Unknown board template: ${name}`);
  return found.rules;
}
