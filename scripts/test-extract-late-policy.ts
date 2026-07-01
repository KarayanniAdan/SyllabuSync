/**
 * Regression script: verifies primary-deadline policy for late-submission emails.
 * Run with: bun run scripts/test-extract-late-policy.ts
 */

import type { DeadlineItem } from "../src/data/mockDeadlineItems";
import { enforcePrimaryDeadlinePolicy } from "../src/lib/extract";
import { buildAcademicDueAtIso, parseDeadlineDueAt } from "../src/lib/timezone";

function toDateKey(dueAt: string): string {
  const parsed = parseDeadlineDueAt(dueAt);
  if (!parsed) throw new Error(`Invalid dueAt: ${dueAt}`);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "0");

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function makeBaseItem(dueAt: string, sourceSentence: string): DeadlineItem {
  return {
    id: "test-item",
    category: "Course",
    course: "General",
    title: "HW",
    type: "Homework",
    dueAt,
    displayDate: "",
    description: "",
    status: "Upcoming",
    sourceSentence,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const due12 = buildAcademicDueAtIso(2026, 7, 12, 23, 59);
const due15 = buildAcademicDueAtIso(2026, 7, 15, 23, 59);

// Case 1: normal due + penalized late window => main dueAt must be the normal date.
{
  const source = "Homework is due on 12/7. Late submission is open until 15/7. Each late day deducts 5 points.";
  const emailText = source;
  const item = makeBaseItem(due15, source);
  const enforced = enforcePrimaryDeadlinePolicy(item, emailText);

  assert(enforced !== null, "Case 1 should keep an item");
  assert(toDateKey(enforced.dueAt) === "2026-07-12", "Case 1 failed: expected main deadline 12/7");
}

// Case 2: explicit extension without penalty => extended date remains the main dueAt.
{
  const source = "The deadline was extended to 15/7.";
  const emailText = source;
  const item = makeBaseItem(due15, source);
  const enforced = enforcePrimaryDeadlinePolicy(item, emailText);

  assert(enforced !== null, "Case 2 should keep an item");
  assert(toDateKey(enforced.dueAt) === "2026-07-15", "Case 2 failed: expected extended deadline 15/7");
}

// Case 3: only penalized late-submission close date and no normal due date => reject item.
{
  const source = "Late submission closes 15/7 with penalty of 5 points deducted per day.";
  const emailText = source;
  const item = makeBaseItem(due15, source);
  const enforced = enforcePrimaryDeadlinePolicy(item, emailText);

  assert(enforced === null, "Case 3 failed: expected late-submission-only item to be rejected");
}

console.log("Primary-deadline late-submission policy tests passed.");
