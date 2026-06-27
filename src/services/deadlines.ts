import type { DeadlineItem } from "@/data/mockDeadlineItems";

export async function getDeadlines(): Promise<DeadlineItem[]> {
  const response = await fetch("/api/deadlines");

  if (!response.ok) {
    throw new Error(`Failed to fetch deadlines: ${response.status}`);
  }

  return response.json();
}