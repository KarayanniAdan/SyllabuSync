/**
 * Offline tests for homework section classification.
 * Run with: bun run scripts/test-homework-sections.ts
 */

import { classifyHomework } from "../src/lib/homework-sections";

let failures = 0;
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}

const NOW = Date.parse("2026-12-10T12:00:00Z");
const future = "2026-12-15T23:59:00+02:00";
const past = "2026-12-01T23:59:00+02:00";
const none = new Set<string>();

check("future unfinished -> active", classifyHomework({ id: "a", dueAt: future }, none, NOW) === "active");
check("expired unfinished -> past", classifyHomework({ id: "a", dueAt: past }, none, NOW) === "past");
check("deadline exactly now -> past", classifyHomework({ id: "a", dueAt: "2026-12-10T12:00:00Z" }, none, NOW) === "past");
check("empty deadline -> active", classifyHomework({ id: "a", dueAt: "" }, none, NOW) === "active");
check("invalid deadline -> active", classifyHomework({ id: "a", dueAt: "TBD" }, none, NOW) === "active");
check("completed future -> completed", classifyHomework({ id: "a", dueAt: future }, new Set(["a"]), NOW) === "completed");
check("completed expired -> completed", classifyHomework({ id: "a", dueAt: past }, new Set(["a"]), NOW) === "completed");
check("completed no deadline -> completed", classifyHomework({ id: "a", dueAt: "" }, new Set(["a"]), NOW) === "completed");

// Undo completion returns to the section matching the current deadline.
check("undo on expired -> past", classifyHomework({ id: "a", dueAt: past }, none, NOW) === "past");
check("undo on future -> active", classifyHomework({ id: "a", dueAt: future }, none, NOW) === "active");

// An extended deadline brings unfinished homework back to active.
check("extended deadline -> active", classifyHomework({ id: "a", dueAt: future }, none, NOW) === "active");

// Time passing moves an item from active to past.
const dueSoon = "2026-12-10T12:30:00Z";
check("before deadline -> active", classifyHomework({ id: "a", dueAt: dueSoon }, none, NOW) === "active");
check("after deadline -> past", classifyHomework({ id: "a", dueAt: dueSoon }, none, NOW + 31 * 60_000) === "past");

// Each item appears in exactly one section.
const items = [
  { id: "1", dueAt: future },
  { id: "2", dueAt: past },
  { id: "3", dueAt: "" },
  { id: "4", dueAt: past },
  { id: "5", dueAt: future },
];
const done = new Set(["4", "5"]);
const counts = { active: 0, past: 0, completed: 0 };
for (const item of items) counts[classifyHomework(item, done, NOW)] += 1;
check(
  "sections partition all items exactly once",
  counts.active + counts.past + counts.completed === items.length &&
    counts.active === 2 &&
    counts.past === 1 &&
    counts.completed === 2,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll homework section checks passed");
