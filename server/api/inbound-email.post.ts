import { defineEventHandler, readBody } from "h3";
import "dotenv/config";
import { extractFromEmail } from "../../src/lib/extract";
import { saveDeadline, isMessageProcessed, markMessageProcessed } from "../../src/lib/db";
import { buildInboundIdempotencyKey } from "../../src/lib/inbound-idempotency";

// Mailgun sends form-encoded POST data with these fields:
// - subject: email subject
// - body-plain: plain text body
// - body-html: HTML body
// - from: sender address
// - recipient: the address it was sent to

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const subject: string = body["subject"] ?? "(no subject)";
  const emailBody: string = body["body-plain"] ?? body["body-html"] ?? "";
  const emailFrom: string = body["from"] ?? "";
  const idempotencyKey = buildInboundIdempotencyKey(
    subject,
    emailBody,
    emailFrom,
    body["gmailMessageId"],
  );

  if (isMessageProcessed(idempotencyKey)) {
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
    saveDeadline(item);
  }

  markMessageProcessed(idempotencyKey);

  return { ok: true, extracted: result.items.length };
});
