export type PaymentEvent = {
  kind: "payment_settled" | "payment_disputed";
  occurredAt: string;
};

export function resetDecision(events: PaymentEvent[]): "send" | "review" {
  return events.some((event) => event.kind === "payment_disputed")
    ? "review"
    : "send";
}
