import type { DeadlineItem } from "../data/mockDeadlineItems";
import { parseDeadlineDueAt } from "./timezone";

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_KIND_KEY = /^(hw|webwork|worksheet)(?!\d)/;

/**
 * Identity key for a homework title. It keeps what distinguishes assignments:
 * the kind (hw / webwork), an explicit number, Wet/Dry and Part qualifiers.
 * A title without a number never gets one (`hw`, `webwork`); a distinctive name is kept as is.
 */
export function normalizeSemanticTitleKey(item: Pick<DeadlineItem, "title" | "type">): string {
  const plain = item.title
    .replace(/רטוב/g, " wet ")
    .replace(/יבש/g, " dry ")
    .replace(/גיליון\s*עבודה|גיליון/g, " worksheet ")
    .replace(/תרגיל\s*בית|מטלה/g, " hw ");
  const base = normalizeTitleKey(plain);

  if (item.type !== "Homework") return base;

  const canonical = base
    .replace(/\bweb\s*work\b/g, "webwork")
    .replace(/\bhome\s*work\b/g, "homework")
    .replace(/\bexercise\b/g, "assignment");

  const isWebwork = /\bwebwork\b/.test(canonical);
  const isWorksheet = /\bworksheet\b/.test(canonical);
  const numberMatch =
    canonical.match(/\b(?:hw|homework|assignment|webwork|worksheet)\s*(\d{1,3})\b/) ??
    canonical.match(/\b(\d{1,3})\s*(?:hw|homework|assignment|webwork|worksheet)\b/);
  const isGeneric = /\b(?:hw|homework|assignment|webwork|worksheet)\b/.test(canonical);

  // Distinctive names (no hw/homework/webwork wording) are compared by name.
  if (!isGeneric && !numberMatch) return canonical;

  const kind = isWebwork ? "webwork" : isWorksheet ? "worksheet" : "hw";
  const qualifiers: string[] = [];
  if (/\bwet\b/.test(canonical)) qualifiers.push("wet");
  if (/\bdry\b/.test(canonical)) qualifiers.push("dry");
  const part = canonical.match(/\bpart\s+([a-z0-9]{1,2})\b/);
  if (part) qualifiers.push(`part ${part[1]}`);

  return [`${kind}${numberMatch ? numberMatch[1] : ""}`, ...qualifiers].join(" ");
}

function toTimestampOrNull(dueAt: string): number | null {
  const parsed = parseDeadlineDueAt(dueAt);
  return parsed ? parsed.getTime() : null;
}

function isLikelySameAssignmentWindow(existing: DeadlineItem, incoming: DeadlineItem): boolean {
  const existingTs = toTimestampOrNull(existing.dueAt);
  const incomingTs = toTimestampOrNull(incoming.dueAt);
  if (existingTs === null || incomingTs === null) return true;

  const diffDays = Math.abs(existingTs - incomingTs) / (24 * 60 * 60 * 1000);
  return diffDays <= 120;
}

function normalizeSource(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Unnumbered generic assignments ("HW", "WebWork") share no identity beyond the same source announcement. */
function isSameUnnumberedAssignment(existing: DeadlineItem, incoming: DeadlineItem): boolean {
  const existingSource = normalizeSource(existing.sourceSentence ?? "");
  return existingSource.length > 0 && existingSource === normalizeSource(incoming.sourceSentence ?? "");
}

// Deliberately narrower than EXTENSION_PATTERN: "moved to Moodle" is not a deadline change.
export const DEADLINE_CHANGE_PATTERN =
  /\bextend(?:ed|s)?\b|\bextension\b|\bpostpone[d]?\b|\bnew\s+deadline\b|הוארך|נדחה|דחייה/i;

/**
 * "HW2 deadline extended" with no plain HW2 on record, only HW2 Wet/Dry/Part variants:
 * it is unclear which variant is meant, so the item must be neither inserted nor applied.
 */
export function isAmbiguousVariantExtension(existingItems: DeadlineItem[], incoming: DeadlineItem): boolean {
  if (incoming.type !== "Homework") return false;
  const key = normalizeSemanticTitleKey(incoming);
  if (!/^(?:hw|webwork|worksheet)\d+$/.test(key)) return false;
  if (!DEADLINE_CHANGE_PATTERN.test(`${incoming.sourceSentence ?? ""}\n${incoming.description ?? ""}`)) return false;

  const sameAssignment = existingItems.filter(
    (existing) =>
      existing.category === incoming.category &&
      existing.course === incoming.course &&
      existing.type === incoming.type,
  );
  if (sameAssignment.some((existing) => normalizeSemanticTitleKey(existing) === key)) return false;
  return sameAssignment.some((existing) => normalizeSemanticTitleKey(existing).startsWith(`${key} `));
}

export function isLogicalDuplicate(existing: DeadlineItem, incoming: DeadlineItem): boolean {
  const key = normalizeSemanticTitleKey(existing);
  if (
    existing.category !== incoming.category ||
    existing.course !== incoming.course ||
    existing.type !== incoming.type ||
    key !== normalizeSemanticTitleKey(incoming)
  ) {
    return false;
  }

  if (existing.type === "Homework" && GENERIC_KIND_KEY.test(key)) {
    return isSameUnnumberedAssignment(existing, incoming);
  }

  return isLikelySameAssignmentWindow(existing, incoming);
}
