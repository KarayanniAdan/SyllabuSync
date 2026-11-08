/**
 * Offline tests for course matching and course search (no network, no database).
 * Run with: bun run scripts/test-courses.ts
 */

import {
  mentionedCourses,
  singleEmailCourse,
  stripReplyHistory,
  validateItemCourse,
} from "../src/lib/course-matching";
import { COURSE_CATALOG, courseMatchesSearch } from "../src/data/course-catalog";

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}`, detail ?? "");
  } else {
    console.log(`ok   ${label}`);
  }
}

const CS = "Introduction to Computer Science";
const SET = "Introduction to Set Theory and Automata for CS";
const CALC = "Infinitesimal Calculus 1M";
const ALG = "Algebra AM";

function validate(subject: string, body: string, selected: string, evidence: string) {
  return validateItemCourse(subject, body, selected, evidence);
}

// New course numbers (all supported forms).
check("CS 02340114", validate("HW1 02340114", "", CS, "02340114") === CS);
check("CS 02340117", validate("HW1 02340117", "", CS, "02340117") === CS);
check("CS 02340114/7", validate("HW1 02340114/7", "", CS, "02340114/7") === CS);
check("CS short 234114 / 234117", validate("x", "234114 and 234117", CS, "234117") === CS);
check("CS 2340117 (no leading zero)", validate("x", "2340117", CS, "2340117") === CS);
check("Set 02340129", validate("HW 02340129", "", SET, "02340129") === SET);
check("Calc 01040031", validate("HW 01040031", "", CALC, "01040031") === CALC);
check("Algebra 01040166", validate("HW 01040166", "", ALG, "01040166") === ALG);

// Both numbers resolve to the same canonical course (so deduping by course/title works).
check(
  "114 and 117 map to the same canonical course",
  validate("a 02340114", "", CS, "02340114") === validate("b 02340117", "", CS, "02340117"),
);
check("mentionedCourses collapses 114+117", mentionedCourses("02340114 02340117").length === 1);
check("mentionedCourses collapses 02340114/7", mentionedCourses("02340114/7")[0] === CS);
check("singleEmailCourse for 114/7 subject", singleEmailCourse("תרגיל 02340114/7", "") === CS);

// Names (English and Hebrew).
check("CS English name", validate("Introduction to Computer Science HW", "", CS, "Introduction to Computer Science") === CS);
check("CS Hebrew name", validate("מבוא למדעי המחשב", "", CS, "מבוא למדעי המחשב") === CS);
check("Set Theory name", validate("Set Theory and Automata HW", "", SET, "Set Theory and Automata") === SET);
check("Calculus 1M name", validate("Infinitesimal Calculus 1M HW", "", CALC, "Infinitesimal Calculus 1M") === CALC);
check("Calculus 1M Hebrew", validate("אינפי 1מ'", "", CALC, "אינפי 1מ'") === CALC);
check("Algebra AM name", validate("Algebra AM HW", "", ALG, "Algebra AM") === ALG);
check("Algebra AM Hebrew", validate("אלגברה אמ'", "", ALG, "אלגברה אמ'") === ALG);

// Strictness: wrong variants and unrelated numbers are rejected.
check("Calculus 2 not matched", mentionedCourses("Infinitesimal Calculus 2").length === 0);
check("Calculus 1 (non-M) not matched", mentionedCourses("Calculus 1").length === 0);
check("Algebra A not matched", mentionedCourses("Algebra A homework").length === 0);
check("Intro to Computer Networks is not CS", mentionedCourses("Introduction to Computer Networks")[0] !== CS);
check("unknown 02340115 rejected", validate("HW 02340115", "", CS, "02340115") === null);
check("unknown 02340118 rejected", validate("HW 02340118", "", CS, "02340118") === null);
check("unknown 01040032 rejected", validate("HW 01040032", "", CALC, "01040032") === null);
check("unrelated number 12340114 not matched", mentionedCourses("12340114").length === 0);
check("partial number 0234011 not matched", mentionedCourses("0234011 and 023401140").length === 0);
check(
  "subject naming unknown course rejects item",
  validate("HW 02340115", "also 02340114", CS, "02340114") === null,
);
check("evidence not in email rejected", validate("HW", "no course", CS, "02340114") === null);
check("existing course still works", validate("HW 02360501", "", "Introduction to Artificial Intelligence", "02360501") === "Introduction to Artificial Intelligence");
check("existing Physics 2M typo still works", mentionedCourses("Physics 2M")[0] === "Physics 2MM");
check("reply history stripped", !stripReplyHistory("hi\nOn x wrote:\n02340114").includes("02340114"));

// Search (substring, case-insensitive, over number/English/Hebrew/aliases).
function searchNames(query: string): string[] {
  return COURSE_CATALOG.filter((c) => courseMatchesSearch(c, query)).map((c) => c.name);
}

check("search 'cal' finds Calculus", searchNames("cal").includes(CALC), searchNames("cal"));
check("search 'CAL' is case-insensitive", searchNames("CAL").includes(CALC));
check("search 'gebra' finds Algebra", searchNames("gebra").includes(ALG));
check("search '40117' finds CS", searchNames("40117").includes(CS));
check("search '40114' finds CS", searchNames("40114").includes(CS));
check("search '02340114/7' finds CS", searchNames("02340114/7").includes(CS));
check("search 'automata' finds Set Theory", searchNames("automata").includes(SET));
check("search 'matka' finds Set Theory", searchNames("matka").includes(SET));
check("search 'MATKA' is case-insensitive", searchNames("MATKA").includes(SET));
check("search Hebrew 'מתקא' finds Set Theory", searchNames("מתקא").includes(SET));
check("search Hebrew 'אינפיניטס' finds Calculus", searchNames("אינפיניטס").includes(CALC));
check("search Hebrew 'מדעי' finds CS", searchNames("מדעי").includes(CS));
check("search '1040166' finds Algebra", searchNames("1040166").includes(ALG));
check("search '   ' returns all", searchNames("   ").length === COURSE_CATALOG.length);
check("search nonsense returns none", searchNames("zzzqqq").length === 0);
check("catalog has a single CS entry", COURSE_CATALOG.filter((c) => c.name === CS).length === 1);
check("CS displayed as 02340114/7", COURSE_CATALOG.find((c) => c.name === CS)?.number === "02340114/7");
check("catalog names are unique", new Set(COURSE_CATALOG.map((c) => c.name)).size === COURSE_CATALOG.length);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll course checks passed");
