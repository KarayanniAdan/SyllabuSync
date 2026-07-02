import { defineEventHandler, readBody } from "h3";
import "dotenv/config";
import { extractFromEmail } from "../../src/lib/extract";
import {
  saveDeadline,
  isMessageProcessed,
  markMessageProcessed,
} from "../lib/db";
import { buildInboundIdempotencyKey } from "../../src/lib/inbound-idempotency";

// Mailgun sends form-encoded POST data with these fields:
// - subject: email subject
// - body-plain: plain text body
// - body-html: HTML body
// - from: sender address
// - recipient: the address it was sent to
//
// Our manual PowerShell / Apps Script test sends:
// - body: email body

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function isListservSystemEmail(
  subject: string,
  emailBody: string,
  emailFrom: string,
): boolean {
  const s = subject.toLowerCase();
  const b = emailBody.toLowerCase();
  const f = emailFrom.toLowerCase();

  const mentionsListserv =
    f.includes("listserv") ||
    s.includes("listserv") ||
    b.includes("listserv.technion.ac.il") ||
    b.includes("@listserv.technion.ac.il");

  const systemSubject = includesAny(s, [
    "confirm your subscription",
    "subscription confirmation",
    "you are now subscribed",
    "command confirmation",
    "listserv command response",
    "your command:",
  ]);

  const systemBody = includesAny(b, [
    "you have been added to the",
    "you are now subscribed to the",
    "your request to subscribe",
    "to join the list",
    "your command:",
    "subscription confirmation",
    "listserv command response",
  ]);

  const welcomeToMailingList =
    s.includes("welcome to") && (s.includes("-l") || b.includes("mailing list"));

  return systemSubject || (mentionsListserv && (systemBody || welcomeToMailingList));
}

function isHomeworkItem(item: unknown): boolean {
  const raw = item as Record<string, unknown>;

  const type = asString(raw["type"]).toLowerCase();
  const category = asString(raw["category"]).toLowerCase();
  const title = asString(raw["title"]).toLowerCase();
  const description = asString(raw["description"]).toLowerCase();
  const sourceSentence =
    asString(raw["source_sentence"]).toLowerCase() ||
    asString(raw["sourceSentence"]).toLowerCase();

  const text = `${type} ${category} ${title} ${description} ${sourceSentence}`;

  const looksLikeHomework =
    type.includes("homework") ||
    type.includes("assignment") ||
    category.includes("homework") ||
    category.includes("assignment") ||
    text.includes("homework") ||
    text.includes("assignment") ||
    text.includes("exercise") ||
    text.includes("problem set") ||
    text.includes("submit") ||
    text.includes("submission") ||
    text.includes("due");

  const looksLikeNonHomework =
    type.includes("activity") ||
    type.includes("event") ||
    type.includes("announcement") ||
    type.includes("registration") ||
    type.includes("lecture") ||
    type.includes("exam") ||
    category.includes("activity") ||
    category.includes("event") ||
    category.includes("announcement") ||
    category.includes("registration") ||
    category.includes("lecture") ||
    category.includes("exam") ||
    text.includes("festival") ||
    text.includes("party") ||
    text.includes("guest lecture") ||
    text.includes("subscription confirmation") ||
    text.includes("you are now subscribed") ||
    text.includes("welcome to") ||
    text.includes("listserv command response");

  return looksLikeHomework && !looksLikeNonHomework;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event);

    const subject: string = asString(body["subject"]) || "(no subject)";

    const emailBody: string =
      asString(body["body"]) ||
      asString(body["body-plain"]) ||
      asString(body["body-html"]);

    const emailFrom: string = asString(body["from"]);
    const gmailMessageId: string = asString(body["gmailMessageId"]);

    const idempotencyKey = buildInboundIdempotencyKey(
      subject,
      emailBody,
      emailFrom,
      gmailMessageId,
    );

    if (await isMessageProcessed(idempotencyKey)) {
      return {
        ok: true,
        extracted: 0,
        inserted: 0,
        reason: "already processed",
      };
    }

    if (isListservSystemEmail(subject, emailBody, emailFrom)) {
      await markMessageProcessed(idempotencyKey);

      return {
        ok: true,
        ignored: true,
        extracted: 0,
        inserted: 0,
        reason: "LISTSERV system/admin email",
      };
    }

    if (!emailBody.trim()) {
      return {
        ok: false,
        extracted: 0,
        inserted: 0,
        reason: "empty body",
      };
    }

    const result = await extractFromEmail(subject, emailBody, emailFrom);

    if (!result.relevant || result.items.length === 0) {
      await markMessageProcessed(idempotencyKey);

      return {
        ok: true,
        extracted: 0,
        inserted: 0,
        reason: "not relevant",
      };
    }

    const homeworkItems = result.items.filter(isHomeworkItem);

    if (homeworkItems.length === 0) {
      await markMessageProcessed(idempotencyKey);

      return {
        ok: true,
        extracted: result.items.length,
        inserted: 0,
        reason: "no homework items",
      };
    }

    for (const item of homeworkItems) {
      await saveDeadline(item);
    }

    await markMessageProcessed(idempotencyKey);

    return {
      ok: true,
      extracted: result.items.length,
      inserted: homeworkItems.length,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();

    console.error("inbound-email error:", error);

    return {
      ok: false,
      extracted: 0,
      inserted: 0,
      reason: "server error",
      error: message,
    };
  }
});