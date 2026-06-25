/**
 * Targeted regression: semantic duplicate matching in saveDeadline/getAllDeadlines.
 * Run with: bun run scripts/test-semantic-dedupe.ts
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import type { DeadlineItem } from "../src/data/mockDeadlineItems";
import { getAllDeadlines, saveDeadline } from "../src/lib/db";

const DATA_PATH = join(process.cwd(), "data.json");

function fail(message: string): never {
  throw new Error(message);
}

function assertTrue(value: boolean, label: string): void {
  if (!value) fail(`${label}: expected true`);
}

function makeHomework(title: string, dueAt: string, description: string): DeadlineItem {
  return {
    id: randomUUID(),
    course: "Operating Systems",
    title,
    type: "Homework",
    dueAt,
    displayDate: dueAt,
    description,
    status: "Upcoming",
    sourceSentence: description,
  };
}

const hadDataFile = existsSync(DATA_PATH);
const originalData = hadDataFile ? readFileSync(DATA_PATH, "utf-8") : "";

try {
  writeFileSync(DATA_PATH, JSON.stringify([], null, 2), "utf-8");

  saveDeadline(makeHomework("HW3", "2026-07-01T23:59:00", "HW3 initial publish"));
  saveDeadline(makeHomework("Homework 3", "2026-07-02T23:59:00", "Homework 3 update"));
  saveDeadline(makeHomework("HW 3", "2026-07-03T23:59:00", "HW 3 final update"));

  // Far-future same title should stay separate (likely different semester window).
  saveDeadline(makeHomework("HW3", "2027-03-01T23:59:00", "HW3 next semester"));

  const all = getAllDeadlines();
  const hwItems = all.filter(
    (item) => item.course === "Operating Systems" && item.type === "Homework",
  );

  assertTrue(hwItems.length === 2, "semantic dedupe should keep two homework items");
  assertTrue(
    hwItems.some((item) => item.dueAt === "2026-07-03T23:59:00"),
    "semantic dedupe should keep latest dueAt for the merged HW3 item",
  );
  assertTrue(
    hwItems.some((item) => item.dueAt === "2027-03-01T23:59:00"),
    "semantic dedupe should preserve far-future HW3 as a separate item",
  );

  console.log("✅ Semantic dedupe regression checks passed");
} finally {
  if (hadDataFile) {
    writeFileSync(DATA_PATH, originalData, "utf-8");
  } else if (existsSync(DATA_PATH)) {
    unlinkSync(DATA_PATH);
  }
}
