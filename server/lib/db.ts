import { createClient } from "@supabase/supabase-js";

import type { DeadlineItem } from "../../src/data/mockDeadlineItems";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function rowToDeadlineItem(row: any): DeadlineItem {
  return {
    id: row.id,
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
  const { error } = await supabase.from("deadline_items").upsert(
    {
      id: item.id,
      course: item.course,
      title: item.title,
      type: item.type,
      due_at: item.dueAt || null,
      display_date: item.displayDate || "TBD",
      description: item.description,
      status: item.status,
      source_sentence: item.sourceSentence ?? "",
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

  const { error } = await supabase.from("processed_messages").upsert({
    gmail_message_id: messageKey,
  });

  if (error) {
    throw error;
  }
}