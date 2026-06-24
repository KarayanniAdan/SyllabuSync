import { defineEventHandler } from "h3";
import { getAllDeadlines } from "../../src/lib/db";

export default defineEventHandler(() => {
  return getAllDeadlines();
});
