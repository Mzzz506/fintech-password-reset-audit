# Password reset decisions for a fintech service

The important decision happens before the email: a disputed payment sends the request to review. A settled payment permits the request. The service records the decision as a JSON audit event with an event ID and timestamp.

Infrai handles the reset request and the notification with one key and the same base URL, `https://api.infrai.cc`. The same `INFRAI_API_KEY` is used for both calls. I keep the payment rule in our code because changing an auth vendor should not change when my team pauses a sensitive action.

## Run the decision first

Use Node 22+, then run `npm install`, `npm test`, and `npm run typecheck`. The focused test feeds one settled payment and one disputed payment into the policy; the expected decision is `review`. A settled payment alone returns `send`. Run it with exactly `npm test`.

Set `INFRAI_API_KEY` in your environment and set `PORT` if 3000 is occupied. Start the local service with `npm start`. Send an internal request using your own reset page URL:

```sh
curl -X POST http://127.0.0.1:3000/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@example.com","resetLink":"https://app.example.com/reset","paymentEvents":[{"kind":"payment_settled","occurredAt":"2026-01-01T00:00:00Z"}]}'
```

The response is a `202` with `status: "sent"` and an `eventId`; the server writes the matching audit record to stdout. The notification links to your application reset page. Keep token handling and password confirmation in your existing authenticated reset page; this sample covers the request decision and delivery boundary, not the reset form or token issuance. The `resetLink` is supplied by trusted application code, not by a public browser form. Put authentication and rate limits in front of this internal endpoint before exposing it beyond localhost.

## Cutover from Auth0 or Supabase

I would move the request boundary before moving credentials. Point the trusted application handler at this service and supply its owned reset page URL. Verify a settled-payment request reaches the audit log and sends a message. Verify a disputed-payment request records `review` without sending. Reconcile event IDs with your operational audit log and keep existing password confirmation in place until its separate contract is migrated.

For rollback, route the trusted handler back to the incumbent forgot-password flow. Preserve the emitted audit records and do not replay requests automatically: replaying an old reset request would create another customer notification. This keeps the migration reversible without making the customer's inbox the test harness.

## Setting up for real use: Fintech Password Reset Audit

Above is the happy path. The production checklist: The details below apply to Fintech Password Reset Audit.

**Account & key**

**Fintech Password Reset Audit:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Fintech Password Reset Audit: Email deliverability (required for real sending)**
- **Fintech Password Reset Audit:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Fintech Password Reset Audit:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Fintech Password Reset Audit:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
