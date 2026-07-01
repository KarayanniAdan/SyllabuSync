/**
 * Manual timezone check for academic deadlines.
 * Run with: bun run test:timezone
 */

import { normalizeDeadlineDueAt, formatDueAtForDisplay } from "../src/lib/timezone";

const input = "2026-07-12 23:59";
const normalized = normalizeDeadlineDueAt(input);
const expectedUtc = "2026-07-12T20:59:00.000Z";

console.log("Input local datetime:", input);
console.log("Normalized UTC instant:", normalized);
console.log("Formatted in Asia/Jerusalem:", formatDueAtForDisplay(normalized));

if (normalized !== expectedUtc) {
  console.error(`FAIL: expected ${expectedUtc} but got ${normalized}`);
  process.exit(1);
}

console.log("PASS: interpreted as Asia/Jerusalem (UTC+03 in July), not UTC");
