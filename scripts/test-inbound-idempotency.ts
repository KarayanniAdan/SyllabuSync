/**
 * Targeted regression: inbound idempotency key behavior.
 * Run with: bun run scripts/test-inbound-idempotency.ts
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import {
  buildInboundIdempotencyKey,
  buildFallbackIdempotencyKey,
} from "../src/lib/inbound-idempotency";
import { isMessageProcessed, markMessageProcessed } from "../src/lib/db";

const PROCESSED_PATH = join(process.cwd(), "processed-messages.json");

function fail(message: string): never {
  throw new Error(message);
}

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    fail(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value: boolean, label: string): void {
  if (!value) fail(`${label}: expected true`);
}

const hadProcessedFile = existsSync(PROCESSED_PATH);
const originalProcessed = hadProcessedFile ? readFileSync(PROCESSED_PATH, "utf-8") : "";

try {
  writeFileSync(PROCESSED_PATH, JSON.stringify([], null, 2), "utf-8");

  const subject = "OS Assignment Update";
  const emailBody = "HW3 in Operating Systems due Sunday at 23:59.";
  const emailFrom = "course-staff@technion.ac.il";

  const keyA = buildInboundIdempotencyKey(subject, emailBody, emailFrom, "<ABC123@mail.gmail.com>");
  const keyB = buildInboundIdempotencyKey(subject, emailBody, emailFrom, " abc123@mail.gmail.com ");
  assertEqual(keyA, keyB, "normalized gmail message-id should map to same key");

  markMessageProcessed(keyA);
  assertTrue(isMessageProcessed(keyB), "processed lookup should hit for normalized id variants");

  const fallbackA = buildInboundIdempotencyKey(
    "  Hackathon 2025  ",
    "Registration closes on July 10.   ",
    "Events@Technion.ac.il",
    null,
  );
  const fallbackB = buildInboundIdempotencyKey(
    "hackathon 2025",
    " registration closes on july 10.",
    "events@technion.ac.il",
    "",
  );
  assertEqual(
    fallbackA,
    fallbackB,
    "fallback signature should be stable across case and whitespace changes",
  );
  assertTrue(fallbackA.startsWith("sig:"), "fallback key should use sig prefix");

  const directFallback = buildFallbackIdempotencyKey(
    "hackathon 2025",
    "registration closes on july 10.",
    "events@technion.ac.il",
  );
  assertEqual(
    fallbackB,
    directFallback,
    "buildInboundIdempotencyKey should match direct fallback builder",
  );

  markMessageProcessed(fallbackA);
  assertTrue(
    isMessageProcessed(fallbackB),
    "processed lookup should hit for fallback signature variants",
  );

  console.log("✅ Inbound idempotency regression checks passed");
} finally {
  if (hadProcessedFile) {
    writeFileSync(PROCESSED_PATH, originalProcessed, "utf-8");
  } else if (existsSync(PROCESSED_PATH)) {
    unlinkSync(PROCESSED_PATH);
  }
}
