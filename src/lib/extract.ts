import OpenAI from "openai";
import "dotenv/config";
import type {
  DeadlineItem,
  DeadlineCategory,
  Course,
  DeadlineType,
  DeadlineStatus,
} from "../data/mockDeadlineItems";
import { randomUUID } from "crypto";
import {
  mentionedCourses,
  singleEmailCourse,
  stripReplyHistory,
  validateItemCourse,
} from "./course-matching";
import { DEADLINE_CHANGE_PATTERN } from "./homework-identity";
import {
  buildAcademicDueAtIso,
  extractExplicitClockFromText,
  formatDueAtDisplayDate,
  getAcademicNowDateTimeParts,
  getWeekdayInAcademicTimezone,
  normalizeDeadlineDueAtFromSource,
  parseDeadlineDueAt,
} from "./timezone";

const COURSE_ITEM_TYPES: DeadlineType[] = ["Homework", "Quiz/Exam"];

function classifyItemCategory(type: DeadlineType): DeadlineCategory {
  return COURSE_ITEM_TYPES.includes(type) ? "Course" : "Other";
}

const client = new OpenAI({
  // Defensive: Vercel env values can be accidentally pasted with extra lines.
  // Use the first non-empty line so Authorization headers stay valid.
  apiKey:
    process.env.OPENAI_API_KEY
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "",
});

export interface ExtractionResult {
  relevant: boolean;
  items: DeadlineItem[];
  /** Set when course items were discarded because no supported course could be confirmed. */
  rejectionReason?: "no-supported-course";
}

const SYSTEM_PROMPT = `You are an academic deadline extractor for Israeli university students.

Given the subject and body of a forwarded academic/course email, extract all academic items that are relevant to students: homework, assignments, quizzes, exams, activities, events, registration deadlines, and important announcements.

Return a JSON object with this exact shape:
{
  "relevant": true | false,
  "items": [
    {
      "course": one of: "Numerical Algorithms" | "Introduction to Artificial Intelligence" | "Compilation Theory" | "Physics 2MM" | "Introduction to Computer Networks" | "Introduction to Computer Science" | "Introduction to Set Theory and Automata for CS" | "Infinitesimal Calculus 1M" | "Algebra AM" | "General",
      "courseEvidence": the exact words copied from the email subject or body that identify the course (e.g. "Physics 2M", "תורת הקומפילציה", "02360360"), or "" if none,
      "title": short title of the item (e.g. "HW2", "Quiz 3", "Lab Report"),
      "type": one of: "Homework" | "Quiz/Exam" | "Activity/Event" | "Registration" | "Announcement",
      "dueAt": ISO 8601 datetime string (e.g. "2025-06-15T23:59:00") or null if no specific deadline,
      "displayDate": human-readable date string (e.g. "Sun, Jun 15, 2025 · 23:59") or the event date,
      "description": one sentence describing what this item is,
      "status": one of: "Upcoming" | "Urgent" | "Expired" | "Completed",
      "sourceSentence": the exact sentence(s) from the email that led to this extraction
    }
  ]
}

Rules:
- Set "relevant" to false if the email contains no academic deadlines, assignments, events, or announcements.
- If the email is in Hebrew, extract the information and return the JSON fields in English, but keep sourceSentence in the original language.
- For "status": use "Urgent" if the deadline is within 48 hours, "Upcoming" if it's in the future beyond 48 hours, "Expired" if it has passed.
- Distinguish deadline semantics carefully:
  - Normal deadline (no penalty): this is the primary dueAt deadline.
  - Extended deadline without penalty: use the extended/new date as the primary dueAt deadline.
  - Late-submission deadline with penalty/deduction (e.g., late submission, penalty, points deducted, deducted per day, איחור, הגשה באיחור, הורדת נקודות, קנס): never use this as the primary dueAt when a normal/no-penalty deadline exists in the same email.
  - If both normal due date and penalized late-submission date appear, keep the normal due date as dueAt and mention late policy details in description/sourceSentence.
  - If only a penalized late-submission window appears and no normal deadline is provided, do not invent a normal deadline.
- For "course": identify the course like a careful human reader, from the subject first, then the body (including a forwarded original message; ignore older quoted replies). Accept obvious typos, abbreviations and Hebrew/English variants (e.g. "Physics 2M" means "Physics 2MM"). An exact course number (with or without the leading zero) takes priority over names. Never choose the closest course: if the email names a different course or number, or you are not sure, use "General" and courseEvidence "". Your answer is validated against courseEvidence.
- courseEvidence must be copied verbatim from the email. If the email covers several courses, give each item the words naming its own course.
- Courses (number, Hebrew name): Numerical Algorithms 02340125 "אלגוריתמים נומריים"; Introduction to Artificial Intelligence 02360501 "מבוא לבינה מלאכותית"; Compilation Theory 02360360 "תורת הקומפילציה"; Physics 2MM 01140075 "פיסיקה 2ממ" (not Physics 1 or other Physics courses); Introduction to Computer Networks 02360334 "מבוא לרשתות מחשבים"; Introduction to Computer Science 02340114/7 "מבוא למדעי המחשב" (02340114, 02340117 and "02340114/7" are all this one course; use "Introduction to Computer Science" for any of them); Introduction to Set Theory and Automata for CS 02340129 "מבוא לתורת הקבוצות ואוטומטים למדמ\"ח"; Infinitesimal Calculus 1M 01040031 "חשבון אינפיניטסימלי 1מ'" (not other Calculus courses); Algebra AM 01040166 "אלגברה אמ'" (not other Algebra courses).
- Default timezone is Asia/Jerusalem for all extracted dates and times unless the email explicitly states another timezone.
- If another timezone is explicitly stated (e.g. UTC, PST, GMT+2), keep that timezone and encode it in dueAt.
- Today's date for reference: ${new Date().toISOString().split("T")[0]}
- Resolve relative dates (e.g. "this Sunday", "next Thursday", "tomorrow") into absolute calendar dates using today's date.
- Never use relative wording in dueAt/displayDate. If a relative date appears in the email, convert it to an absolute date.
- One email can produce multiple items if it mentions multiple deadlines or events.
- Homework titles: copy the assignment identifier exactly as the email states it. Use "HW<number>" for numbered homework (e.g. "HW2"), "WebWork <number>" for numbered WebWork (e.g. "WebWork 3"), and keep qualifiers: "HW2 Wet", "HW2 Dry", "WebWork 2 Part A". Homework 2 Wet / תרגיל בית 2 רטוב is "HW2 Wet"; Homework 2 Dry / תרגיל בית 2 יבש is "HW2 Dry". Titles must be in English.
- If an email announces homework without stating its number, use the title "HW" (or "WebWork" for WebWork). NEVER invent, guess or increment a number from earlier assignments. If the email gives the assignment its own distinctive name, use that name as the title.
- WebWork assignments are homework: use type "Homework" for them. Keep WebWork and regular homework separate even when numbers match.
- Trackable assignments are all type "Homework": homework/HW/assignment/תרגיל בית/מטלה/תרגיל להגשה/עבודה (a submitted assignment) use the "HW" title form; worksheet/גיליון/גיליון עבודה use "Worksheet <number>" (or "Worksheet" if unnumbered) and must NOT be renamed to HW. Use "WebWork" only when the email explicitly calls the assignment WebWork. Only announcements of a submittable assignment count; mentions of solutions, discussions in class, or in-class work are not homework. Exams and quizzes are never Homework.
- If an email only says that "the homework deadline" was extended and doesn't say which assignment, return no item for it.
- A homework item needs a concrete deadline stated in the email; never invent a date or time.
- If no specific date/time is mentioned, set dueAt to null and use a descriptive displayDate like "TBD".`;

const LATE_SUBMISSION_PATTERN =
  /\blate\s*submission\b|\blate\b|\blate\s*penalty\b|\bpenalty\b|\bpoints?\s*deducted\b|\bdeduct(?:ed|ion)?\s*per\s*day\b|איחור|הגשה\s+באיחור|הורדת\s+נקודות|קנס/i;

const PENALTY_PATTERN =
  /\blate\s*penalty\b|\bpenalty\b|\bpoints?\s*deducted\b|\bdeduct(?:ed|ion)?\s*per\s*day\b|הורדת\s+נקודות|קנס/i;

const EXTENSION_PATTERN =
  /\bextended\b|\bdeadline\s+extended\b|\bextension\b|\bpostponed\b|\bmoved\s+to\b|\bnew\s+deadline\b|הוארך|נדחה|המועד\s+הוארך|דחייה/i;

const NORMAL_DUE_PATTERN =
  /\bdue\b|\bdeadline\b|\bsubmit\b|\bsubmission\b|\bmust\s+be\s+submitted\b|\bno\s+later\s+than\b|\buntil\b|\bcloses\b|להגיש|הגשה|מועד\s+הגשה|עד\s+לתאריך|עד\s+ליום|עד\b/i;

function splitIntoClauses(text: string): string[] {
  return text
    .split(/[\n.!?;]+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function getAcademicDateParts(dueAt: string): { year: number; month: number; day: number } | null {
  const parsed = parseDeadlineDueAt(dueAt);
  if (!parsed) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of formatter.formatToParts(parsed)) {
    if (part.type === "year") year = Number(part.value);
    if (part.type === "month") month = Number(part.value);
    if (part.type === "day") day = Number(part.value);
  }

  if (!year || !month || !day) return null;
  return { year, month, day };
}

function getAcademicClockParts(dueAt: string): { hour: number; minute: number } | null {
  const parsed = parseDeadlineDueAt(dueAt);
  if (!parsed) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  let hour = 23;
  let minute = 59;
  for (const part of formatter.formatToParts(parsed)) {
    if (part.type === "hour") hour = Number(part.value);
    if (part.type === "minute") minute = Number(part.value);
  }

  return { hour, minute };
}

function getAcademicDateKey(dueAt: string): string | null {
  const parts = getAcademicDateParts(dueAt);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

type DateMention = {
  dueAt: string;
  dateKey: string;
  hasLateLanguage: boolean;
  hasPenaltyLanguage: boolean;
  hasExtensionLanguage: boolean;
  hasDueLanguage: boolean;
};

function inferReferenceYear(dueAt: string): number {
  const parts = getAcademicDateParts(dueAt);
  if (parts) return parts.year;
  return getAcademicNowDateTimeParts().year;
}

function toDateMention(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  flags: Omit<DateMention, "dueAt" | "dateKey">,
): DateMention | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const tentative = new Date(Date.UTC(year, month - 1, day));
  if (
    tentative.getUTCFullYear() !== year ||
    tentative.getUTCMonth() + 1 !== month ||
    tentative.getUTCDate() !== day
  ) {
    return null;
  }

  const dueAt = buildAcademicDueAtIso(year, month, day, hour, minute);
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { ...flags, dueAt, dateKey };
}

function extractDateMentionsFromClause(clause: string, referenceYear: number, hour: number, minute: number): DateMention[] {
  const hasLateLanguage = LATE_SUBMISSION_PATTERN.test(clause);
  const hasPenaltyLanguage = PENALTY_PATTERN.test(clause);
  const hasExtensionLanguage = EXTENSION_PATTERN.test(clause);
  const hasDueLanguage = NORMAL_DUE_PATTERN.test(clause);

  const mentions: DateMention[] = [];
  const commonFlags = {
    hasLateLanguage,
    hasPenaltyLanguage,
    hasExtensionLanguage,
    hasDueLanguage,
  };

  for (const match of clause.matchAll(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/g)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const rawYear = match[3];
    let year = referenceYear;

    if (rawYear) {
      const parsedYear = Number(rawYear);
      year = rawYear.length === 2 ? 2000 + parsedYear : parsedYear;
    }

    const mention = toDateMention(year, month, day, hour, minute, commonFlags);
    if (mention) mentions.push(mention);
  }

  for (const match of clause.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const mention = toDateMention(year, month, day, hour, minute, commonFlags);
    if (mention) mentions.push(mention);
  }

  return mentions;
}

export function enforcePrimaryDeadlinePolicy(item: DeadlineItem, fullEmailText: string): DeadlineItem | null {
  if (!item.dueAt) return item;

  const currentDateKey = getAcademicDateKey(item.dueAt);
  if (!currentDateKey) return item;

  const referenceYear = inferReferenceYear(item.dueAt);
  const combinedText = `${item.sourceSentence}\n${fullEmailText}`;
  const explicitClock = extractExplicitClockFromText(combinedText);
  const clock = explicitClock ?? getAcademicClockParts(item.dueAt) ?? { hour: 23, minute: 59 };
  const clauses = splitIntoClauses(combinedText);

  const mentions = clauses.flatMap((clause) =>
    extractDateMentionsFromClause(clause, referenceYear, clock.hour, clock.minute),
  );

  if (mentions.length === 0) return item;

  const hasPenaltyLanguage = clauses.some((clause) => PENALTY_PATTERN.test(clause));
  const hasLateLanguage = clauses.some((clause) => LATE_SUBMISSION_PATTERN.test(clause));
  const hasExtensionLanguage = clauses.some((clause) => EXTENSION_PATTERN.test(clause));

  const normalMentions = mentions.filter(
    (m) => !m.hasLateLanguage && !m.hasPenaltyLanguage && m.hasDueLanguage,
  );
  const lateMentions = mentions.filter((m) => m.hasLateLanguage || m.hasPenaltyLanguage);

  // If we only have a penalized late-submission deadline and no normal due date, drop it.
  if ((hasLateLanguage || hasPenaltyLanguage) && normalMentions.length === 0 && lateMentions.length > 0) {
    return null;
  }

  // Extension without penalty should keep the extended deadline as primary.
  if (hasExtensionLanguage && !hasPenaltyLanguage) {
    return item;
  }

  // If both normal and penalized-late dates exist, force primary deadline to the normal date.
  if (normalMentions.length > 0 && lateMentions.length > 0) {
    const sortedNormal = [...normalMentions].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const primaryNormal = sortedNormal[0];

    if (primaryNormal.dateKey !== currentDateKey) {
      return {
        ...item,
        dueAt: primaryNormal.dueAt,
        displayDate: formatDueAtDisplayDate(primaryNormal.dueAt),
      };
    }
  }

  return item;
}

function hasValidAbsoluteDueAt(dueAt: string): boolean {
  if (!dueAt || !/^\d{4}-\d{2}-\d{2}T/.test(dueAt)) return false;
  return parseDeadlineDueAt(dueAt) !== null;
}

function looksVagueDisplayDate(displayDate: string): boolean {
  const text = displayDate.trim();
  if (!text) return true;
  if (/\b(tbd|to be announced|unknown|n\/a|soon|later)\b/i.test(text)) return true;
  return !/\b\d{4}\b/.test(text);
}

function sourceUsesRelativeDateLanguage(sourceSentence: string): boolean {
  return /(\bthis\b|\bnext\b|\bcoming\b)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|week|month)\b|\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\btoday\b|\btomorrow\b|\btonight\b|היום|מחר|השבוע|שבוע הבא|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת/i.test(
    sourceSentence,
  );
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

function dueAtWeekdayMatchesSource(sourceSentence: string, dueAt: string): boolean {
  const expected = expectedWeekdayFromSource(sourceSentence);
  if (expected === null) return true;

  const actual = getWeekdayInAcademicTimezone(dueAt);
  return actual !== null && actual === expected;
}

function failsDateQualityGate(item: DeadlineItem): boolean {
  const hasAbsoluteDueAt = hasValidAbsoluteDueAt(item.dueAt);
  const vagueDisplay = looksVagueDisplayDate(item.displayDate);
  const sourceLooksRelative = sourceUsesRelativeDateLanguage(item.sourceSentence);

  // Non-announcement items should have either a concrete dueAt or concrete calendar display date.
  if (item.type !== "Announcement" && !hasAbsoluteDueAt && vagueDisplay) return true;

  // Relative wording in source requires an absolute dueAt after extraction.
  if (sourceLooksRelative && !hasAbsoluteDueAt) return true;

  if (
    sourceLooksRelative &&
    hasAbsoluteDueAt &&
    !dueAtWeekdayMatchesSource(item.sourceSentence, item.dueAt)
  ) {
    return true;
  }

  return false;
}

function isHomeworkAnnouncementWithoutDeadline(item: DeadlineItem): boolean {
  const text = `${item.title} ${item.description} ${item.sourceSentence}`.toLowerCase();
  const isHomeworkLike = /\b(hw|homework|assignment|exercise)\b|תרגיל\s*בית|מטלה/.test(text);
  const isPublishLike =
    /\b(publish|published|release|released|will\s+be\s+published|will\s+publish)\b|יפורסם|פורסם|פרסום/.test(
      text,
    );
  const hasConcreteDueAt = !!item.dueAt && !Number.isNaN(Date.parse(item.dueAt));
  const hasTbdDisplay = /\bTBD\b/i.test(item.displayDate);

  // Keep actionable homework deadlines; drop publish/release notices without a concrete deadline.
  return isHomeworkLike && isPublishLike && (!hasConcreteDueAt || hasTbdDisplay);
}

function normalizeHomeworkDeadlineText(item: DeadlineItem): DeadlineItem {
  if (item.type !== "Homework") return item;

  const text = `${item.title} ${item.description} ${item.sourceSentence}`.toLowerCase();
  const isPublishLike =
    /\b(publish|published|release|released|will\s+be\s+published|will\s+publish)\b|יפורסם|פורסם|פרסום/.test(
      text,
    );
  const hasConcreteDueAt = !!item.dueAt && !Number.isNaN(Date.parse(item.dueAt));

  if (!isPublishLike || !hasConcreteDueAt) return item;

  return {
    ...item,
    description: `Submission deadline for ${item.title} is ${item.displayDate}.`,
  };
}

const UNNUMBERED_TITLE_PATTERN = /^(?:hw|webwork|worksheet)(?:\s+(?:wet|dry))?$/i;
const GENERIC_HOMEWORK_TITLE_PATTERN = /^(?:homework|home\s*work|assignment|exercise|problem\s*set)$/i;

/** A bare "Homework"/"Assignment" title becomes "HW"; numbers and identifiers are never added. */
function normalizeGenericHomeworkTitle(item: DeadlineItem): DeadlineItem {
  if (item.type !== "Homework") return item;
  const title = item.title.trim();
  return GENERIC_HOMEWORK_TITLE_PATTERN.test(title) ? { ...item, title: "HW" } : item;
}

/** An extension that doesn't identify its assignment ("HW"/"WebWork" without a number) can't be applied safely. */
function isAmbiguousUnnumberedExtension(item: DeadlineItem): boolean {
  return (
    item.type === "Homework" &&
    UNNUMBERED_TITLE_PATTERN.test(item.title.trim()) &&
    DEADLINE_CHANGE_PATTERN.test(`${item.sourceSentence}\n${item.description}`)
  );
}

function tryHeuristicFallbackExtraction(
  subject: string,
  body: string,
  emailFrom: string | undefined,
  confirmedCourse: Exclude<Course, "General">,
): DeadlineItem[] {
  const text = `${subject}\n${body}`;
  const lower = text.toLowerCase();

  const looksHomework = /\b(hw|homework|assignment|exercise)\b|תרגיל\s*בית|מטלה/.test(lower);
  const hasDeadlineSignal = /\bdue\b|\bdeadline\b|submit|submission|להגיש|הגשה/.test(lower);
  if (!looksHomework || !hasDeadlineSignal) return [];

  const hwNumber = text.match(/(?:\bHW\b|homework|assignment)\s*(\d{1,3})/i)?.[1];
  const title = hwNumber ? `HW${hwNumber}` : "HW";

  // Only an explicit calendar date and an explicit clock time count; never guess either.
  const clock = extractExplicitClockFromText(text);
  if (!clock) return [];
  const mentions = splitIntoClauses(text).flatMap((clause) =>
    extractDateMentionsFromClause(clause, getAcademicNowDateTimeParts().year, clock.hour, clock.minute),
  );
  if (new Set(mentions.map((m) => m.dateKey)).size !== 1) return [];

  const dueAt = mentions[0].dueAt;
  const item: DeadlineItem = {
    id: randomUUID(),
    category: "Course",
    course: confirmedCourse,
    title,
    type: "Homework",
    dueAt,
    displayDate: formatDueAtDisplayDate(dueAt),
    description: `Submission deadline for ${title}.`,
    status: "Upcoming",
    sourceSentence: body.trim() || subject,
  };

  return isAmbiguousUnnumberedExtension(item) ? [] : [item];
}

export async function extractFromEmail(
  subject: string,
  body: string,
  emailFrom?: string,
): Promise<ExtractionResult> {
  body = stripReplyHistory(body);
  const userMessage = `Email from: ${emailFrom ?? "(unknown)"}\nEmail subject: ${subject}\n\nEmail body:\n${body}`;

  // Nothing in the email can point at a supported course: skip the model call entirely.
  if (mentionedCourses(`${subject}\n${body}`).length === 0) {
    return { relevant: false, items: [], rejectionReason: "no-supported-course" };
  }

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const raw = response.choices[0]?.message?.content ?? '{"relevant":false,"items":[]}';
  const parsed = JSON.parse(raw) as ExtractionResult;

  if (!parsed.relevant || !Array.isArray(parsed.items)) {
    return { relevant: false, items: [] };
  }

  // Assign unique IDs to each extracted item
  let rejectedForCourse = 0;
  const items: DeadlineItem[] = parsed.items
    .map((item): DeadlineItem | null => {
      const { courseEvidence, ...rest } = item as DeadlineItem & { courseEvidence?: string };
      const category = classifyItemCategory(rest.type as DeadlineType);
      const confirmedCourse = validateItemCourse(subject, body, rest.course, courseEvidence);

      // Course items (homework, quizzes) need a confirmed supported course; never "General".
      if (category === "Course" && !confirmedCourse) {
        rejectedForCourse += 1;
        return null;
      }

      const finalCourse: Course = confirmedCourse ?? "General";
      const normalizationContext = `${rest.sourceSentence ?? ""}\n${userMessage}`;
      const normalizedDueAt = normalizeDeadlineDueAtFromSource(
        rest.dueAt ?? "",
        normalizationContext,
      );

      return {
        ...rest,
        id: randomUUID(),
        category,
        course: finalCourse,
        type: rest.type as DeadlineType,
        status: rest.status as DeadlineStatus,
        dueAt: normalizedDueAt,
        displayDate: normalizedDueAt ? formatDueAtDisplayDate(normalizedDueAt) : (rest.displayDate ?? "TBD"),
      };
    })
    .filter((item): item is DeadlineItem => item !== null)
    .map((item) => enforcePrimaryDeadlinePolicy(item, userMessage))
    .filter((item): item is DeadlineItem => item !== null)
    .map(normalizeHomeworkDeadlineText)
    .map(normalizeGenericHomeworkTitle)
    .filter((item) => !isAmbiguousUnnumberedExtension(item))
    .filter((item) => !failsDateQualityGate(item))
    .filter((item) => !isHomeworkAnnouncementWithoutDeadline(item));

  if (items.length === 0) {
    const fallbackCourse = singleEmailCourse(subject, body);
    if (fallbackCourse) {
      const fallbackItems = tryHeuristicFallbackExtraction(subject, body, emailFrom, fallbackCourse);
      if (fallbackItems.length > 0) {
        return { relevant: true, items: fallbackItems };
      }
    }
    return rejectedForCourse > 0
      ? { relevant: false, items: [], rejectionReason: "no-supported-course" }
      : { relevant: false, items: [] };
  }

  return { relevant: true, items };
}
