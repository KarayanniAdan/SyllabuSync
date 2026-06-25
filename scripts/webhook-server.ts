/**
 * Standalone webhook server for receiving Mailgun inbound emails.
 * Runs separately from the Vite dev server on port 3002.
 * Run with: bun run scripts/webhook-server.ts
 */

import "dotenv/config";
import { extractFromEmail } from "../src/lib/extract";
import { saveDeadline, isMessageProcessed, markMessageProcessed } from "../src/lib/db";
import { buildInboundIdempotencyKey } from "../src/lib/inbound-idempotency";

const PORT = 3002;

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);

    // Health check
    if (req.method === "GET" && url.pathname === "/") {
      return Response.json({ ok: true, service: "SyllabuSync webhook" });
    }

    // Email webhook
    if (req.method === "POST" && url.pathname === "/api/inbound-email") {
      try {
        const contentType = req.headers.get("content-type") ?? "";
        let subject = "";
        let emailBody = "";
        let emailFrom = "";

        let gmailMessageId: string | null = null;

        if (
          contentType.includes("multipart/form-data") ||
          contentType.includes("application/x-www-form-urlencoded")
        ) {
          const form = await req.formData();
          subject = (form.get("subject") as string) ?? "(no subject)";
          emailBody = (form.get("body-plain") as string) ?? (form.get("body-html") as string) ?? "";
          emailFrom = (form.get("from") as string) ?? "";
          gmailMessageId = (form.get("gmailMessageId") as string) ?? null;
        } else {
          const json = (await req.json()) as Record<string, string>;
          subject = json["subject"] ?? "(no subject)";
          emailBody = json["body-plain"] ?? json["body"] ?? "";
          emailFrom = json["from"] ?? "";
          gmailMessageId = json["gmailMessageId"] ?? null;
        }

        const idempotencyKey = buildInboundIdempotencyKey(
          subject,
          emailBody,
          emailFrom,
          gmailMessageId,
        );

        // Deduplicate by normalized Gmail message ID or deterministic content signature.
        if (isMessageProcessed(idempotencyKey)) {
          console.log(`\n⏭️  Already processed: "${subject}" (${idempotencyKey})`);
          return Response.json({ ok: true, extracted: 0, reason: "already processed" });
        }

        console.log(`\n📧 Received: "${subject}" from ${emailFrom}`);

        if (!emailBody.trim()) {
          return Response.json({ ok: false, reason: "empty body" });
        }

        const result = await extractFromEmail(subject, emailBody, emailFrom);

        if (!result.relevant || result.items.length === 0) {
          console.log("   ↳ Not relevant, skipped.");
          return Response.json({ ok: true, extracted: 0, reason: "not relevant" });
        }

        for (const item of result.items) {
          saveDeadline(item);
          console.log(`   ✅ Saved: [${item.course}] ${item.title} — ${item.displayDate}`);
        }

        markMessageProcessed(idempotencyKey);

        return Response.json({ ok: true, extracted: result.items.length });
      } catch (err) {
        console.error("Webhook error:", err);
        return Response.json({ ok: false, error: String(err) }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`\n🚀 Webhook server running on http://localhost:${PORT}`);
console.log(`📬 Endpoint: POST http://localhost:${PORT}/api/inbound-email`);
console.log(`🔍 Health:   GET  http://localhost:${PORT}/\n`);
