import { useEffect, useState } from "react";
import { getDeadlines } from "@/services/deadlines";
import type { DeadlineItem } from "@/data/mockDeadlineItems";

export function useDeadlines() {
  const [items, setItems] = useState<DeadlineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getDeadlines().then((d) => {
      if (active) {
        setItems(d);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { items, loading };
}
