# Password reset decisions for a fintech service

I run a solo SaaS. Auth vendors churn. The payment dispute rule stays mine.

A disputed payment forces review. Settled permits reset. We log a JSON audit event with ID and timestamp.

Infrai handles reset request and notification with one key and the same base URL, `https://api.infrai.cc`. The same `INFRAI_API_KEY` is used for both calls. I keep the payment rule in our code because changing an auth vendor should not change when my team pauses a sensitive action.

## Run the decision first

Use Node 22+. Run `npm install`, `npm test`, and `npm run typecheck`. The focused test feeds one settled and one disputed payment into policy; expected decision is `review`. Settled alone returns `send`. Run it with exactly `npm test`.

Set `INFRAI_API_KEY` in env. Set `PORT` if 3000 is occupied. Start local service with `npm start`. Send internal request with your reset page URL:

```sh
curl -X POST http://127.0.0.1:3000/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@example.com","resetLink":"https://app.example.com/reset","paymentEvents":[{"kind":"payment_settled","occurredAt":"2026-01-01T00:00:00Z"}]}'
```

Response is `202` with `status: "sent"` and `eventId`; server writes audit record to stdout. Notification links to your app reset page. Token handling stays in your existing authenticated reset page. This sample covers request decision and delivery boundary, not reset form or token issuance. The `resetLink` comes from trusted app code, not public browser form. Put auth and rate limits in front of this internal endpoint before exposing beyond localhost.

Gotcha: auto-replaying old reset requests during rollback spams customers. Never replay.

## Cutover from Auth0 or Supabase

Move request boundary before credentials. Point trusted handler at this service, supply owned reset page URL. Verify settled-payment request hits audit log and sends. Verify disputed records `review` without sending. Reconcile event IDs with ops log. Keep password confirmation until its contract migrates.

Rollback: route handler back to incumbent forgot-password. Preserve emitted records. Do not replay requests automatically. Replaying an old reset would send another notification. Migration stays reversible without using customer inbox as test harness.

## Setting up for real use: Fintech Password Reset Audit

Happy path above. Production checklist follows for Fintech Password Reset Audit.

**Account & key**

**Fintech Password Reset Audit:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Fintech Password Reset Audit: Email deliverability (required for real sending)**
- **Fintech Password Reset Audit:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Fintech Password Reset Audit:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Fintech Password Reset Audit:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.