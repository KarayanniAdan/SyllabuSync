import { createClient } from "@supabase/supabase-js";

import type { DeadlineCategory, DeadlineItem } from "../../src/data/mockDeadlineItems";
import {
  formatDueAtDisplayDate,
  normalizeDeadlineDueAtFromSource,
} from "../../src/lib/timezone";
import { isAmbiguousVariantExtension, isLogicalDuplicate } from "../../src/lib/homework-identity";

function firstEnvLine(value: string | undefined): string | undefined {
  return value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

const supabaseUrl = firstEnvLine(process.env.SUPABASE_URL);
const supabaseServiceRoleKey = firstEnvLine(process.env.SUPABASE_SERVICE_ROLE_KEY);

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

async function findLogicalDuplicate(
  item: DeadlineItem,
): Promise<{ match: DeadlineItem | null; skip: boolean }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("deadline_items").select("*");

  if (error) {
    throw error;
  }

  const existingItems = (data ?? []).map(rowToDeadlineItem);
  const match = existingItems.find((existing) => isLogicalDuplicate(existing, item)) ?? null;
  return { match, skip: !match && isAmbiguousVariantExtension(existingItems, item) };
}

function rowToDeadlineItem(row: any): DeadlineItem {
  const normalizationContext = [row.source_sentence, row.title, row.description, row.display_date]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join("\n");
  const dueAt = normalizeDeadlineDueAtFromSource(row.due_at ?? "", normalizationContext);

  return {
    id: row.id,
    category: row.category ?? getItemCategory(row),
    course: row.course,
    title: row.title,
    type: row.type,
    dueAt,
    displayDate: dueAt ? formatDueAtDisplayDate(dueAt) : (row.display_date ?? "TBD"),
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
  const normalizationContext = [item.sourceSentence, item.title, item.description, item.displayDate]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join("\n");
  const normalizedDueAt = normalizeDeadlineDueAtFromSource(item.dueAt ?? "", normalizationContext);
  const normalizedItem: DeadlineItem = {
    ...item,
    dueAt: normalizedDueAt,
    displayDate: normalizedDueAt ? formatDueAtDisplayDate(normalizedDueAt) : item.displayDate,
  };

  const { match: existing, skip } = await findLogicalDuplicate(normalizedItem);
  if (skip) return;
  const targetItem = existing ? { ...normalizedItem, id: existing.id } : normalizedItem;

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