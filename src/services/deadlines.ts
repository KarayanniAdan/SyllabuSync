import { mockDeadlineItems, type DeadlineItem } from "@/data/mockDeadlineItems";

export async function getDeadlines(): Promise<DeadlineItem[]> {
  // Future: replace with real API fetch.
  const items = [...mockDeadlineItems];
  items.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  return items;
}
