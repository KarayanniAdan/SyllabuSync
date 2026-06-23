/**
 * Test script: validates the full AI extraction pipeline locally.
 * Run with: bun run scripts/test-extract.ts
 */

import "dotenv/config";
import { extractFromEmail } from "../src/lib/extract";
import { saveDeadline, getAllDeadlines } from "../src/lib/db";

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

for (const email of TEST_EMAILS) {
  console.log(`📧 Subject: "${email.subject}"`);
  console.log(`   Body: "${email.body}"`);

  const result = await extractFromEmail(email.subject, email.body);

  if (!result.relevant) {
    console.log("   ❌ Not relevant — skipped\n");
    continue;
  }

  for (const item of result.items) {
    saveDeadline(item);
    console.log(`   ✅ Extracted: [${item.course}] ${item.title} — ${item.type} — ${item.displayDate}`);
    console.log(`      Source: "${item.sourceSentence}"`);
  }
  console.log();
}

const all = getAllDeadlines();
console.log(`\n📋 Total items in data.json: ${all.length}`);
