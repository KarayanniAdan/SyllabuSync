/**
 * Manual timezone check for academic deadlines.
 * Run with: bun run test:timezone
 */

import {
  formatDueAtForDisplay,
  normalizeDeadlineDueAt,
  normalizeDeadlineDueAtFromSource,
} from "../src/lib/timezone";

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

const sourceTime = "התרגיל להגשה עד יום ראשון ה-12.07, בשעה 23:59.";
const modelValue = "2026-07-12T20:59:00Z";
const normalizedFromSource = normalizeDeadlineDueAtFromSource(modelValue, sourceTime);

console.log("Source sentence clock:", sourceTime);
console.log("Model dueAt value:", modelValue);
console.log("Normalized from source:", normalizedFromSource);
console.log("Display after source-aware normalization:", formatDueAtForDisplay(normalizedFromSource));

if (normalizedFromSource !== expectedUtc) {
  console.error(`FAIL: source-aware normalization expected ${expectedUtc} but got ${normalizedFromSource}`);
  process.exit(1);
}

if (formatDueAtForDisplay(normalizedFromSource) !== "Jul 12, 2026 at 23:59") {
  console.error("FAIL: display label should preserve 23:59 in Asia/Jerusalem");
  process.exit(1);
}

console.log("PASS: interpreted as Asia/Jerusalem (UTC+03 in July), not UTC");
