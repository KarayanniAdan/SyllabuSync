/**
 * Offline tests for homework identity / duplicate detection (no network, no database).
 * Run with: bun run scripts/test-homework-identity.ts
 */

import { isAmbiguousVariantExtension, isLogicalDuplicate, normalizeSemanticTitleKey } from "../src/lib/homework-identity";

let failures = 0;
const DUE = "2026-12-15T21:59:00.000Z";

function hw(title: string, opts: { dueAt?: string; source?: string; course?: string; type?: string } = {}) {
  return {
    id: title,
    category: "Course",
    course: opts.course ?? "Physics 2MM",
    title,
    type: opts.type ?? "Homework",
    dueAt: opts.dueAt ?? DUE,
    displayDate: "",
    description: "",
    status: "Upcoming",
    sourceSentence: opts.source ?? "",
  } as any;
}

function expectDup(a: ReturnType<typeof hw>, b: ReturnType<typeof hw>, expected: boolean, label: string) {
  const got = isLogicalDuplicate(a, b);
  const ok = got === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} (dup=${got}, expected ${expected})`);
}

// Same assignment, different spellings.
expectDup(hw("HW2"), hw("HW2"), true, "exact repeat");
expectDup(hw("HW2"), hw("Homework 2"), true, "Homework 2 = HW2");
expectDup(hw("HW2"), hw("Assignment 2"), true, "Assignment 2 = HW2");
expectDup(hw("HW2"), hw("HW 2"), true, "spacing");
expectDup(hw("HW2", { dueAt: "2026-12-15T21:59:00.000Z" }), hw("HW2", { dueAt: "2026-12-25T21:59:00.000Z" }), true, "numbered extension updates same assignment");
expectDup(hw("HW2 Wet"), hw("Homework 2 Wet"), true, "wet alias");
expectDup(hw("HW2 Wet"), hw("תרגיל בית 2 רטוב"), true, "wet in Hebrew");
expectDup(hw("WebWork 2"), hw("WebWork 2"), true, "webwork repeat");
expectDup(hw("WebWork 2"), hw("Web Work 2"), true, "webwork spacing");

// Wet / Dry / plain stay separate.
expectDup(hw("HW2 Wet"), hw("HW2 Dry"), false, "wet vs dry");
expectDup(hw("HW2"), hw("HW2 Wet"), false, "plain vs wet");
expectDup(hw("HW2"), hw("HW2 Dry"), false, "plain vs dry");
expectDup(hw("HW2 Wet"), hw("HW2"), false, "wet vs plain (reverse)");
expectDup(hw("תרגיל בית 2 רטוב"), hw("תרגיל בית 2 יבש"), false, "Hebrew wet vs dry");

// WebWork vs HW and WebWork numbers.
expectDup(hw("HW2"), hw("WebWork 2"), false, "HW2 vs WebWork 2");
expectDup(hw("WebWork 2"), hw("WebWork 3"), false, "WebWork 2 vs 3");
expectDup(hw("Homework 2 (WebWork)"), hw("HW2"), false, "Homework 2 (WebWork) vs HW2");
expectDup(hw("WebWork 2 Part A"), hw("WebWork 2 Part B"), false, "WebWork parts");
expectDup(hw("WebWork 2"), hw("WebWork 2 Part A"), false, "WebWork vs part");
expectDup(hw("HW1"), hw("HW10"), false, "number boundary");

// Unnumbered assignments: never merged unless deadline or source match exactly.
expectDup(hw("HW", { dueAt: "2026-12-10T21:59:00.000Z" }), hw("HW", { dueAt: "2026-12-17T21:59:00.000Z", source: "other" }), false, "unnumbered HW with different deadlines stay separate");
expectDup(hw("HW", { dueAt: DUE, source: "A" }), hw("HW", { dueAt: DUE, source: "B" }), false, "unnumbered HW same deadline, different source stay separate");
expectDup(hw("HW", { dueAt: DUE }), hw("HW", { dueAt: DUE }), false, "unnumbered HW same deadline, no source evidence stay separate");
expectDup(hw("WebWork", { dueAt: DUE, source: "A" }), hw("WebWork", { dueAt: DUE, source: "B" }), false, "unnumbered WebWork same deadline stay separate");
expectDup(hw("HW", { dueAt: "2026-12-10T21:59:00.000Z", source: "HW due Dec 10." }), hw("HW", { dueAt: "2026-12-17T21:59:00.000Z", source: "HW due Dec 10." }), true, "unnumbered HW same source = repeat");
expectDup(hw("WebWork", { dueAt: "2026-12-10T21:59:00.000Z" }), hw("WebWork", { dueAt: "2026-12-17T21:59:00.000Z" }), false, "unnumbered WebWork different deadlines stay separate");
expectDup(hw("HW"), hw("WebWork"), false, "unnumbered HW vs WebWork");
expectDup(hw("HW"), hw("HW2"), false, "unnumbered HW vs HW2");
expectDup(hw("HW", { dueAt: DUE }), hw("HW Wet", { dueAt: DUE }), false, "unnumbered HW vs HW Wet");

// Distinctive names and other types / courses.
expectDup(hw("Kinematics Workshop"), hw("Kinematics Workshop", { dueAt: "2026-12-25T21:59:00.000Z" }), true, "distinctive name extension");
expectDup(hw("Kinematics Workshop"), hw("Dynamics Workshop"), false, "different distinctive names");
expectDup(hw("HW2"), hw("HW2", { course: "Algebra AM" }), false, "different course");
expectDup(hw("HW2"), hw("HW2", { type: "Quiz/Exam" }), false, "different type");

// Ambiguous numbered extensions.
const ext = (title: string) => hw(title, { source: `${title} deadline has been extended to 30/12.` });
const ambiguous = (existing: any[], incoming: any) => isAmbiguousVariantExtension(existing, incoming);
function expectAmbiguous(existing: any[], incoming: any, expected: boolean, label: string) {
  const got = ambiguous(existing, incoming);
  if (got !== expected) failures += 1;
  console.log(`${got === expected ? "ok  " : "FAIL"} ${label} (skip=${got}, expected ${expected})`);
}
expectAmbiguous([hw("HW2 Wet"), hw("HW2 Dry")], ext("HW2"), true, "HW2 extension with only Wet/Dry is skipped");
expectAmbiguous([hw("HW2 Wet")], ext("HW2"), true, "HW2 extension with only Wet is skipped");
expectAmbiguous([hw("HW2 Wet"), hw("HW2")], ext("HW2"), false, "plain HW2 exists: extension allowed");
expectAmbiguous([hw("HW2 Wet")], hw("HW2", { source: "HW2 is out, due 20/12 23:59." }), false, "new HW2 announcement allowed");
expectAmbiguous([], ext("HW2"), false, "no existing: not skipped");
expectAmbiguous([hw("HW3 Wet")], ext("HW2"), false, "different number not skipped");
expectAmbiguous([hw("HW2 Wet")], ext("HW2 Dry"), false, "explicit variant extension not skipped");
expectAmbiguous([hw("HW2 Wet")], ext("WebWork 2"), false, "WebWork 2 unaffected by HW2 Wet");
expectDup(hw("HW2"), ext("HW2"), true, "explicit extension updates plain HW2");
expectDup(hw("HW2 Wet"), ext("HW2"), false, "extension never matches a variant row");

// Keys never gain an invented number.
expectDup(hw("Worksheet 3"), hw("HW3"), false, "Worksheet 3 vs HW3");
expectDup(hw("Worksheet 3"), hw("WebWork 3"), false, "Worksheet 3 vs WebWork 3");
expectDup(hw("Worksheet 3"), hw("גיליון 3"), true, "Worksheet 3 = גיליון 3");
expectDup(hw("Worksheet 3"), hw("Worksheet 4"), false, "Worksheet 3 vs 4");
expectDup(hw("Worksheet 3"), hw("Worksheet 3", { dueAt: "2026-12-25T21:59:00.000Z" }), true, "worksheet extension");
expectDup(hw("Worksheet", { dueAt: "2026-12-10T21:59:00.000Z" }), hw("Worksheet", { dueAt: DUE }), false, "unnumbered worksheets stay separate");
expectDup(hw("HW3"), hw("תרגיל בית 3"), true, "HW3 = תרגיל בית 3");
const keyOf = (t: string) => normalizeSemanticTitleKey({ title: t, type: "Homework" });
if (keyOf("HW") !== "hw" || keyOf("WebWork") !== "webwork" || keyOf("Homework") !== "hw") {
  failures += 1;
  console.log("FAIL unnumbered keys must stay unnumbered", keyOf("HW"), keyOf("WebWork"), keyOf("Homework"));
} else {
  console.log("ok   unnumbered keys stay unnumbered");
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll homework identity checks passed");
