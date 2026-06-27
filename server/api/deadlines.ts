import { defineEventHandler } from "h3";
import { getAllDeadlines } from "../lib/db";

export default defineEventHandler(() => {
  return getAllDeadlines();
});
