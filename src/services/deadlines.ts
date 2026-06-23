import { createServerFn } from "@tanstack/react-start";
import type { DeadlineItem } from "@/data/mockDeadlineItems";

export const getDeadlines = createServerFn().handler(
  async (): Promise<DeadlineItem[]> => {
    const { getAllDeadlines } = await import("../lib/db");
    return getAllDeadlines();
  },
);
