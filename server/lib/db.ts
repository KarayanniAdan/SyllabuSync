import { createClient } from "@supabase/supabase-js";

import type { DeadlineCategory, DeadlineItem } from "../../src/data/mockDeadlineItems";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseClient:
  | ReturnType<typeof createClient>
  | undefined;

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}

function getItemCategory(item: Pick<DeadlineItem, "type" | "course">): DeadlineCategory {
  return item.type === "Homework" || item.type === "Quiz/Exam" ? "Course" : "Other";
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

function toTimestampOrNull(dueAt: string): number | null {
  const ts = Date.parse(dueAt);
  return Number.isNaN(ts) ? null : ts;
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
    existing.category === incoming.category &&
    existing.course === incoming.course &&
    existing.type === incoming.type &&
    normalizeSemanticTitleKey(existing) === normalizeSemanticTitleKey(incoming) &&
    isLikelySameAssignmentWindow(existing, incoming)
  );
}

async function findLogicalDuplicate(item: DeadlineItem): Promise<DeadlineItem | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("deadline_items").select("*");

  if (error) {
    throw error;
  }

  const existingItems = (data ?? []).map(rowToDeadlineItem);
  return existingItems.find((existing) => isLogicalDuplicate(existing, item)) ?? null;
}

function rowToDeadlineItem(row: any): DeadlineItem {
  return {
    id: row.id,
    category: row.category ?? getItemCategory(row),
    course: row.course,
    title: row.title,
    type: row.type,
    dueAt: row.due_at ?? "",
    displayDate: row.display_date ?? "TBD",
    description: row.description,
    status: row.status,
    sourceSentence: row.source_sentence ?? "",
  };
}

export async function getAllDeadlines(): Promise<DeadlineItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("deadline_items")
    .select("*")
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(rowToDeadlineItem);
}

export async function saveDeadline(item: DeadlineItem): Promise<void> {
  const supabase = getSupabase();
  const existing = await findLogicalDuplicate(item);
  const targetItem = existing ? { ...item, id: existing.id } : item;

  const { error } = await supabase.from("deadline_items").upsert(
    {
      id: targetItem.id,
      category: targetItem.category ?? getItemCategory(targetItem),
      course: targetItem.course,
      title: targetItem.title,
      type: targetItem.type,
      due_at: targetItem.dueAt || null,
      display_date: targetItem.displayDate || "TBD",
      description: targetItem.description,
      status: targetItem.status,
      source_sentence: targetItem.sourceSentence ?? "",
    },
    {
      onConflict: "id",
    },
  );

  if (error) {
    throw error;
  }
}

export async function isMessageProcessed(messageKey: string): Promise<boolean> {
  if (!messageKey) {
    return false;
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("processed_messages")
    .select("gmail_message_id")
    .eq("gmail_message_id", messageKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function markMessageProcessed(messageKey: string): Promise<void> {
  if (!messageKey) {
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("processed_messages").upsert({
    gmail_message_id: messageKey,
  });

  if (error) {
    throw error;
  }
}