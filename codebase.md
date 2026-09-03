# Folsom Cafe & Resturent — Codebase Overview

Browser-based tea-shop POS. Customers scan a QR at their table, order from their phone, and track their order live; staff run the counter, kitchen runs a KDS board, and the owner gets analytics, menu, users, and a credit (udhaaro) ledger.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 6, Tailwind CSS 4, react-router-dom 7, lucide-react icons, motion animations, recharts (analytics) |
| Backend | Node (ESM) + Express 5, socket.io 4 |
| Database | Supabase (PostgreSQL) via `@supabase/supabase-js` REST — **no direct Postgres connection, no transactions** |
| Auth | JWT in an httpOnly cookie (`jsonwebtoken` + `bcryptjs`), roles: `customer` (anonymous) / `staff` / `kitchen` / `owner` |
| Validation | zod schemas (`server/validate.js`) |

## Commands

```bash
npm run dev       # backend (port 10000) + Vite frontend (port 3000) concurrently
npm run build     # vite build → dist/
npm start         # production: node server.js (serves dist/ + API + sockets)
```

Required `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (schema must be applied once via `supabase-schema.sql` in the Supabase SQL Editor — idempotent, safe to re-run). Optional: `PORT`, `TABLE_COUNT`.

## Directory map

```
server.js                 Express app: helmet/cors/routes/static/error handler,
                          process-level crash guards, keepAlive timeouts, startup checks
server/
  db.js                   supabase client, sb() envelope-unwrap helper, checkSchema()
  auth.js                 JWT cookie auth: requireAuth(roles), optionalAuth, userFromToken
  validate.js             zod schemas + validate() middleware
  migrate.js              one-time SQLite → Supabase migration (legacy)
  seed.js                 first-boot seed (owner user, sample menu)
  sockets.js              socket.io init, room model, all emit* helpers
  routes/                 thin express routers → services
    auth / menu / orders / analytics / users / tables / calls / credit
  services/
    orderService.js       order shaping, state machine, create/transition, queue ETA
    tableService.js       table board, combined bill, settle (payment)
    analyticsService.js   owner analytics queries
src/
  main.jsx, App.jsx       router + AuthProvider + global <ToastHost />
  api/client.js           fetch wrapper (timeout + GET retry) + all typed API helpers
  api/socket.js           lazy socket.io singleton, reconnectSocket() after login/logout
  context/AuthContext.jsx user session state
  hooks/
    useOrdersLive.js      shared live-orders state: REST load + socket patches +
                          applyStatusLocal() optimistic mutator
    useSound.js           new-order chime with localStorage toggle
  views/
    CustomerView.jsx      QR menu + cart + place order
    OrderTrack.jsx        live order tracking by public code (socket + 60s queue poll)
    Login.jsx             staff login
    StaffView.jsx         counter: order cards, table board, service calls
    KitchenView.jsx       KDS lanes (New/Accepted/Preparing) + 86-board StockModal
    owner/                OwnerDashboard shell + Analytics/Menu/Users/Credit/DayReport/Qr tabs
  components/             OrderCard, TableBoard, TableBillModal, NewOrderModal,
                          Toast (toast() + ToastHost), StatusBadge/Timeline,
                          ServiceCalls*, reactbits/ animation primitives
  utils/                  format.js, printBill.js
```

## Data flow

**REST for loads and writes, socket.io pushes for live updates.** Views fetch once on mount, then patch local state from socket events; socket `reconnect` triggers a full refetch to cover missed events.

Socket rooms (`server/sockets.js`):
- Staff sockets join their role room (`staff` / `kitchen`; `owner` joins all three).
- Customers join `order:<publicCode>` via the `track` event (code is unguessable).

Events: `order:new`, `order:status`, `orders:settled`, `menu:updated`, `call:new`, `call:resolved`.

### Order state machine (`orderService.js` TRANSITIONS)

```
pending → accepted → preparing → cooked → served     (kitchen … staff)
   └────────┴──────────┴───────────┴→ cancelled
```

Served orders stay "active" until the table's bill is settled (`payment_id` set). Settling pays every unpaid order on a table in one payment record; `TA` is the virtual takeaway table. Concurrency is handled optimistically: status updates are guarded with `.eq('status', current)` / `.is('payment_id', null)` and return 409 on a lost race.

### DB tables (`supabase-schema.sql`)

`users`, `menu_items`, `orders`, `order_items`, `order_status_history`, `payments`, `credit_entries`, `service_calls`.

## Performance & reliability conventions

These are deliberate patterns — keep them when adding features:

1. **One round trip per endpoint where possible.** Every `await supabase...` is an HTTPS call from the app server to Supabase. Use PostgREST embedded selects (`select('*, order_items(...)')` — FKs exist for orders→items→history→users) instead of per-row follow-up queries. See `ITEMS_EMBED`/`HISTORY_EMBED` in `orderService.js` and `getTableBill`.
2. **Background audit writes.** `order_status_history` inserts are fire-and-forget: never wrap them in `sb()` (it throws → unhandled rejection); always `.then(({ error }) => error && console.error(...))`. Money writes (payments, credit, order items) are always awaited with compensating rollback on failure (no transactions over REST).
3. **Optimistic UI with conditional rollback.** Status buttons call `applyStatusLocal(id, status)` from `useOrdersLive` before the POST — the card moves instantly; on error the returned `undo()` reverts *only if* the optimistic value is still shown (a concurrent socket push wins) and `toast()` explains. Socket pushes are the source of truth and re-apply idempotently. Money flows (settle, place-order) stay pessimistic.
4. **API client resilience** (`src/api/client.js`): 8s AbortController timeout on everything; GET-only retry (2×, backoff) on timeout/network/502-504. Writes are never auto-retried — server 409 guards make manual retry safe.
5. **Crash guards** (`server.js`): `unhandledRejection`/`uncaughtException` log-and-continue (all state is in the DB, handlers are stateless); async socket.io listeners must have their own try/catch (`sockets.js`). `keepAliveTimeout` is 65s to outlast cloud proxy idle timeouts (prevents random 502s).
6. **Socket-event refetch discipline.** Patch local state when the payload has what you need; when state is server-derived (TableBoard), refetch — but filter to events that can actually change it and debounce bursts (~300ms).
7. **Server recomputes money.** Client-sent totals are ignored; prices come from `menu_items` at order time and are snapshotted onto `order_items`.
8. **Short TTL caches for slow-changing hot-path reads** — e.g. the 60s `avgPrepCache` behind queue ETAs in `orderService.js`.
