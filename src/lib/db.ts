import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { DeadlineItem } from "../data/mockDeadlineItems";

const DATA_PATH = join(process.cwd(), "data.json");
const PROCESSED_PATH = join(process.cwd(), "processed-messages.json");

function toTimestampOrNull(dueAt: string): number | null {
  const ts = Date.parse(dueAt);
  return Number.isNaN(ts) ? null : ts;
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
  return JSON.parse(readFileSync(DATA_PATH, "utf-8")) as DeadlineItem[];
}

export function getAllDeadlines(): DeadlineItem[] {
  return readData().sort(compareByDueAt);
}

export function saveDeadline(item: DeadlineItem): void {
  const items = readData();
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  writeFileSync(DATA_PATH, JSON.stringify(items, null, 2), "utf-8");
}
