import { defineEventHandler } from "h3";
import { getDb } from "../../src/lib/db";

export default defineEventHandler(() => {
  const db = getDb();
  const rows = db
    .query(`
      SELECT
        id,
        course,
        title,
        type,
        due_at          AS dueAt,
        display_date    AS displayDate,
        description,
        status,
        source_sentence AS sourceSentence
      FROM deadline_items
      ORDER BY due_at ASC
    `)
    .all();

  return rows;
});
