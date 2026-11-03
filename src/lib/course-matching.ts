import type { Course } from "../data/mockDeadlineItems";

/**
 * Course validation for AI-extracted items. The model identifies the course and must quote the
 * words that identify it; this module only checks that the quote really exists in the email and
 * really points at the chosen course. Exact course numbers take priority.
 */

export type SupportedCourse = Exclude<Course, "General">;

const COURSES: Array<{ course: SupportedCourse; numbers: string[]; keywords: RegExp }> = [
  { course: "Numerical Algorithms", numbers: ["02340125", "2340125", "234125"], keywords: /numer|נומר/ },
  {
    course: "Introduction to Artificial Intelligence",
    numbers: ["02360501", "2360501", "236501"],
    keywords: /artif|intellig|בינה\s+מלאכות|\bintro\w*\s+to\s+ai\b/,
  },
  { course: "Compilation Theory", numbers: ["02360360", "2360360", "236360"], keywords: /compil|קומפיל|קומפל/ },
  {
    course: "Physics 2MM",
    numbers: ["01140075", "1140075", "114075"],
    // "Physics 2M" is accepted (typo); "Physics 1" or "Physics 2 Mechanics" are not.
    keywords: /(?:phys|פיס|פיז)[a-z\u05d0-\u05ea]*[\s-]*2\s*(?:mm?|ממ?)(?![a-z\u05d0-\u05ea])/,
  },
  {
    course: "Introduction to Computer Networks",
    numbers: ["02360334", "2360334", "236334"],
    keywords: /comput\w*\s+net|רשתות\s+מחשב/,
  },
];

const NUMBER_PATTERNS = COURSES.map((c) => new RegExp(`(?<!\\d)(?:${c.numbers.join("|")})(?!\\d)`));
const KNOWN_NUMBERS = new Set(COURSES.flatMap((c) => c.numbers));

function norm(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/["'`\u05f3\u05f4\u2018\u2019\u201c\u201d]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numberCourses(text: string): SupportedCourse[] {
  return COURSES.filter((_, i) => NUMBER_PATTERNS[i].test(text)).map((c) => c.course);
}

/** Supported courses whose number or a distinctive keyword appears in the text. */
export function mentionedCourses(text: string): SupportedCourse[] {
  const t = norm(text);
  return COURSES.filter((c, i) => NUMBER_PATTERNS[i].test(t) || c.keywords.test(t)).map((c) => c.course);
}

/** True for a standard 8-digit course number that is not one of the supported courses. */
function hasUnknownNumber(text: string): boolean {
  return [...text.matchAll(/(?<!\d)0\d{7}(?!\d)/g)].some((m) => !KNOWN_NUMBERS.has(m[0]));
}

/** Drops older quoted conversation ("On ... wrote:" and everything after it). */
export function stripReplyHistory(body: string): string {
  const lines = body.split(/\r?\n/);
  const cut = lines.findIndex((l) => /(?:\bwrote:|כתבה?:)\s*$/i.test(l.trim()));
  return cut < 0 ? body : lines.slice(0, cut).join("\n");
}

/**
 * Returns the confirmed course for one extracted item, or null (reject) when it can't be confirmed.
 * - the quoted evidence must exist in the subject/body;
 * - an exact course number in the evidence decides the course;
 * - otherwise the evidence must identify exactly the course the model chose;
 * - the subject comes first: if it names supported courses the course must be one of them, and a
 *   subject naming only an unsupported course number rejects the item.
 */
export function validateItemCourse(
  subject: string,
  body: string,
  selected: string | undefined,
  evidence: string | undefined,
): SupportedCourse | null {
  const ev = norm(evidence ?? "");
  if (ev.length < 3 || !norm(`${subject}\n${body}`).includes(ev) || hasUnknownNumber(ev)) return null;

  const byNumber = numberCourses(ev);
  let course: SupportedCourse;
  if (byNumber.length === 1) {
    course = byNumber[0];
  } else {
    const byName = byNumber.length === 0 ? mentionedCourses(ev) : [];
    if (byName.length !== 1 || byName[0] !== selected) return null;
    course = byName[0];
  }

  const subjectCourses = mentionedCourses(subject);
  if (subjectCourses.length ? !subjectCourses.includes(course) : hasUnknownNumber(subject)) return null;
  return course;
}

/** The single course an email is about (subject first), for the no-AI-items fallback. */
export function singleEmailCourse(subject: string, body: string): SupportedCourse | null {
  const fromSubject = mentionedCourses(subject);
  if (fromSubject.length === 0 && hasUnknownNumber(subject)) return null;
  const pool = fromSubject.length ? fromSubject : mentionedCourses(body);
  return pool.length === 1 ? pool[0] : null;
}
