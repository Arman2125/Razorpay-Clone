# Mini Razorpay — API Reference

Base URL: `http://localhost:5000/api`

All responses use a consistent envelope:

```json
{ "success": true, "data": { } }
```
```json
{ "success": false, "error": { "code": "SOME_CODE", "message": "human readable message" } }
```

Every route except `POST /auth/login`, `GET /auth/demo-merchants`, `POST /payment-links/:id/pay`, and `GET /pay/:id` (the public page — see Payment Links below for why those two are intentionally open) requires:

```
Authorization: Bearer <token>
```

The token is a JWT issued at login, carrying `merchantId`. Every merchant-scoped query in the backend filters by the `merchantId` decoded from this token — **never** by any `merchantId` field a client sends in a body/query/param. This is the isolation guarantee described in the Security section below.

---

## Auth

### `GET /auth/demo-merchants`
No auth. Lists active demo merchants (for the login screen).

**Response** `200`
```json
{ "success": true, "data": [{ "merchantId": "mer_...", "businessName": "...", "phoneNumber": "+91..." }] }
```

### `POST /auth/login`
No auth. Looks up a merchant by phone number and issues a JWT.

**Request**
```json
{ "phoneNumber": "+919876543210" }
```

**Response** `200`
```json
{ "success": true, "data": { "token": "eyJ...", "merchant": { "merchantId": "mer_...", "businessName": "..." } } }
```

**Errors**: `400 INVALID_PHONE` (malformed), `401 UNAUTHORIZED` (no merchant for that number, or suspended).

### `GET /auth/me`
Returns the authenticated merchant's profile.

---

## Payments

### `GET /payments`
List payments for the authenticated merchant.

**Query params**: `customer` (name substring), `status` (`pending|paid|failed|expired`), `minAmount`, `maxAmount`, `from`, `to` (ISO dates, filters `createdAt`), `page`, `limit`.

**Response** `200`: `{ items: [...], page, limit, total }`

### `GET /payments/pending`
All pending payments, sorted by due date ascending.

### `GET /payments/overdue`
Pending payments whose `dueDate` has already passed. A subset of `/pending`.

### `GET /payments/pending/priority`
Pending payments enriched with a **deterministic** collection-priority score (0–100) and its factor breakdown (`overdueFactor`, `amountFactor`, `historyFactor`, weights), sorted by score descending. Same inputs always produce the same score — see `services/priorityService.js`.

### `GET /payments/summary`
Aggregate totals for the merchant: `totalPayments`, `totalAmount`, counts/amounts per status, `overdueCount`. Computed via MongoDB aggregation, not cached or hardcoded.

### `POST /payments/search`
Structured search — the primary tool for **ambiguity detection**. Returns *every* match; the caller (Sugam) decides what to do with more than one.

**Request** (all fields optional, combined with AND)
```json
{
  "customerName": "Rahul", "customerId": "cus_...",
  "amount": 25000, "minAmount": 5000, "maxAmount": 50000,
  "status": "pending", "paymentMethod": "UPI",
  "dateFrom": "2026-08-01", "dateTo": "2026-08-31",
  "sortBy": "amount", "sortOrder": "asc",
  "page": 1, "limit": 20
}
```
`amount` (exact) takes priority over `minAmount`/`maxAmount` (range) if both are given. `sortBy` is one of `amount|createdAt|dueDate` (default `createdAt`); `sortOrder` is `asc|desc` (default `desc`).

**Response** `200`: `{ items: [...], count: N }` — unchanged from the original shape when `page`/`limit` are omitted. Passing either one **additively** switches to a paginated response: `{ items: [...] (this page only), count: N (total matches), page, limit, total }`.

### `GET /payments/:paymentId`
A single payment (merchant-scoped). Also writes a `PAYMENT_VIEWED` activity record.

### `GET /payments/:paymentId/status`
Lightweight status-only lookup: `{ paymentId, status, amount, dueDate, paidAt }`.

### `PATCH /payments/:paymentId/status`
Updates a payment's status, enforcing a deterministic state machine (see `services/paymentService.js`):

```
pending -> paid | failed | expired
failed  -> paid | pending
expired -> paid | pending
paid    -> (terminal — no transitions out)
```

**Request**: `{ "status": "paid" }`

**Errors**: `400 INVALID_STATUS` (not a real enum value), `400 INVALID_TRANSITION` (not allowed from current state), `400 NO_STATE_CHANGE` (already that status), `404 PAYMENT_NOT_FOUND`.

On success, sets `paidAt` when transitioning to `paid`, and writes a `PAYMENT_UPDATED` activity record with the before/after status.

---

## Customers

### `GET /customers`
List customers for the merchant, enriched with `totalPayments`, `paidAmount`, `pendingAmount`, `lastPayment`.

**Query params**: `search` (matches name, phone, or company).

### `POST /customers`
**Request**: `{ "name", "phone", "email"?, "company"? }`. `phone` is validated (`400 INVALID_PHONE` if malformed).

### `GET /customers/:customerId`
Single customer with payment totals.

### `PUT /customers/:customerId`
Partial update. `phone`, if provided, is validated.

### `GET /customers/:customerId/payments`
Full payment history for one customer.

---

## Reminders

### `POST /reminders`
Creates a reminder for a pending payment and marks it sent (simulated — no real WhatsApp/SMS is dispatched). This is the **single write path** used by both the dashboard's "Send Reminder" button and (in the future) Sugam.

Two ways to identify the payment:

1. **Exact**: `{ "paymentId": "pay_..." }`
2. **By criteria** (safety net): `{ "customerName": "Rahul", "amount": 25000 }` or `{ "customerId": "cus_...", "amount": 25000 }`

The criteria path exists specifically so the *backend itself* refuses to guess — even if a caller skips a proper `/payments/search` first:

- 0 matches → `404 PAYMENT_NOT_FOUND`
- **>1 matches → `409 AMBIGUOUS_PAYMENT`**, with a `candidates` array (never an arbitrary pick)
- exactly 1 match → proceeds

**Idempotency**: pass an `Idempotency-Key` header (or `idempotencyKey` in the body). A retried request with the same key returns the original reminder (`200`), not a duplicate. Independently, creating a second reminder for the *same payment* within 24 hours — even with a different/no key — is rejected as `409 DUPLICATE_REMINDER`.

**Response** `201` (or `200` if deduped by idempotency key): the reminder document.

**Example ambiguous response**:
```json
{
  "success": false,
  "error": {
    "code": "AMBIGUOUS_PAYMENT",
    "message": "Multiple payments match this request. Ask which one before proceeding.",
    "candidates": [
      { "paymentId": "pay_...", "amount": 25000, "status": "pending", "dueDate": "2026-08-18T..." },
      { "paymentId": "pay_...", "amount": 25000, "status": "pending", "dueDate": "2026-08-21T..." }
    ]
  }
}
```

### `GET /reminders`
List reminders. **Query params**: `status`, `customer`, `paymentId`.

### `GET /reminders/:reminderId`
Single reminder.

---

## Payment Links

A Payment Link is a shareable, standalone request for money — distinct from a `Payment`. A `Payment` in this system represents an existing receivable (an invoice already issued, with its own due date, seeded or created elsewhere). A `PaymentLink` is the *mechanism* a merchant uses to proactively collect a new amount from a customer, with no pre-existing invoice behind it. **The moment a link is paid, that's when a real `Payment` document is created** (`status: paid`, `paymentMethod: UPI`, `paidAt: now`) — the link stores that Payment's `paymentId` for traceability, and the payment immediately shows up in `GET /payments` like any other. Nothing is duplicated: a link never creates a "pending" Payment shadow record, and a completed link always corresponds to exactly one real Payment.

**Auth model — the one deliberate exception in this API.** Creating, listing, viewing, and cancelling links are merchant-authenticated and merchant-scoped, same as everything else. But **paying a link is not a merchant action** — a real customer receiving a payment link has no merchant account. So `POST /payment-links/:id/pay` and the public page `GET /pay/:id` require no `Authorization` header at all. The security boundary for those two routes is knowledge of the `paymentLinkId` itself — exactly how real Razorpay/Stripe payment links work. Every other route on this resource enforces full merchant isolation and is tested accordingly.

### `POST /payment-links`
**Auth required.** Creates a link for the authenticated merchant.

**Request**
```json
{ "customerId": "cus_...", "amount": 5000, "description": "Order #1", "expiresAt": "2026-09-01T00:00:00Z" }
```
or, resolving the customer by name instead of ID:
```json
{ "customerName": "Rahul Sharma", "amount": 5000 }
```
`amount` must be a real JSON number greater than 0 — `0`, negative numbers, `null`, missing, and non-numeric strings are all rejected with `400 INVALID_AMOUNT`.

**Customer resolution** (same safety pattern as reminder creation-by-criteria):
- `customerId` given → exact, merchant-scoped lookup. Not found → `404 CUSTOMER_NOT_FOUND`.
- `customerName` given → case-insensitive substring match against the merchant's customers.
  - 0 matches → `404 CUSTOMER_NOT_FOUND`
  - **>1 matches → `409 AMBIGUOUS_CUSTOMER`** with a `candidates` array (`customerId`, `name`, `phone`, `company`) — never an arbitrary pick.
  - exactly 1 match → proceeds

**Idempotency**: `Idempotency-Key` header (or `idempotencyKey` in the body). A retried request with the same key returns the original link (`200`), never a second one.

**Response** `201` (or `200` if deduped):
```json
{
  "success": true,
  "data": {
    "paymentLinkId": "plink_xxxxx",
    "merchantId": "mer_...",
    "customerId": "cus_xxxxx",
    "amount": 5000,
    "currency": "INR",
    "status": "active",
    "shortUrl": "http://localhost:5000/pay/plink_xxxxx",
    "createdAt": "..."
  }
}
```

### `GET /payment-links`
**Auth required.** Lists the merchant's links. **Query params**: `status`, `customerId`.

### `GET /payment-links/:paymentLinkId`
**Auth required, merchant-scoped.** A non-owning merchant gets `404 PAYMENTLINK_NOT_FOUND` (never a leak, never a 403 that would confirm existence).

### `PATCH /payment-links/:paymentLinkId/status`
**Auth required, merchant-scoped.** Administrative transitions only — accepts `{ "status": "cancelled" }` or `{ "status": "expired" }`. Deterministic state machine:

```
active -> paid | cancelled | expired
paid / cancelled / expired -> (terminal — no transitions out, in either direction)
```

`paid` is **not** a valid target for this endpoint — reaching `paid` always goes through `POST /payment-links/:id/pay`, so the side effects (real `Payment` creation, `PAYMENT_LINK_PAID` activity) can never be skipped by a bare status flip. Attempting it returns `400 INVALID_STATUS` with a message pointing at the correct endpoint.

### `GET /pay/:paymentLinkId`
**No auth — public.** A real server-rendered HTML page (not a JSON endpoint) showing the customer name, amount, and status pulled live from MongoDB, with a "Pay" button when the link is `active`. An expired link is lazily flipped to `status: expired` the moment it's viewed or a payment is attempted against it, so expiry is enforced by the backend, not by the page hiding the button.

### `POST /payment-links/:paymentLinkId/pay`
**No auth — public.** What the page's "Pay" button calls.

1. Loads the link; expired links are flipped to `expired` first.
2. `status !== 'active'` → refused: `409 ALREADY_PAID` if already paid, `409 LINK_NOT_ACTIVE` otherwise (cancelled/expired). No double payment, ever.
3. Creates a real `Payment` document (`status: paid`, `paymentMethod: UPI`, `paidAt: now`).
4. Sets `link.status = 'paid'`, `link.paidAt`, `link.paymentId` (pointing at the Payment just created).
5. Writes a `PAYMENT_LINK_PAID` activity record.

**Response** `200`: `{ link, payment }` — both the updated link and the newly created Payment.

### Activity actions written by this resource
`PAYMENT_LINK_CREATED`, `PAYMENT_LINK_PAID`, `PAYMENT_LINK_CANCELLED`, `PAYMENT_LINK_EXPIRED` — same `Activity` collection as everything else, filterable via `GET /activity?action=PAYMENT_LINK_PAID`.

### Sugam integration contract

```
User: "Rahul Sharma ke liye ₹5,000 ka payment link bana do."
        ↓
Sugam resolves intent semantically (Mini Razorpay does none of this):
{ "intent": "create_payment_link", "customer": "Rahul Sharma", "amount": 5000 }
        ↓
Sugam calls: POST /payment-links  { "customerName": "Rahul Sharma", "amount": 5000 }
(with the merchant's own Bearer token — resolved from the merchant's WhatsApp identity)
        ↓
Mini Razorpay resolves the customer, validates the amount, creates the link,
returns { paymentLinkId, amount, currency, shortUrl }
        ↓
Sugam: "Rahul Sharma ke liye ₹5,000 ka payment link ban gaya hai: <shortUrl>"
```

If `customerName` is ambiguous, Sugam receives `409 AMBIGUOUS_CUSTOMER` with `candidates` and must ask the merchant which customer they meant — exactly the same pattern as ambiguous payment reminders. Mini Razorpay never guesses; Sugam never invents the amount or the link — both come from this API's trusted response.

**Demo/simulated nature**: this is a Mini-Razorpay sandbox payment link, not a real Razorpay payment link — no card/UPI/net-banking gateway is involved. Clicking "Pay" simulates the customer completing payment; the *database state transition* it triggers (`active -> paid`, a real `Payment` created, an audit record written) is fully real, not a fake success message.

---

## Refunds

A Refund is a **separate ledger**, never a mutation of `Payment.status`. A payment that reaches `paid` stays `paid` forever — refunding it never flips it back to `pending`/`failed`, and never invents a `refunded` payment status. How much of a payment remains refundable is always computed on demand from the Refund collection:

```
refundableAmount = payment.amount - sum(amount of "refunded" Refunds for that payment)
```

This demo has no real payment gateway, so any refund that passes validation always simulates instant success — same "the state transition is real, the gateway is not" contract as Payment Links.

### `POST /refunds`
**Auth required.** `{ "paymentId": "pay_...", "amount": 3000, "reason": "Customer request" }`

- The payment must belong to the authenticated merchant (`404 PAYMENT_NOT_FOUND` otherwise) and must have `status: "paid"` (`400 PAYMENT_NOT_PAID` otherwise — refunds never touch pending/failed/expired payments).
- `amount` must be a positive number (`400 INVALID_AMOUNT` for zero, negative, missing, or non-numeric).
- `amount` must not exceed the current refundable balance (`400 REFUND_EXCEEDS_BALANCE`).
- **Idempotency**: `Idempotency-Key` header (or `idempotencyKey` in the body) — a retried request returns the original refund (`200`), never a duplicate.

**Response** `201` (or `200` if deduped): the refund document (`refundId`, `status: "refunded"`, `amount`, `reason`, ...).

### `GET /refunds`
**Auth required.** Query params: `status`, `paymentId`, `customerId`, `page`, `limit` (pagination is opt-in — omit both for the full unpaged list).

### `GET /refunds/:refundId`
**Auth required, merchant-scoped.**

### `GET /payments/:paymentId/refunds`
**Auth required, merchant-scoped.** Full refund history for one payment.

### `GET /payments/:paymentId/refundable`
**Auth required, merchant-scoped.** `{ paymentId, paymentAmount, paymentStatus, refundedAmount, refundableAmount }` — the authoritative, server-computed balance. Never trust a frontend-computed refundable amount.

### Activity actions
`REFUND_CREATED` — filterable via `GET /activity?action=REFUND_CREATED`.

---

## Orders

An Order is a receivable a merchant intends to collect — distinct from a `Payment` (an actual transaction record), same separation Razorpay itself uses. Marking an order `"paid"` is a fulfillment flag; it never fabricates money movement on its own. An existing, already-paid `Payment` can optionally be linked to it (`order.paymentId`) as a traceability pointer.

```
created -> attempted -> paid
created -> attempted -> cancelled
created -> cancelled
```

### `POST /orders`
**Auth required.** `{ "customerId" | "customerName", "amount", "currency"?, "receipt"?, "notes"? }` — same customer resolution rules as Payment Links (`404 CUSTOMER_NOT_FOUND` / `409 AMBIGUOUS_CUSTOMER`). Supports `Idempotency-Key`.

### `GET /orders`
**Auth required.** Query params: `status`, `customerId`, `page`, `limit`.

### `GET /orders/:orderId`
**Auth required, merchant-scoped.**

### `PATCH /orders/:orderId/status`
**Auth required, merchant-scoped.** `{ "status": "attempted" | "paid" | "cancelled", "paymentId"? }`. `paymentId` (optional, only meaningful when marking `"paid"`) must reference an already-`"paid"` Payment belonging to the same merchant and customer — `400 PAYMENT_NOT_PAID` / `404` otherwise.

### Activity actions
`ORDER_CREATED`, `ORDER_UPDATED`.

---

## Invoices

An Invoice is a billing document with its own lifecycle, additive to (never a rename of) Payment or Order:

```
draft -> issued -> paid | cancelled
issued -> overdue (lazy, once dueDate passes — same pattern as Payment Link expiry)
overdue -> paid | cancelled
```

Only a `draft` invoice can be edited (`PATCH /invoices/:id`); editing after issuance is rejected (`400 INVOICE_NOT_DRAFT`).

### `POST /invoices`
**Auth required.** `{ "customerId" | "customerName", "amount", "currency"?, "orderId"?, "description"?, "dueDate"? }`. Creates a `draft`. Supports `Idempotency-Key`.

### `GET /invoices`
**Auth required.** Query params: `status` (querying `"issued"` or `"overdue"` first lazily flips any invoice whose `dueDate` has passed), `customerId`, `page`, `limit`.

### `GET /invoices/:invoiceId`
**Auth required, merchant-scoped.** Also lazily flips to `overdue` if applicable before returning.

### `PATCH /invoices/:invoiceId`
**Auth required, merchant-scoped, draft only.** `{ "amount"?, "description"?, "dueDate"? }`.

### `PATCH /invoices/:invoiceId/status`
**Auth required, merchant-scoped.** `{ "status": "issued" | "paid" | "cancelled", "paymentId"? }`. Sets `issuedAt`/`paidAt` accordingly. `paymentId` is optional and validated the same way as Orders.

### Activity actions
`INVOICE_CREATED`, `INVOICE_ISSUED`, `INVOICE_PAID`, `INVOICE_CANCELLED`, `INVOICE_OVERDUE`.

---

## Subscriptions

Recurring billing schedule + lifecycle, with **no in-process cron or timer**. `nextBillingAt` only ever advances through the deterministic, idempotent `processDueSubscriptions` step — called explicitly via `POST /subscriptions/process-due` — so a server restart can never cause a duplicate or skipped charge. In a production deployment, an external scheduler (a real cron job, a queue consumer) would call that same endpoint on a timer; this demo does not include one, by design (see the codebase-wide rule against fragile in-process schedulers).

```
created -> active (lazily, once startAt arrives) -> paused -> active
active/paused -> cancelled (immediately, or scheduled for the end of the current cycle)
```

### `POST /subscriptions`
**Auth required.** `{ "customerId" | "customerName", "amount", "interval": "day"|"week"|"month"|"year", "intervalCount"?, "planId"?, "startAt"? }`. A `startAt` in the future leaves the subscription `"created"`; omitted/past/now activates it immediately. Supports `Idempotency-Key`.

### `GET /subscriptions`
**Auth required.** Query params: `status`, `customerId`, `page`, `limit`.

### `GET /subscriptions/:subscriptionId`
**Auth required, merchant-scoped.**

### `PATCH /subscriptions/:subscriptionId/status`
**Auth required, merchant-scoped.** `{ "status": "active" | "paused" | "cancelled", "atCycleEnd"? }`.
- `"paused"`: only from `active`. Billing stops; `nextBillingAt` is frozen.
- `"active"` (resume): only from `paused`. If the frozen `nextBillingAt` is now in the past, it is reset to "now" — resuming **never** bills for cycles missed while paused, preventing any backlog/duplicate charge.
- `"cancelled"`: immediate by default (`cancelAt: now`), or pass `atCycleEnd: true` to keep billing normally until the current cycle's `nextBillingAt`, then stop without billing again.

### `POST /subscriptions/process-due`
**Auth required, merchant-scoped.** Deterministically bills every subscription for this merchant whose `nextBillingAt <= now`: creates a real `Payment` (`status: paid`, `paymentMethod: UPI`) for each, advances `nextBillingAt` by `interval`/`intervalCount`, and stops any subscription whose scheduled `atCycleEnd` cancellation has arrived. Each cycle is claimed with an atomic, single-document `findOneAndUpdate` keyed on the exact `nextBillingAt` being advanced, so calling this endpoint concurrently or repeatedly can never double-bill the same cycle. Safe to call any number of times.

**Response** `200`: `{ processed: N, results: [{ subscriptionId, billed, paymentId?, nextBillingAt? }] }`.

### Activity actions
`SUBSCRIPTION_CREATED`, `SUBSCRIPTION_CANCELLED`, `SUBSCRIPTION_BILLED`.

---

## Settlements

### `GET /settlements`
`{ items: [...], summary: { totalSettled, pendingSettlement, failedSettlement, latestSettlement } }`

**Query params** (additive, all optional): `status` (`processed|pending|failed`), `from`, `to` (ISO dates, filter `settlementDate`). The `summary` block always reflects the merchant's full settlement history, never just the filtered page, so it can't drift when a filter is applied.

### `GET /settlements/:settlementId`
Single settlement. Writes a `SETTLEMENT_VIEWED` activity record.

---

## Activity (audit log)

### `GET /activity`
**Query params**: `action`, `entityType`, `from`, `to`, `page`, `limit`.

Every state-changing operation in this API writes here: `REMINDER_SENT`, `PAYMENT_UPDATED`, `PAYMENT_VIEWED`, `CUSTOMER_CREATED`, `CUSTOMER_UPDATED`, `SETTLEMENT_VIEWED`, and now `REFUND_CREATED`, `ORDER_CREATED`, `ORDER_UPDATED`, `INVOICE_CREATED`, `INVOICE_ISSUED`, `INVOICE_PAID`, `INVOICE_CANCELLED`, `INVOICE_OVERDUE`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_CANCELLED`, `SUBSCRIPTION_BILLED`. This is the same log a future Sugam action will append to — a merchant asking Sugam to send a reminder produces the identical activity record a dashboard click would.

---

## Analytics

### `GET /analytics/summary`
Dashboard-oriented aggregation: overview totals, status breakdown, payment-method breakdown, volume-over-time series. Distinct from `/payments/summary`, which is a compact single-object total meant for a quick spoken/chat answer rather than chart rendering.

Additively extended with per-domain totals, computed server-side via MongoDB aggregation (never cached, never hardcoded), alongside the original fields (which are unchanged):

```json
{
  "overview": { "...": "unchanged" },
  "statusBreakdown": ["..."],
  "methodBreakdown": ["..."],
  "volumeOverTime": ["..."],
  "refunds": { "totalRefunded": 0, "refundCount": 0, "refundableVolume": 0 },
  "orders": { "totalOrders": 0, "totalOrderAmount": 0, "paidOrders": 0, "cancelledOrders": 0 },
  "invoices": { "totalInvoices": 0, "totalInvoiceAmount": 0, "paidAmount": 0, "outstandingAmount": 0, "overdueAmount": 0 },
  "paymentLinks": { "totalLinks": 0, "paidLinks": 0, "conversionRate": 0 },
  "settlements": { "totalSettled": 0, "pendingSettlement": 0 }
}
```

---

## Security model (enforced, not just described)

- `merchantId` is **never** read from `req.body`/`req.query`/`req.params` for authorization anywhere in this codebase — it always comes from `req.user.merchantId`, set by `requireAuth` after verifying the JWT.
- Every merchant-owned Mongoose query includes `merchantId` directly in the filter (not a post-fetch ownership check).
- A cross-merchant access attempt returns `404`, not `403` — it doesn't confirm the resource exists under another merchant.
- Ambiguity is never resolved by picking the first/most-recent/cheapest match — `AMBIGUOUS_PAYMENT` / `AMBIGUOUS_CUSTOMER` is returned with full candidate data instead.
- **One deliberate exception**: `POST /payment-links/:id/pay` and `GET /pay/:id` carry no merchant auth at all, by design — a payer is never a merchant. Their security boundary is knowledge of the `paymentLinkId`, matching real payment-link products. Every *other* payment-link route (create/list/view/cancel) is fully merchant-scoped and `404`s for a non-owning merchant, same as everywhere else in this API.
- Refunds, Orders, Invoices, and Subscriptions follow the exact same rules: every route is `requireAuth`-protected, every query is scoped by `merchantId` from the JWT, and no route on any of these four resources is public. Financial math (`refundableAmount`, invoice `outstandingAmount`, subscription billing dates) is always computed server-side from the database — a client-supplied number is never trusted.
- A successful refund never mutates the underlying `Payment.status` — `paid` stays `paid` — and `createRefund` rejects any amount exceeding `payment.amount - sum(previous "refunded" amounts)`, computed fresh on every call.
- Money-moving/record-creating writes (Refunds, Orders, Invoices, Subscriptions, same as Payment Links/Reminders before them) support an `Idempotency-Key` header so a retried request can never create a duplicate record.
