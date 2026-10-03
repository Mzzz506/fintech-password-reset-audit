import assert from "node:assert/strict";
import { test } from "node:test";
import { resetDecision } from "../src/reset_policy.js";

test("a disputed payment holds the reset for manual review", () => {
  assert.equal(resetDecision([
    { kind: "payment_settled", occurredAt: "2026-01-01T00:00:00Z" },
    { kind: "payment_disputed", occurredAt: "2026-01-02T00:00:00Z" }
  ]), "review");
  assert.equal(resetDecision([
    { kind: "payment_settled", occurredAt: "2026-01-01T00:00:00Z" }
  ]), "send");
});
