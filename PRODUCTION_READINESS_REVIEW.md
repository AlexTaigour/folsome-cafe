# Production-Readiness Review — Folsom Cafe Digital Menu

**Project:** `hamro-chiya-pasal` — browser-based cafe POS / digital menu
**Reviewed:** 2 September 2026
**Target deployment:** Single cafe, cloud-hosted (internet-reachable, HTTPS)
**Stack:** React 19 + Vite 6 (frontend) · Node/Express 5 + Socket.IO 4 (backend) · Supabase/PostgreSQL (data) · JWT-in-httpOnly-cookie auth · Zod validation

---

## 1. Verdict

**Not production-ready *as it stands* for a public URL — but it is close, and the gap is almost entirely configuration and hardening, not rewrites.**

This codebase is genuinely well-engineered. The application logic, data validation, authorization model, concurrency handling, and real-time layer are of a higher quality than is typical for a small-business POS. If this were running on the cafe's private Wi-Fi (which is what it was originally built for — the package is literally named "LAN tea-shop POS"), I would call it ready today.

The problem is the move to a **public, internet-facing cloud URL**. Several deliberate design decisions that were correct for a trusted LAN are now liabilities: the session cookie is not marked `Secure`, the Content-Security-Policy is tuned for plain HTTP, only the login endpoint is rate-limited (the public ordering and "call waiter" endpoints are wide open), and the entire database is protected by a single Supabase key that grants full read/write access to everything.

None of these require significant new code. Most are one-line changes plus correct host configuration. **Estimated effort to reach a safe launch: roughly 1–2 focused days**, dominated by testing and deployment configuration rather than development.

The recommendation is therefore: **fix the "Blockers" in Section 4 before pointing a public domain at it. Everything else can follow shortly after launch.**

---

## 2. Severity summary

| # | Finding | Severity | Area |
|---|---------|----------|------|
| 1 | Auth cookie sent without `Secure`; CSP assumes plain HTTP | **High** | Security / Transport |
| 2 | Supabase **anon key** grants full DB access to all tables | **High** | Security / Data |
| 3 | Public write endpoints (`/api/orders`, `/api/calls`) are not rate-limited | **High** | Abuse / Availability |
| 4 | JWT secret persisted to local disk, not env — sessions drop on every redeploy | **Medium** | Reliability |
| 5 | Secrets shipped in `.env`; no host-env workflow; anon key rotation unverified | **Medium** | Security / Ops |
| 6 | No automated tests and no CI | **Medium** | Quality assurance |
| 7 | No monitoring, error tracking, or request logging | **Medium** | Observability |
| 8 | Money flows have no atomic transactions (REST limitation) | **Medium** | Data integrity |
| 9 | `uncaughtException` / `unhandledRejection` are swallowed to keep the process alive | **Medium** | Reliability |
| 10 | Public "call waiter" endpoint is not restricted to on-premises customers | **Low–Med** | Abuse |
| 11 | No backup / disaster-recovery plan documented for Supabase data | **Medium** | Ops |
| 12 | No Node version pin (`engines`), no deploy/build config committed | **Low** | Ops |
| 13 | No graceful shutdown (SIGTERM) handling | **Low** | Reliability |
| 14 | Analytics loads full date-range into memory; unbounded ranges allowed | **Low** | Scalability |
| 15 | Password policy is length-only (min 6) | **Low** | Security |
| 16 | `better-sqlite3` native dep only needed for one-time migration | **Low** | Build hygiene |

No **Critical** (actively and trivially exploitable, leading to full compromise on the intended deployment) issues were found. The three **High** items are must-fix-before-launch but each requires either a misconfiguration, a leaked key, or sustained abuse to bite — hence High rather than Critical.

---

## 3. What is already strong

It is worth being explicit about this, because it shapes the recommendation. These are done well and should **not** be changed:

- **Input validation is comprehensive.** Every write endpoint validates its body against a Zod schema (`server/validate.js`) with sensible bounds, regex constraints on phone/username/IP, and array-length caps. The `validate()` middleware replaces the request body with the parsed, trusted data.
- **Authorization is enforced server-side on every route.** `requireAuth(...roles)` gates each endpoint; the client-side `ProtectedRoute` is UX only and does not carry security weight. Role separation (customer/staff/kitchen/owner) is consistent and correct — e.g. kitchen can toggle item availability but not edit prices; only staff/owner can settle bills.
- **Money is recomputed on the server.** Client-supplied totals are ignored; prices are read from `menu_items` at order time and snapshotted onto `order_items` (`server/services/orderService.js`). Discounts are validated against the subtotal.
- **Concurrency is handled with optimistic guards.** Status transitions use `.eq('status', current)` and settlement claims orders with `.is('payment_id', null)`, returning HTTP 409 on a lost race so two staff tapping simultaneously can't double-transition or double-charge.
- **SQL injection is not a concern.** All database access goes through the Supabase client with parameterized filters; the one `ilike` username lookup escapes `%`/`_` wildcards.
- **Login is hardened.** Rate-limited (10 attempts / 15 min), constant-shape errors that don't reveal whether a username exists, bcrypt password hashing, and a randomly generated initial owner password (no hardcoded default).
- **The API client is resilient and safe.** 8-second timeouts, GET-only automatic retries, and writes are never auto-retried — precisely so a flaky network can't double-submit an order or a payment.
- **Auth token is not exposed to JavaScript.** The JWT lives in an `httpOnly` cookie, so cross-site-scripting cannot steal the session — a meaningfully better posture than the common `localStorage` token pattern.
- **The in-cafe order gate is thoughtful.** IP allowlist plus optional GPS geofence, with careful IPv4/IPv6 handling and a deliberate fail-open stance so a database hiccup never stops the shop taking orders.
- **Secrets are gitignored.** `.env`, `data/.jwt-secret`, and the local SQLite DB are all in `.gitignore`.
- **The code is well-documented.** `codebase.md` and inline comments explain the *why* behind non-obvious decisions, which materially lowers maintenance risk.

---

## 4. Blockers — fix before exposing a public URL

### Blocker 1 — Mark the session cookie `Secure` and make the CSP HTTPS-only  *(Finding 1, High)*

`server/auth.js` sets the auth cookie with `secure: false` and the comment "LAN HTTP deployment":

```js
res.cookie(COOKIE_NAME, token, {
  httpOnly: true,
  sameSite: 'lax',
  secure: false, // LAN HTTP deployment  ← must be true behind HTTPS
  maxAge: 12 * 60 * 60 * 1000,
});
```

On an internet-facing HTTPS site, a session cookie without the `Secure` flag can be transmitted over plaintext HTTP (via mixed content, a downgrade, or a user typing `http://…`), where it can be intercepted. The `Content-Security-Policy` in `server.js` compounds this — it explicitly allows `http:` and `ws:` in `connect-src` and disables `upgrade-insecure-requests` ("plain-HTTP LAN deployment").

**Mitigating factor:** Helmet's defaults do send an HSTS header, so returning visitors' browsers will force HTTPS. That reduces, but does not eliminate, the exposure.

**Fix:**
- Set `secure: true` on the cookie in production (gate on `process.env.NODE_ENV === 'production'` so local LAN/dev still works). Consider `sameSite: 'strict'` for the POS routes.
- Update the CSP to `connect-src 'self' https: wss:` and restore `upgrade-insecure-requests` for production.
- Confirm the host terminates TLS and redirects HTTP→HTTPS (Render/Railway do this automatically).

### Blocker 2 — Decide the Supabase key model; treat the anon key as a database password  *(Finding 2, High)*

The server connects to Supabase with the **anon key** (`server/db.js`), and `supabase-schema.sql` enables Row-Level Security but then grants the `anon` role unrestricted access to every table:

```sql
CREATE POLICY server_full_access ON <table> FOR ALL TO anon USING (true) WITH CHECK (true);
```

The schema's own comment is candid about the consequence: *"the anon key works like a database password."* Because the browser never talks to Supabase directly (all traffic goes through the Express API), this is workable — **but only as long as that key never leaks.** If it appears in git history, a log, a screenshot, or a misconfigured build, anyone can connect directly to your Supabase project and read or modify everything: bcrypt password hashes, customer names/phones, the full payment record, and the credit ledger — completely bypassing the app, its auth, and its rate limits.

**Fix (recommended, most robust):**
- Switch the server to the **`service_role` key** and change the RLS policies to **deny `anon`** entirely. The service_role key is designed to be a server-only secret; a leaked anon key then does nothing.
- Keep the key in the host's environment variables (see Blocker 5), never in a committed file.

**Fix (minimum, if keeping the anon-key model):**
- Verify the anon key was **never committed** to any git remote (check history, not just the current `.gitignore`). If there is any doubt, **rotate the key** in the Supabase dashboard — especially before going public.

### Blocker 3 — Rate-limit the public write endpoints  *(Finding 3, High)*

Only `POST /api/auth/login` is rate-limited (`server/routes/auth.routes.js`). The publicly reachable write endpoints are not:

- `POST /api/orders` — the order gate can reject off-premises orders, but it **fails open** (a settings/DB error allows the order) and may be disabled. An outsider hitting a public URL could create large volumes of bogus orders, flooding the kitchen board and the database.
- `POST /api/calls` — anyone can trigger "call waiter" / "ask for bill" for any table (see Finding 10).

**Fix:**
- Add a global `express-rate-limit` (the dependency is already installed) — e.g. a few hundred requests per IP per 15 min — and a tighter per-endpoint limit on `POST /api/orders` and `POST /api/calls`.
- Because `trust proxy` is set, the limiter will correctly key on the real client IP behind the cloud proxy.

### Blocker 4 — Set `TRUST_PROXY` and confirm the order gate  *(operational, already documented)*

Your own note (`memory/in-cafe-order-lock.md`) flags this: on the cloud host, set `TRUST_PROXY=1` so `req.ip` is the real client and not the load balancer. Without it, the order gate and any IP-based rate limiting are meaningless. `server.js` already defaults `trust proxy` to `1`, so the main action is to *verify* it against your specific host and then lock ordering to the cafe network from the owner dashboard while on cafe Wi-Fi.

### Blocker 5 — Move secrets to host environment variables and set `JWT_SECRET` / `NODE_ENV`  *(Findings 4 & 5, Medium — grouped here because it's part of the same deploy step)*

- On the cloud host, set `SUPABASE_URL`, `SUPABASE_(ANON|SERVICE_ROLE)_KEY`, `PORT`, `TABLE_COUNT`, `TRUST_PROXY`, and **`NODE_ENV=production`** as dashboard environment variables. Do not ship the `.env` file.
- Set **`JWT_SECRET`** explicitly. Today `server/auth.js` generates a secret and writes it to `data/.jwt-secret`. On ephemeral cloud filesystems (Render/Railway) that directory is wiped on every deploy/restart, so the secret regenerates and **every staff member is logged out on each deploy** — a recurring annoyance, and it defeats the file's purpose. A fixed env var solves it.

---

## 5. Strongly recommended before or shortly after launch

**Observability (Finding 7).** There is currently only `console.*` output. For an unattended cloud service handling money, add at minimum: HTTP request logging (e.g. `morgan` or `pino-http`) and an error-tracking service (e.g. Sentry) so failed settlements or crashes surface without someone watching logs. A `/api/health` endpoint already exists — point an uptime monitor at it.

**Backups / disaster recovery (Finding 11).** The payment and credit ledgers are the business's financial record. Confirm the Supabase project's automated backup cadence (the free tier's retention is limited) and, if needed, schedule a periodic export. Document a restore procedure.

**Reconsider the crash guards (Finding 9).** `server.js` catches `uncaughtException`/`unhandledRejection` and keeps running. The rationale (stateless handlers, all state in the DB) is reasonable, but a process that has hit an unexpected exception can be in a corrupted state. On a cloud host that restarts crashed processes automatically, the safer pattern is to **log and exit** on `uncaughtException` and let the platform restart cleanly. At minimum, alert on these events (they currently vanish into stdout).

**Graceful shutdown (Finding 13).** Cloud hosts send `SIGTERM` on redeploy. Add a handler that stops accepting new connections and closes the HTTP/Socket.IO server so in-flight requests (including a settlement) aren't cut mid-flight.

**Pin the runtime and commit deploy config (Finding 12).** Add an `engines.node` field to `package.json` (Express 5 + native `better-sqlite3` need a modern Node), and commit the host's build/start commands (`npm ci && npm run build` → `npm start`). Note that `dist/` is gitignored, so the host **must** run the build step — a stale or missing build is a classic first-deploy failure. An `.env.example` would also smooth re-deploys.

---

## 6. Area-by-area assessment

**Security & authentication — Good, with the transport/key caveats above.** The auth model (httpOnly cookie, bcrypt, role gating, active-user check, self-lockout prevention) is solid. CSRF risk is low given `sameSite: 'lax'` on a same-origin app, though tightening to `strict` on state-changing POSTs would be a cheap improvement. The blockers are about *transport* (Secure cookie/HTTPS CSP) and *the key model*, not the auth logic itself.

**Data integrity — Good within a real constraint.** Supabase's REST interface offers no multi-statement transactions, and the code compensates well: `createOrder` deletes the parent row if item inserts fail; `settleTable` rolls back the payment if the order-claim count doesn't match. The residual risk is a narrow window — e.g. a crash *between* claiming orders and inserting the credit-ledger row would leave a paid tab with no ledger entry. At tea-shop volume this is low-probability, and the existing end-of-day reconciliation report (`dayReport`) would surface it. Worth an idempotency-key or a periodic consistency check post-launch, but not a blocker.

**Reliability — Good.** Keep-alive timeouts are correctly tuned to outlast cloud proxy idle windows (avoiding spurious 502s), socket handlers guard their own async errors, and the client's retry discipline is careful about not double-submitting money operations. The two caveats are the crash-guard philosophy and the missing graceful shutdown (both above).

**Performance & scalability — Fine for one cafe; be aware of the ceiling.** Endpoints favor single round-trips via PostgREST embedded selects, and hot paths (queue ETA, order gate) use short TTL caches. The one structural limit is analytics: `analyticsService.js` pulls the entire date range into memory and aggregates in JS because supabase-js has no `GROUP BY`, and no maximum range is enforced. For a single shop this is comfortable for years; just cap the date range the owner UI can request (Finding 14). Note also that the in-memory caches are per-process, so **do not run more than one instance** without moving that state to a shared store — for a single cafe, one instance is the right call anyway.

**Frontend — Good.** Clean routing, cookie-based session restoration, resilient API layer, and sensible optimistic-UI-with-rollback. Consider adding a top-level React error boundary so a render error shows a friendly message instead of a white screen. No security issues.

**Testing & QA — This is the biggest process gap (Finding 6).** There are no automated tests and no CI. The money and concurrency logic (settlement rollback, status state machine, order-gate evaluation, discount math) is exactly the kind of code that benefits from unit tests, and it is currently verified only by manual use. This is not a launch blocker for a single low-volume shop, but it is the highest-value investment for safe ongoing changes. Start with unit tests around `orderService`, `tableService`, and `orderGate`.

---

## 7. Pre-launch checklist

Copy/paste this as your "definition of done" for going public:

**Blockers (do not launch without these)**

- [ ] Cookie `secure: true` in production; `sameSite` reviewed
- [ ] CSP updated for HTTPS (`connect-src 'self' https: wss:`, `upgrade-insecure-requests` restored)
- [ ] TLS + HTTP→HTTPS redirect confirmed on the host
- [ ] Supabase key model decided (service_role + deny-anon RLS *recommended*); anon key confirmed never committed, or rotated
- [ ] Global + per-endpoint rate limiting on `POST /api/orders` and `POST /api/calls`
- [ ] `TRUST_PROXY` verified on the host; order gate locked to cafe network
- [ ] All secrets set as host env vars (not shipped `.env`); `JWT_SECRET` set explicitly; `NODE_ENV=production`
- [ ] Build step configured on host (`npm run build`); confirmed `dist/` is produced there
- [ ] First-run owner password captured and changed

**Strongly recommended (launch week)**

- [ ] Error tracking (e.g. Sentry) + HTTP request logging wired up
- [ ] Uptime monitor on `/api/health`
- [ ] Supabase backup cadence confirmed; restore procedure documented
- [ ] Graceful `SIGTERM` shutdown handler
- [ ] `uncaughtException` behavior reconsidered (exit-and-restart, or at least alert)
- [ ] `engines.node` pinned; deploy commands committed

**Post-launch improvements**

- [ ] Unit tests for `orderService`, `tableService`, `orderGate`, discount math; add CI
- [ ] Cap analytics date-range in the owner UI
- [ ] Restrict `POST /api/calls` to on-premises (same gate as ordering) or accept the low risk
- [ ] Idempotency key on settlement / periodic consistency check
- [ ] Password minimum raised to 8+; optional complexity
- [ ] Move/remove `better-sqlite3` now that migration is complete
- [ ] Top-level React error boundary

---

## 8. Bottom line

This is a well-built application that a competent developer clearly put real care into — the validation, authorization, money-handling, and concurrency work are all above the bar for its category. It is **not** ready to sit on a public URL *today*, but only because it carries a set of "trusted-LAN" assumptions into an internet-facing world. Close the five blockers in Section 4 — most of which are configuration, not code — and you have a POS that is safe to launch for a single cafe. The recommended and post-launch items then harden it for the long haul.
