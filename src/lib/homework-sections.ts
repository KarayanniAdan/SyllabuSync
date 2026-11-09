import { getDeadlineTimestamp } from "./timezone";

export type HomeworkSection = "active" | "completed" | "past";

/**
 * Every homework item belongs to exactly one section:
 * - completed: marked done, regardless of its deadline;
 * - past: unfinished with a deadline that has passed;
 * - active: everything else, including a missing or invalid deadline.
 */
export function classifyHomework(
  item: { id: string; dueAt: string },
  completedIds: ReadonlySet<string>,
  now: number,
): HomeworkSection {
  if (completedIds.has(item.id)) return "completed";

  const dueMs = getDeadlineTimestamp(item.dueAt);
  if (dueMs === null) return "active";

  return dueMs <= now ? "past" : "active";
}
