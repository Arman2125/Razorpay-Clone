# Mini Razorpay

A simulated, Razorpay-like merchant payment management platform, built as the foundation for **Razorpay Sugam** — an AI conversational agent (built separately) that will operate this platform through natural language on WhatsApp/voice.

> **This is a simulated Razorpay-like payment environment created for the Razorpay AI Buildathon prototype. It is not the production Razorpay platform and does not process real money.**

## 1. What this is

Mini Razorpay is a small, realistic payment operations platform: merchants, customers, payments, reminders, settlements, and an audit trail, with a dashboard UI and a REST API. It is intentionally scoped — not a clone of the full Razorpay dashboard — but built with clean, stable APIs so a future AI agent (Sugam) can operate it through a controlled tool layer (MCP) without any redesign of this codebase.

## 2. Architecture

```
React Dashboard  →  Express REST API  →  MongoDB
```

- The dashboard never talks to MongoDB directly and holds no business logic — it only renders API responses and calls the API for actions.
- Every request is scoped to `req.user.merchantId`, derived server-side from a verified JWT — never from the request body/query. This is what will let Sugam's future MCP server sit alongside the dashboard as a second, independent client of the same APIs, with the same authorization guarantee.
- Business logic (priority scoring, idempotency, validation, audit logging) lives in `server/src/services/`, called by thin controllers — this is the logic both the dashboard and, later, Sugam will share.

```
                    MINI RAZORPAY (this repo)

                     ┌─────────────────┐
                     │ React Dashboard │
                     └────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ Express REST API│
                     └────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │    MongoDB      │
                     └─────────────────┘

                          (future, separate build)
                     Sugam Agent → MCP Server → the REST API above
```

## 3. Tech stack

- **Frontend**: React 19, Vite, React Router, Axios, Tailwind CSS v4, Recharts
- **Backend**: Node.js, Express, MongoDB, Mongoose, JWT, dotenv, cors

## 4. Folder structure

```
mini-razorpay/
├── client/            React dashboard (Vite)
│   └── src/
│       ├── api/        axios instance + one module per resource
│       ├── components/ shared UI (StatusBadge, Card, States, ProtectedRoute)
│       ├── pages/       one page per dashboard section
│       ├── layouts/     DashboardLayout (sidebar nav)
│       ├── context/     AuthContext, ToastContext
│       ├── hooks/       useApi
│       └── utils/       formatting helpers
├── server/            Express API
│   └── src/
│       ├── app.js       Express app wiring (routes/middleware) — imported by server.js and by tests
│       ├── config/      db.js (Mongoose connection)
│       ├── models/      Merchant, Customer, Payment, Reminder, Settlement, Activity,
│       │                Refund, Order, Invoice, Subscription
│       ├── controllers/ one per resource
│       ├── routes/      one per resource, mounted under /api
│       ├── services/    priorityService, reminderService, analyticsService, activityService,
│       │                customerResolution, refundService, orderService, invoiceService,
│       │                subscriptionService
│       ├── middleware/  auth.js (JWT), errorHandler.js
│       ├── utils/       idGenerator.js, apiResponse.js
│       └── seed/        seed.js
├── server/test/       node:test + supertest integration tests (npm test, from server/)
├── .env.example
└── README.md
```

## 5. Environment setup

Copy `.env.example` to `server/.env` (a working `server/.env` with local defaults is already included for development) and adjust if needed:

```
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/mini_razorpay
JWT_SECRET=<a long random secret>
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

The client reads `VITE_API_URL` from `client/.env` (defaults to `http://localhost:5000/api`).

## 6. MongoDB setup

Any MongoDB 6/7 instance works. For local development on Windows, install it natively as a service:

```powershell
winget install --id MongoDB.Server --accept-package-agreements --accept-source-agreements
```

It then runs automatically on `mongodb://127.0.0.1:27017` — no separate start step needed. (A Docker-based setup works too if you prefer it; just point `MONGODB_URI` at it.)

## 7. Seed the database

```bash
cd server
npm install
npm run seed
```

This creates 3 merchants, 13 customers, 32 payments, 6 reminders, 6 settlements, 25 activity records, 2 refunds, 3 orders, 4 invoices, and 2 subscriptions — including a **deliberate ambiguity case** (Merchant A's "Rahul Sharma" has two pending ₹25,000 payments on different due dates, one left without a reminder for the live demo), a **deliberate isolation case** (Merchant B also has a "Rahul Sharma", with a paid ₹25,000 payment, that must never be visible to Merchant A), and a **deliberate customer-name-collision case** (two "Anita Kumar" customers under Merchant A, for testing `AMBIGUOUS_CUSTOMER` on payment link creation). Payment Links start empty — they're created live through the demo.

Re-running `npm run seed` wipes and recreates all data — safe to run any time to reset to a clean demo state.

## 8. Run the backend

```bash
cd server
npm run dev
```

API listens on `http://localhost:5000`. Health check: `GET /health`.

## 9. Run the frontend

```bash
cd client
npm install
npm run dev
```

Dashboard at `http://localhost:5173`.

## 10. Demo credentials

Login is by phone number (no password — this is a demo auth mechanism deliberately shaped like the future WhatsApp-identity lookup Sugam will use):

| Merchant | Phone |
|---|---|
| Sharma Wholesale Traders | `+919876543210` |
| Patel Distributors | `+919876543211` |

The login page also lists these as one-click demo merchants.

## 11. API endpoints

Full request/response/error documentation lives in [API.md](API.md). Summary:

All routes require `Authorization: Bearer <token>` **except**: `POST /api/auth/login`, `GET /api/auth/demo-merchants`, `POST /api/payment-links/:id/pay`, and the public page `GET /pay/:id` (paying a link is a payer action, not a merchant action — see API.md's Payment Links section for why).

**Auth** — `GET /api/auth/demo-merchants`, `POST /api/auth/login`, `GET /api/auth/me`

**Payments** — `GET /api/payments`, `GET /api/payments/pending`, `GET /api/payments/overdue`, `GET /api/payments/pending/priority` (deterministic priority score), `GET /api/payments/summary`, `POST /api/payments/search` (structured search, returns every match — how ambiguity gets detected), `GET /api/payments/:id`, `GET /api/payments/:id/status`, `PATCH /api/payments/:id/status` (deterministic state-transition rules)

**Customers** — `GET /api/customers` (supports `?search=`), `POST /api/customers`, `GET /api/customers/:id`, `PUT /api/customers/:id`, `GET /api/customers/:id/payments`

**Reminders** — `GET /api/reminders`, `POST /api/reminders` (by exact `paymentId`, or by `customerName`/`customerId` + `amount` — refuses to guess with `409 AMBIGUOUS_PAYMENT` if that resolves to more than one payment), `GET /api/reminders/:id`. Supports an `Idempotency-Key` header; rejects a duplicate reminder for the same payment within 24h with `409 DUPLICATE_REMINDER`.

**Payment Links** — `POST /api/payment-links` (by `customerId` or `customerName` — `409 AMBIGUOUS_CUSTOMER` if the name matches more than one customer), `GET /api/payment-links`, `GET /api/payment-links/:id`, `PATCH /api/payment-links/:id/status` (cancel/expire only), `POST /api/payment-links/:id/pay` (public), `GET /pay/:id` (public HTML page). A real `Payment` record is created the moment a link is paid.

**Refunds** — `POST /api/refunds`, `GET /api/refunds`, `GET /api/refunds/:id`, `GET /api/payments/:id/refunds`, `GET /api/payments/:id/refundable`. A separate ledger against a `Payment` — refunding never changes `Payment.status`; the refundable balance is always computed server-side from the ledger.

**Orders** — `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id/status` (`created -> attempted -> paid`, or `-> cancelled`).

**Invoices** — `POST /api/invoices`, `GET /api/invoices`, `GET /api/invoices/:id`, `PATCH /api/invoices/:id` (draft only), `PATCH /api/invoices/:id/status` (`draft -> issued -> paid/cancelled`; lazily flips to `overdue` past `dueDate`).

**Subscriptions** — `POST /api/subscriptions`, `GET /api/subscriptions`, `GET /api/subscriptions/:id`, `PATCH /api/subscriptions/:id/status` (`active`/`paused`/`cancelled`), `POST /api/subscriptions/process-due` (deterministic, idempotent billing-cycle processor — no in-process cron; see API.md).

**Settlements**
- `GET /api/settlements` — filters: `status`, `from`, `to`
- `GET /api/settlements/:settlementId`

**Activity**
- `GET /api/activity` — filters: `action`, `entityType`, `from`, `to`, `page`, `limit`

**Analytics**
- `GET /api/analytics/summary` — overview totals, status/method breakdown, volume-over-time series, plus refund/order/invoice/payment-link/settlement totals

All responses use a consistent envelope: `{ success: true, data }` or `{ success: false, error: { code, message } }`.

## 12. Automated tests

The backend has an integration test suite (Node's built-in test runner + `supertest`) covering auth, merchant isolation, payments, payment links, refunds, orders, invoices, subscriptions, settlements, and analytics.

```bash
cd server
npm test
```

Tests run against a **separate database** (`mini_razorpay_test`, on the same cluster as `MONGODB_URI`) — never against the real seeded/demo `mini_razorpay` database — and each test creates its own merchant/customer fixtures, so the suite is safe to re-run repeatedly without any manual cleanup.

## 13. Security notes

- `merchantId` is never accepted from the request body/query for authorization — it always comes from `req.user.merchantId`, set by the `requireAuth` middleware after verifying the JWT.
- Every merchant-owned Mongoose query filters by `merchantId` directly, not as a post-fetch check.
- A cross-merchant access attempt returns `404`, not `403`, so it doesn't confirm the resource exists under another merchant.
- Reminder creation is idempotent via both a client-supplied `Idempotency-Key` and a same-payment/24h duplicate check. Refunds, Orders, Invoices, and Subscriptions support the same `Idempotency-Key` pattern for their creation endpoints.
- Refunds are tracked in a ledger separate from `Payment.status`; a payment's refundable balance is always recomputed server-side, and an over-refund is rejected deterministically.

## 14. Future: Sugam + MCP integration

This repo intentionally stops at the REST API layer. The next build, **Razorpay Sugam**, will add:

```
Merchant (WhatsApp/voice) → Twilio → Sugam Agent (LLM) → MCP Server → these REST APIs
```

Each endpoint above maps directly to a planned MCP tool (`search_payments`, `get_payment_status`, `get_pending_payments`, `calculate_collection_priority`, `send_payment_reminder`, `get_activity`, etc.). Sugam will never access MongoDB directly and will never supply its own `merchantId` — it authenticates as a merchant (via their WhatsApp-bound identity) exactly the way this dashboard authenticates via login, and the same server-side authorization rules apply unchanged.
