/**
 * Test script: validates the full AI extraction pipeline locally.
 * Run with: bun run scripts/test-extract.ts
 */

import "dotenv/config";
import { extractFromEmail } from "../src/lib/extract";
import { saveDeadline, getAllDeadlines } from "../src/lib/db";

function hasValidAbsoluteDueAt(dueAt: string): boolean {
  if (!dueAt || !/^\d{4}-\d{2}-\d{2}T/.test(dueAt)) return false;
  return !Number.isNaN(Date.parse(dueAt));
}

function looksVagueDisplayDate(displayDate: string): boolean {
  const text = displayDate.trim();
  if (!text) return true;
  if (/\b(tbd|to be announced|unknown|n\/a|soon|later)\b/i.test(text)) return true;
  return !/\b\d{4}\b/.test(text);
}

const WEEKDAY_BY_NAME: Array<{ pattern: RegExp; day: number }> = [
  { pattern: /sunday|ראשון/i, day: 0 },
  { pattern: /monday|שני/i, day: 1 },
  { pattern: /tuesday|שלישי/i, day: 2 },
  { pattern: /wednesday|רביעי/i, day: 3 },
  { pattern: /thursday|חמישי/i, day: 4 },
  { pattern: /friday|שישי/i, day: 5 },
  { pattern: /saturday|שבת/i, day: 6 },
];

function expectedWeekdayFromSource(sourceSentence: string): number | null {
  for (const { pattern, day } of WEEKDAY_BY_NAME) {
    if (pattern.test(sourceSentence)) return day;
  }
  return null;
}

const TEST_EMAILS = [
  {
    subject: "OS Assignment Update",
    body: "HW3 in Operating Systems must be submitted by Sunday at 23:59. Please upload to the course portal.",
  },
  {
    subject: "Linear Algebra Quiz",
    body: "Quiz 3 will take place on Wednesday at 10:30 in room 101. The quiz covers chapters 4 and 5.",
  },
  {
    subject: "Hackathon 2025",
    body: "Registration for the annual university hackathon closes on July 10. Teams of 2-4 students. Register at hackathon.technion.ac.il",
  },
];

console.log("🔍 Testing AI extraction pipeline...\n");

let qualityFlags = 0;

for (const email of TEST_EMAILS) {
  console.log(`📧 Subject: "${email.subject}"`);
  console.log(`   Body: "${email.body}"`);

  const result = await extractFromEmail(email.subject, email.body);

  if (!result.relevant) {
    console.log("   ❌ Not relevant — skipped\n");
    continue;
  }

  for (const item of result.items) {
    const hasAbsoluteDueAt = hasValidAbsoluteDueAt(item.dueAt);
    const vagueDisplay = looksVagueDisplayDate(item.displayDate);

    if (!hasAbsoluteDueAt && vagueDisplay) {
      qualityFlags += 1;
      console.log("   ⚠️  Quality flag: missing concrete dueAt and vague displayDate");
    }

    const expectedWeekday = expectedWeekdayFromSource(item.sourceSentence);
    if (expectedWeekday !== null && hasAbsoluteDueAt) {
      const actualWeekday = new Date(item.dueAt).getUTCDay();
      if (actualWeekday !== expectedWeekday) {
        qualityFlags += 1;
        console.log("   ⚠️  Quality flag: weekday in dueAt does not match source sentence");
      }
    }

    saveDeadline(item);
    console.log(
      `   ✅ Extracted: [${item.course}] ${item.title} — ${item.type} — ${item.displayDate}`,
    );
    console.log(`      Source: "${item.sourceSentence}"`);
  }
  console.log();
}

const all = getAllDeadlines();
console.log(`\n📋 Total items in data.json: ${all.length}`);

if (qualityFlags > 0) {
  console.log(`⚠️  Extraction quality flags: ${qualityFlags}`);
  process.exitCode = 1;
} else {
  console.log("✅ Extraction quality checks passed");
}
