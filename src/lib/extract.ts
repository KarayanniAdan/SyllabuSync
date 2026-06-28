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

const SUPPORTED_COURSES: Course[] = [
  "Operating Systems",
  "Algorithms 1",
  "ATAM",
  "System Programming",
  "General",
];
const COURSE_ITEM_TYPES: DeadlineType[] = ["Homework", "Quiz/Exam"];

const COURSE_HINTS: Array<{ course: Exclude<Course, "General">; patterns: RegExp[] }> = [
  {
    course: "Operating Systems",
    patterns: [/02340123/i, /operating\s*systems?/i, /מערכות\s*הפעלה/],
  },
  {
    course: "Algorithms 1",
    patterns: [/02340247/i, /algorithms?\s*1/i, /אלגוריתמים\s*1/],
  },
  {
    course: "ATAM",
    patterns: [/02340118/i, /\batam\b/i, /ארגון\s*ותכנות\s*המחשב/, /את"?ם/],
  },
  {
    course: "System Programming",
    patterns: [/02340124/i, /\bsystem\s*programming\b/i, /מערכות\s*תכנות/i],
  },
];

function inferCourseFromText(text: string): Exclude<Course, "General"> | null {
  for (const hint of COURSE_HINTS) {
    if (hint.patterns.some((p) => p.test(text))) {
      return hint.course;
    }
  }
  return null;
}

function classifyItemCategory(type: DeadlineType): DeadlineCategory {
  return COURSE_ITEM_TYPES.includes(type) ? "Course" : "Other";
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ExtractionResult {
  relevant: boolean;
  items: DeadlineItem[];
}

const SYSTEM_PROMPT = `You are an academic deadline extractor for Israeli university students.

Given the subject and body of a forwarded academic/course email, extract all academic items that are relevant to students: homework, assignments, quizzes, exams, activities, events, registration deadlines, and important announcements.

Return a JSON object with this exact shape:
{
  "relevant": true | false,
  "items": [
    {
      "course": one of: "Operating Systems" | "Algorithms 1" | "ATAM" | "General",
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
- For "course": map to the closest supported course. If it doesn't match any specific course, use "General".
- Course mapping hints:
  - "Operating Systems" if email mentions "מערכות הפעלה" or course code "02340123".
  - "Algorithms 1" if email mentions "אלגוריתמים 1" or course code "02340247".
  - "ATAM" if email mentions "ארגון ותכנות המחשב", "את"ם", "ATAM", or course code "02340118".
- Today's date for reference: ${new Date().toISOString().split("T")[0]}
- Resolve relative dates (e.g. "this Sunday", "next Thursday", "tomorrow") into absolute calendar dates using today's date.
- Never use relative wording in dueAt/displayDate. If a relative date appears in the email, convert it to an absolute date.
- One email can produce multiple items if it mentions multiple deadlines or events.
- If no specific date/time is mentioned, set dueAt to null and use a descriptive displayDate like "TBD".`;

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

  const ts = Date.parse(dueAt);
  if (Number.isNaN(ts)) return false;

  const actual = new Date(ts).getUTCDay();
  return actual === expected;
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

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function nextWeekdayAtTime(weekday: number, hour: number, minute: number): Date {
  const now = new Date();
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setHours(hour, minute, 0, 0);

  const currentWeekday = now.getDay();
  let dayDelta = (weekday - currentWeekday + 7) % 7;

  // If the target time for "today" already passed, move to next week.
  if (dayDelta === 0 && target.getTime() <= now.getTime()) {
    dayDelta = 7;
  }

  target.setDate(now.getDate() + dayDelta);
  return target;
}

function toLocalIsoNoTimezone(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function toDisplayDate(date: Date): string {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${weekday}, ${month} ${day}, ${year} · ${hh}:${mm}`;
}

function tryHeuristicFallbackExtraction(
  subject: string,
  body: string,
  emailFrom: string | undefined,
  inferredCourse: Exclude<Course, "General"> | null,
): DeadlineItem[] {
  const text = `${subject}\n${body}`;
  const lower = text.toLowerCase();

  const looksHomework = /\b(hw|homework|assignment|exercise)\b|תרגיל\s*בית|מטלה/.test(lower);
  const hasDeadlineSignal = /\bdue\b|\bdeadline\b|submit|submission|להגיש|הגשה/.test(lower);
  if (!looksHomework || !hasDeadlineSignal) return [];

  const hwNumber = text.match(/(?:\bHW\b|homework|assignment)\s*(\d{1,3})/i)?.[1];
  const title = hwNumber ? `HW${hwNumber}` : "Homework";

  let dueAt = "";
  let displayDate = "TBD";

  const weekdayMatch = text.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b(?:\s+at\s+(\d{1,2}):(\d{2}))?/i,
  );

  if (weekdayMatch) {
    const weekday = WEEKDAY_INDEX[weekdayMatch[1].toLowerCase()];
    const hour = Number(weekdayMatch[2] ?? "23");
    const minute = Number(weekdayMatch[3] ?? "59");
    const target = nextWeekdayAtTime(weekday, hour, minute);
    dueAt = toLocalIsoNoTimezone(target);
    displayDate = toDisplayDate(target);
  }

  const course: Course = inferredCourse ?? "General";

  return [
    {
      id: randomUUID(),
      category: "Course",
      course,
      title,
      type: "Homework",
      dueAt,
      displayDate,
      description: `Submission deadline for ${title}.`,
      status: "Upcoming",
      sourceSentence: body.trim() || subject,
    },
  ];
}

export async function extractFromEmail(
  subject: string,
  body: string,
  emailFrom?: string,
): Promise<ExtractionResult> {
  const userMessage = `Email from: ${emailFrom ?? "(unknown)"}\nEmail subject: ${subject}\n\nEmail body:\n${body}`;

  // Backup classifier for cases where course appears only in sender name/address.
  const inferredCourse = inferCourseFromText(`${emailFrom ?? ""}\n${subject}\n${body}`);

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
  const items: DeadlineItem[] = parsed.items
    .map((item) => {
      const category = classifyItemCategory(item.type as DeadlineType);
      const normalizedCourse: Course = SUPPORTED_COURSES.includes(item.course as Course)
        ? (item.course as Course)
        : "General";
      const finalCourse: Course =
        category === "Course" && inferredCourse ? inferredCourse : normalizedCourse;

      return {
        ...item,
        id: randomUUID(),
        category,
        course: finalCourse,
        type: item.type as DeadlineType,
        status: item.status as DeadlineStatus,
        dueAt: item.dueAt ?? "",
        displayDate: item.displayDate ?? "TBD",
      };
    })
    .map(normalizeHomeworkDeadlineText)
    .filter((item) => !failsDateQualityGate(item))
    .filter((item) => !isHomeworkAnnouncementWithoutDeadline(item));

  if (items.length === 0) {
    const fallbackItems = tryHeuristicFallbackExtraction(subject, body, emailFrom, inferredCourse);
    if (fallbackItems.length > 0) {
      return { relevant: true, items: fallbackItems };
    }
    return { relevant: false, items: [] };
  }

  return { relevant: true, items };
}
