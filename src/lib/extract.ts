import OpenAI from "openai";
import "dotenv/config";
import type { DeadlineItem, Course, DeadlineType, DeadlineStatus } from "../data/mockDeadlineItems";
import { randomUUID } from "crypto";

const SUPPORTED_COURSES: Course[] = [
  "Data Structures",
  "Operating Systems",
  "Digital Systems",
  "Linear Algebra",
  "General",
];

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
      "course": one of: "Data Structures" | "Operating Systems" | "Digital Systems" | "Linear Algebra" | "General",
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
- Today's date for reference: ${new Date().toISOString().split("T")[0]}
- One email can produce multiple items if it mentions multiple deadlines or events.
- If no specific date/time is mentioned, set dueAt to null and use a descriptive displayDate like "TBD".`;

export async function extractFromEmail(
  subject: string,
  body: string,
  emailFrom?: string,
): Promise<ExtractionResult> {
  const userMessage = `Email subject: ${subject}\n\nEmail body:\n${body}`;

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
  const items: DeadlineItem[] = parsed.items.map((item) => ({
    ...item,
    id: randomUUID(),
    course: SUPPORTED_COURSES.includes(item.course as Course)
      ? (item.course as Course)
      : "General",
    type: item.type as DeadlineType,
    status: item.status as DeadlineStatus,
    dueAt: item.dueAt ?? "",
    displayDate: item.displayDate ?? "TBD",
  }));

  return { relevant: true, items };
}
