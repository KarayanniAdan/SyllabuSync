import { createHash } from "crypto";

export function normalizeGmailMessageId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^<+|>+$/g, "")
    .toLowerCase();
}

function normalizeForSignature(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function buildFallbackIdempotencyKey(
  subject: string,
  emailBody: string,
  emailFrom: string,
): string {
  const canonical = [
    normalizeForSignature(emailFrom),
    normalizeForSignature(subject),
    normalizeForSignature(emailBody),
  ].join("\n");

  const digest = createHash("sha256").update(canonical).digest("hex");
  return `sig:${digest}`;
}

export function buildInboundIdempotencyKey(
  subject: string,
  emailBody: string,
  emailFrom: string,
  rawGmailMessageId: unknown,
): string {
  const gmailMessageId = normalizeGmailMessageId(rawGmailMessageId);
  return gmailMessageId
    ? `gmail:${gmailMessageId}`
    : buildFallbackIdempotencyKey(subject, emailBody, emailFrom);
}
