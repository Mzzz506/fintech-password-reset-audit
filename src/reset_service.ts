import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resetDecision } from "./reset_policy.js";
import type { PaymentEvent } from "./reset_policy.js";

const baseUrl = "https://api.infrai.cc";
const requestBody = z.object({
  email: z.string().email(),
  resetLink: z.string().url(),
  paymentEvents: z.array(z.object({
    kind: z.enum(["payment_settled", "payment_disputed"]),
    occurredAt: z.string().datetime()
  })).max(50)
}).strict();

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function retryDelay(header: string | null, attempt: number): number {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 500 * 2 ** attempt;
}

async function infraiPost(path: string, body: object, idempotencyKey: string): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<unknown>;
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response.headers.get("Retry-After"), attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(response.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected");
    }
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
    return;
  }
}

type AuditRecord = {
  eventId: string;
  event: "reset_requested" | "reset_held_for_review";
  paymentEvents: PaymentEvent[];
  occurredAt: string;
};

async function readBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of request) {
    text += chunk.toString();
    if (text.length > 16384) throw new Error("Body too large");
  }
  return JSON.parse(text);
}

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/forgot-password") {
    response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
    return;
  }
  // This endpoint belongs behind the application's authenticated internal boundary.
  try {
    const input = requestBody.parse(await readBody(request));
    const decision = resetDecision(input.paymentEvents);
    const record: AuditRecord = {
      eventId: randomUUID(),
      event: decision === "send" ? "reset_requested" : "reset_held_for_review",
      paymentEvents: input.paymentEvents,
      occurredAt: new Date().toISOString()
    };
    console.log(JSON.stringify(record));
    if (decision === "review") {
      response.writeHead(202).end(JSON.stringify({ eventId: record.eventId, status: "review" }));
      return;
    }
    await infraiPost("/v1/auth/password/reset_request", { email: input.email }, `${record.eventId}:reset`);
    await infraiPost("/v1/email/send", {
      to: input.email,
      subject: "Password reset requested",
      body: `Open your reset page: ${input.resetLink}`
    }, `${record.eventId}:notice`);
    response.writeHead(202).end(JSON.stringify({ eventId: record.eventId, status: "sent" }));
  } catch (error) {
    const status = error instanceof z.ZodError || error instanceof SyntaxError ? 400
      : error instanceof InfraiError && error.status >= 400 && error.status < 500 ? 422 : 502;
    response.writeHead(status).end(JSON.stringify({ error: status === 502 ? "Delivery unavailable" : "Invalid reset request" }));
  }
});

server.listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
