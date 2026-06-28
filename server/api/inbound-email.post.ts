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
      return { ok: true, extracted: 0, reason: "already processed" };
    }

    if (!emailBody.trim()) {
      return { ok: false, reason: "empty body" };
    }

    const result = await extractFromEmail(subject, emailBody, emailFrom);

    if (!result.relevant || result.items.length === 0) {
      return { ok: true, extracted: 0, reason: "not relevant" };
    }

    for (const item of result.items) {
      await saveDeadline(item);
    }

    await markMessageProcessed(idempotencyKey);

    return { ok: true, extracted: result.items.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("inbound-email error:", error);
    return {
      ok: false,
      extracted: 0,
      reason: "server error",
      error: message,
    };
  }
});