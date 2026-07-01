import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { DeadlineCategory, DeadlineItem, DeadlineStatus } from "../data/mockDeadlineItems";
import {
  formatDueAtDisplayDate,
  normalizeDeadlineDueAtFromSource,
  parseDeadlineDueAt,
} from "./timezone";

const DATA_PATH = join(process.cwd(), "data.json");
const PROCESSED_PATH = join(process.cwd(), "processed-messages.json");

function getItemCategory(item: Pick<DeadlineItem, "type" | "course">): DeadlineCategory {
  return item.type === "Homework" || item.type === "Quiz/Exam" ? "Course" : "Other";
}

function toTimestampOrNull(dueAt: string): number | null {
  const parsed = parseDeadlineDueAt(dueAt);
  return parsed ? parsed.getTime() : null;
}

function toDisplayDateTimestampOrNull(displayDate: string): number | null {
  const m = displayDate.match(/^[A-Za-z]{3},\s+[A-Za-z]{3}\s+\d{1,2},\s+\d{4}/);
  const datePart = m?.[0] ?? "";
  const ts = Date.parse(datePart);
  return Number.isNaN(ts) ? null : ts;
}

function toSortableTimestamp(item: DeadlineItem): number | null {
  const dueTs = toTimestampOrNull(item.dueAt);
  if (dueTs !== null) return dueTs;
  return toDisplayDateTimestampOrNull(item.displayDate);
}

function compareByDueAt(a: DeadlineItem, b: DeadlineItem): number {
  const aTs = toSortableTimestamp(a);
  const bTs = toSortableTimestamp(b);

  if (aTs !== null && bTs !== null) return aTs - bTs;
  if (aTs !== null) return -1;
  if (bTs !== null) return 1;
  return a.title.localeCompare(b.title);
}

function computeStatus(item: DeadlineItem): DeadlineStatus {
  if (item.status === "Completed") return "Completed";

  const dueTs = toTimestampOrNull(item.dueAt);
  if (dueTs === null) return "Upcoming";

  const diff = dueTs - Date.now();
  if (diff < 0) return "Expired";
  if (diff < 48 * 60 * 60 * 1000) return "Urgent";
  return "Upcoming";
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSemanticTitleKey(item: DeadlineItem): string {
  const base = normalizeTitleKey(item.title);

  if (item.type !== "Homework") return base;

  const canonical = base
    .replace(/\bhome\s*work\b/g, "homework")
    .replace(/\bexercise\b/g, "assignment");

  const numberMatch = canonical.match(/\b(?:hw|homework|assignment)\s*(\d{1,3})\b/);
  if (numberMatch) return `hw${numberMatch[1]}`;

  const reverseNumberMatch = canonical.match(/\b(\d{1,3})\s*(?:hw|homework|assignment)\b/);
  if (reverseNumberMatch) return `hw${reverseNumberMatch[1]}`;

  return canonical;
}

function isLikelySameAssignmentWindow(existing: DeadlineItem, incoming: DeadlineItem): boolean {
  const existingTs = toTimestampOrNull(existing.dueAt);
  const incomingTs = toTimestampOrNull(incoming.dueAt);
  if (existingTs === null || incomingTs === null) return true;

  const diffDays = Math.abs(existingTs - incomingTs) / (24 * 60 * 60 * 1000);
  return diffDays <= 120;
}

function isLogicalDuplicate(existing: DeadlineItem, incoming: DeadlineItem): boolean {
  return (
    existing.course === incoming.course &&
    existing.type === incoming.type &&
    normalizeSemanticTitleKey(existing) === normalizeSemanticTitleKey(incoming) &&
    isLikelySameAssignmentWindow(existing, incoming)
  );
}

function findLogicalDuplicateIndex(items: DeadlineItem[], incoming: DeadlineItem): number {
  return items.findIndex((existing) => isLogicalDuplicate(existing, incoming));
}

function mergeDuplicate(base: DeadlineItem, incoming: DeadlineItem): DeadlineItem {
  return {
    ...base,
    ...incoming,
    id: base.id,
    status: incoming.status,
  };
}

function dedupeDeadlines(items: DeadlineItem[]): DeadlineItem[] {
  const deduped: DeadlineItem[] = [];

  for (const item of items) {
    const existingIdx = deduped.findIndex((existing) => isLogicalDuplicate(existing, item));
    if (existingIdx < 0) {
      deduped.push(item);
      continue;
    }

    deduped[existingIdx] = mergeDuplicate(deduped[existingIdx], item);
  }

  return deduped;
}

function readProcessed(): Set<string> {
  if (!existsSync(PROCESSED_PATH)) return new Set();
  return new Set(JSON.parse(readFileSync(PROCESSED_PATH, "utf-8")) as string[]);
}

export function isMessageProcessed(gmailMessageId: string): boolean {
  return readProcessed().has(gmailMessageId);
}

export function markMessageProcessed(gmailMessageId: string): void {
  const ids = readProcessed();
  ids.add(gmailMessageId);
  writeFileSync(PROCESSED_PATH, JSON.stringify([...ids], null, 2), "utf-8");
}

function readData(): DeadlineItem[] {
  if (!existsSync(DATA_PATH)) {
    writeFileSync(DATA_PATH, JSON.stringify([], null, 2), "utf-8");
    return [];
  }

  const parsed = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as DeadlineItem[];
  const normalized = parsed.map((item) => {
    const dueAt = normalizeDeadlineDueAtFromSource(item.dueAt ?? "", item.sourceSentence ?? "");
    return {
      ...item,
      dueAt,
      displayDate: dueAt ? formatDueAtDisplayDate(dueAt) : item.displayDate,
    };
  });
  const deduped = dedupeDeadlines(normalized);

  const changed = JSON.stringify(parsed) !== JSON.stringify(deduped);
  if (deduped.length !== parsed.length || changed) {
    writeFileSync(DATA_PATH, JSON.stringify(deduped, null, 2), "utf-8");
  }

  return deduped;
}

export function getAllDeadlines(): DeadlineItem[] {
  return readData()
    .map((item) => ({
      ...item,
      category: item.category ?? getItemCategory(item),
      status: computeStatus(item),
    }))
    .sort(compareByDueAt);
}

export function saveDeadline(item: DeadlineItem): void {
  const items = readData();
  const normalizedDueAt = normalizeDeadlineDueAtFromSource(item.dueAt ?? "", item.sourceSentence ?? "");
  const normalizedItem = {
    ...item,
    category: item.category ?? getItemCategory(item),
    dueAt: normalizedDueAt,
    displayDate: normalizedDueAt ? formatDueAtDisplayDate(normalizedDueAt) : item.displayDate,
  };
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    items[idx] = normalizedItem;
  } else {
    const logicalIdx = findLogicalDuplicateIndex(items, normalizedItem);
    if (logicalIdx >= 0) {
      const existing = items[logicalIdx];
      items[logicalIdx] = {
        ...normalizedItem,
        id: existing.id,
        status: normalizedItem.status,
      };
    } else {
      items.push(normalizedItem);
    }
  }
  writeFileSync(DATA_PATH, JSON.stringify(items, null, 2), "utf-8");
}
