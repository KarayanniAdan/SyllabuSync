import {
  formatDueAtForDisplay,
  normalizeDeadlineDueAt,
  normalizeDeadlineDueAtFromSource,
} from "../src/lib/timezone";
import { canonicalHomeworkTitle, isLogicalDuplicate } from "../src/lib/homework-identity";

let failed = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` (got ${actual}, expected ${expected})`}`);
}

const hw = { defaultToEndOfDay: true };

// Algebra: explicit 23:59 survives an LLM midnight value
eq(
  "Algebra explicit 23:59",
  normalizeDeadlineDueAtFromSource(
    "2026-11-19T00:00:00",
    "להגשה עד 19/11/2026 בשעה 23:59\nSubject: תזכורת עבודה 1",
    hw,
  ),
  "2026-11-19T21:59:00.000Z",
);

// Intro to CS: date only, publication/sent times must be ignored -> 23:59
const csContext =
  "Homework 1 is due on November 24, 2026.\nSubject: HW1\nPublished: Nov 10, 2026 12:31\nSent: Nov 10, 2026 13:02";
eq(
  "CS date-only defaults to 23:59",
  normalizeDeadlineDueAtFromSource("2026-11-24T12:31:00", csContext, hw),
  "2026-11-24T21:59:00.000Z",
);
eq(
  "CS date-only (model gave midnight)",
  normalizeDeadlineDueAtFromSource("2026-11-24", csContext, hw),
  "2026-11-24T21:59:00.000Z",
);

// DST: summer and the transition edges
eq("summer default", normalizeDeadlineDueAtFromSource("2026-07-12", "Due July 12, 2026", hw), "2026-07-12T20:59:00.000Z");
eq("before spring DST", normalizeDeadlineDueAtFromSource("2026-03-26", "Due March 26, 2026", hw), "2026-03-26T21:59:00.000Z");
eq("after spring DST", normalizeDeadlineDueAtFromSource("2026-03-27", "Due March 27, 2026", hw), "2026-03-27T20:59:00.000Z");
eq("after autumn DST", normalizeDeadlineDueAtFromSource("2026-10-25", "Due October 25, 2026", hw), "2026-10-25T21:59:00.000Z");

// Explicit non-Israel timezone in the deadline clause is respected
eq(
  "explicit UTC+2",
  normalizeDeadlineDueAtFromSource("2026-11-19T23:59:00+02:00", "Due 19/11/2026 at 23:59 UTC+2", hw),
  "2026-11-19T21:59:00.000Z",
);

// Non-homework keeps the model's time
eq(
  "quiz time kept",
  normalizeDeadlineDueAtFromSource("2026-11-18T10:30:00", "Quiz on Wednesday", { defaultToEndOfDay: false }),
  "2026-11-18T08:30:00.000Z",
);

// Read/store round trip: stored UTC instants are never reinterpreted
eq("read winter +00:00", normalizeDeadlineDueAt("2026-11-19T21:59:00+00:00"), "2026-11-19T21:59:00.000Z");
eq("read summer +00:00", normalizeDeadlineDueAt("2026-07-12T20:59:00+00:00"), "2026-07-12T20:59:00.000Z");
eq("display winter in Israel", formatDueAtForDisplay("2026-11-19T21:59:00.000Z"), "Nov 19, 2026 at 23:59");

// Titles
const t = (title: string) => canonicalHomeworkTitle({ title, type: "Homework" } as any);
eq("title עבודה 1", t("עבודה 1 - מרוכבים"), "HW1");
eq("title old format", t("HW 1 - Complex Numbers"), "HW1");
eq("title Homework 2", t("Homework 2 - Graphs"), "HW2");
eq("title wet", t("HW2 Wet - Programming"), "HW2 Wet");
eq("title dry", t("HW2 Dry - Theory"), "HW2 Dry");
eq("title webwork", t("WebWork 3"), "WebWork3");
eq("title unnumbered unchanged", t("Final Project"), "Final Project");

// Identity: old-format record matches new title, variants stay separate
const mk = (title: string, dueAt = "2026-11-19T21:59:00.000Z") =>
  ({
    title,
    type: "Homework",
    category: "Academic",
    course: "Algebra AM",
    courseCode: "01040166",
    dueAt,
    sourceSentence: title,
  }) as any;
eq("old title is duplicate of HW1", isLogicalDuplicate(mk("HW 1 - Complex Numbers", "2026-11-18T22:00:00.000Z"), mk("HW1")), true);
eq("HW1 vs HW2", isLogicalDuplicate(mk("HW1"), mk("HW2")), false);
eq("Wet vs Dry", isLogicalDuplicate(mk("HW2 Wet"), mk("HW2 Dry")), false);
eq("HW vs HW Wet", isLogicalDuplicate(mk("HW2"), mk("HW2 Wet")), false);
eq("HW vs WebWork", isLogicalDuplicate(mk("HW2"), mk("WebWork 2")), false);

// WebWork with and without a space is the same assignment, never regular HW
eq("title WebWork3 (no space)", t("WebWork3"), "WebWork3");
eq("title WebWork3 Part A", t("WebWork3 Part A"), "WebWork3 Part A");
eq("title Worksheet3 (no space)", t("Worksheet3"), "Worksheet 3");
eq("WebWork3 = WebWork 3", isLogicalDuplicate(mk("WebWork3"), mk("WebWork 3")), true);
eq("WebWork3 != HW3", isLogicalDuplicate(mk("WebWork3"), mk("HW3")), false);
eq("WebWork 3 != HW3", isLogicalDuplicate(mk("WebWork 3"), mk("HW3")), false);
eq("WebWork3 != WebWork4", isLogicalDuplicate(mk("WebWork3"), mk("WebWork4")), false);
eq("WebWork 2 Part A != Part B", isLogicalDuplicate(mk("WebWork 2 Part A"), mk("WebWork2 Part B")), false);
eq("unnumbered WebWork unchanged", t("WebWork"), "WebWork");

// Classification priority: WebWork > Wet > Dry > HW
eq("WebWork 1 (HW1) published", t("WebWork 1 (HW1) published"), "WebWork1");
eq("HW2 WebWork", t("HW2 WebWork"), "WebWork2");
eq("WebWork3 Wet", t("WebWork3 Wet"), "WebWork3");
eq("WeBWorK 4 Dry", t("WeBWorK 4 Dry"), "WebWork4");
eq("HW1 רטוב", t("HW1 רטוב"), "HW1 Wet");
eq("HW1 יבש", t("HW1 יבש"), "HW1 Dry");
eq("HW2 Wet Dry -> Wet", t("HW2 Wet Dry"), "HW2 Wet");
eq("HW3 Dry - Theory", t("HW3 Dry - Theory"), "HW3 Dry");
eq("unnumbered HW unchanged", t("HW"), "HW");
eq("WebWork3 Wet != HW3 Wet", isLogicalDuplicate(mk("WebWork3 Wet"), mk("HW3 Wet")), false);
eq("WebWork3 Wet = WebWork 3", isLogicalDuplicate(mk("WebWork3 Wet"), mk("WebWork 3")), true);
eq("HW1 Wet != HW1 Dry", isLogicalDuplicate(mk("HW1 Wet"), mk("HW1 Dry")), false);

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("All deadline regression checks passed");
