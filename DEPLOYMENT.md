# Deployment Guide — Folsom Cafe POS

Operational guide for deploying this app as a **single, cloud-hosted, internet-reachable** instance for one café. Pair it with `PRODUCTION_READINESS_REVIEW.md` (the security review this guide implements).

---

## 1. What you are deploying

One Node.js process does everything:

- Serves the **REST API** under `/api/*` (Express 5).
- Serves the **built React frontend** (static files from `dist/`, with SPA fallback).
- Runs the **realtime layer** (Socket.IO) for live order/kitchen/table updates — the host must allow WebSocket upgrades (virtually all do).

All persistent data lives in **Supabase (PostgreSQL)**, reached over HTTPS. There is no local database to back up on the app host, and the process is stateless — you can restart or redeploy it freely.

```
Browser ──HTTPS──> [ Cloud proxy/TLS ] ──> Node (Express + Socket.IO) ──HTTPS──> Supabase
                                             └── serves dist/ (React)
```

---

## 2. Prerequisites

- **Node.js 20 or newer** (enforced by `engines` in `package.json`).
- A **Supabase project** (free tier is fine for one café). You need its URL and keys from *Dashboard → Project Settings → API*.
- A **host** that runs a persistent Node process and terminates TLS for you (Render, Railway, Fly.io, a VPS behind Nginx/Caddy, etc.).
- A **domain** (recommended) so you get a stable HTTPS URL.

---

## 3. Environment variables

Set these in the host's environment (dashboard or `.env` on a VPS). `.env.example` is the committed template. **Never commit the real `.env`** — it is gitignored.

| Variable | Required | Example / default | Purpose |
|---|---|---|---|
| `NODE_ENV` | **Yes (prod)** | `production` | Turns on Secure + `SameSite=strict` cookies, HTTPS-only CSP, and exit-on-fatal-error so the host restarts a clean instance. |
| `SUPABASE_URL` | **Yes** | `https://abcd.supabase.co` | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes (prod)** | *(secret)* | Server-only key that bypasses RLS. Use this in production and run `supabase-hardening.sql` (see §4). |
| `SUPABASE_ANON_KEY` | Fallback | *(secret)* | Dev fallback. Works only under the allow-all RLS policy; behaves like a DB password. Used only if the service_role key is unset. |
| `JWT_SECRET` | **Yes (prod)** | 64-char hex | Signs staff session tokens. If unset it is generated into `data/.jwt-secret`, which is wiped on every deploy on ephemeral hosts — logging all staff out. |
| `PORT` | No | `10000` | Listen port. Many hosts inject their own `PORT`; the app honors it. |
| `TABLE_COUNT` | No | `10` | Number of physical tables in the café. |
| `TRUST_PROXY` | No | `1` | Proxy hops to trust for the real client IP. `1` = one cloud proxy (default). Set `0` only for a direct LAN deploy with no proxy. |
| `API_RATE_LIMIT` | No | `3000` | Global API requests per IP per 15 min (a backstop; login/orders/calls are stricter). All café devices share one NAT IP, so keep it generous. |

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 4. One-time Supabase setup

Do this once per Supabase project.

**Step 1 — create the schema.** Open *Supabase Dashboard → SQL Editor → New query*, paste the full contents of `supabase-schema.sql`, and click **Run**. It is idempotent (safe to re-run after updates).

**Step 2 — lock down the database (production).** After you have set `SUPABASE_SERVICE_ROLE_KEY` and confirmed the server boots and works with it (§6):

1. Open *SQL Editor → New query*.
2. Paste the full contents of `supabase-hardening.sql` and click **Run**.

This drops the allow-all `anon` policy. Because the server now authenticates with the service_role key (which bypasses RLS), it keeps full access — but a leaked anon key can then read/write **nothing**. This is reversible: re-running `supabase-schema.sql` restores the anon policy if you ever need to fall back to the anon key.

> Do **not** run `supabase-hardening.sql` while the server is still using the anon key — it would lose all database access.

---

## 5. Build and run

```bash
npm ci          # clean, reproducible install from package-lock.json
npm run build   # compiles the React app into dist/
npm start       # runs the server: node server.js
```

`npm start` serves both the API and the built frontend on `PORT`. There is no separate frontend server in production.

On a typical cloud host, set:

- **Build command:** `npm ci && npm run build`
- **Start command:** `npm start`
- **Health check path:** `/api/health`

---

## 6. Deploying to a cloud host

The app fits the standard "web service" shape on Render, Railway, Fly.io, and similar.

1. Connect the git repo (or push the code) to the host.
2. Set the **build** and **start** commands from §5.
3. Add every production environment variable from §3 (`NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, plus any optional overrides).
4. Deploy. Watch the logs for the first-run banner (§8) and the `✅ ... server on http://0.0.0.0:<port>` line.
5. Once it is healthy with the service_role key, run `supabase-hardening.sql` (§4, step 2).

**Proxy / IP notes.** The app sets `trust proxy = 1` by default so `req.ip` is the real client IP behind one proxy — the in-café order gate and rate limiters depend on this. If your host chains multiple proxies, set `TRUST_PROXY` to the correct hop count. For a direct-to-internet VPS with no proxy in front of Node, set `TRUST_PROXY=0`.

**Persistent disk not required.** All state is in Supabase. Do not rely on the local `data/` folder in production — set `JWT_SECRET` so sessions survive redeploys.

---

## 7. HTTPS / TLS

The app must be reached over **HTTPS** in production — the session cookie is `Secure`, so it is never sent (or stored) over plain HTTP, and the CSP upgrades insecure requests.

- **Managed hosts (Render/Railway/Fly):** TLS is terminated at their proxy automatically on your `*.onrender.com`/custom domain. Nothing to configure in the app.
- **Your own VPS:** put **Nginx** or **Caddy** in front of Node and let it handle certificates (Caddy does Let's Encrypt automatically). Proxy `https://your-domain` → `http://127.0.0.1:<PORT>`, and forward the `Upgrade`/`Connection` headers so WebSockets work.

Confirm the padlock shows in the browser before going live. If cookies "don't stick" after login, you are almost certainly serving over HTTP, not HTTPS.

---

## 8. First run — the owner account

On the very first boot against an empty database, the server creates a single **owner** account and prints a **randomly generated password to the logs**, once:

```
========================================================
  FIRST RUN — owner account created
  username: owner
  password: <random>
  Write this down. Create staff/kitchen users from the
  Owner dashboard → Users tab, then change this password.
========================================================
```

1. Copy that password from the deploy logs immediately.
2. Log in at `https://your-domain/login` as `owner`.
3. Go to **Owner dashboard → Users** and create staff/kitchen accounts.
4. Change the owner password (passwords must now be **at least 8 characters**).

If you miss the log line, the fastest reset is to delete the `owner` row in Supabase and restart — it will regenerate.

---

## 9. Post-deploy verification

Run through this after every fresh deploy:

- [ ] `GET https://your-domain/api/health` returns `{"status":"ok"}`.
- [ ] The site loads over **HTTPS** with a valid certificate (padlock).
- [ ] Logging in as `owner` succeeds and the session **persists** across a page refresh (confirms `Secure` cookie + HTTPS + `JWT_SECRET` are all correct).
- [ ] A customer can open a table page, place an order, and it appears **live** on the Staff/Kitchen screens (confirms Socket.IO/WebSockets pass through the proxy).
- [ ] Deploy logs show `NODE_ENV` is production (no "⚠️ NODE_ENV is not production" warning) and no "⚠️ Using the Supabase ANON key" or "⚠️ JWT_SECRET is not set" warnings.
- [ ] `supabase-hardening.sql` has been run (verify: the query at the bottom of that file returns zero rows).

---

## 10. Uptime monitoring

Point an uptime monitor (UptimeRobot, Better Stack, Pingdom, or your host's built-in check) at:

```
GET https://your-domain/api/health   → expect 200 {"status":"ok"}
```

Health checks are excluded from request logging and rate limiting, so you can poll every 1–5 minutes safely. Alert if it fails twice in a row.

For error visibility beyond the health check, the app logs each API request (method, path, status, latency, IP) and all crashes to stdout. Layer a real error tracker (e.g. Sentry) on top if you want alerting on exceptions.

---

## 11. Ongoing operations

- **Updating the app:** push new code, let the host rebuild (`npm ci && npm run build`) and restart. The server drains in-flight requests on `SIGTERM` (up to 10s) before exiting, so redeploys won't cut off a bill settlement mid-write.
- **Schema changes:** if a release adds tables/columns, re-run the updated `supabase-schema.sql` in the SQL Editor (it is idempotent). The server checks the schema at boot and prints exactly what is missing if you forget.
- **Rotating `JWT_SECRET`:** change the env var and restart. This invalidates all current sessions (everyone re-logs in) — do it if you suspect the secret leaked.
- **Rotating Supabase keys:** rotate in the Supabase dashboard, update the env var, restart.
- **Logs:** watch stdout on your host for request lines, `UNHANDLED REJECTION` / `UNCAUGHT EXCEPTION`, and shutdown messages.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login succeeds but you're logged out on refresh | Serving over HTTP, so the `Secure` cookie is dropped | Serve over HTTPS (§7). |
| All staff logged out after every deploy | `JWT_SECRET` not set; generated secret wiped on redeploy | Set `JWT_SECRET` in the host env (§3). |
| Server exits at boot with "Database tables not found" | Schema not created | Run `supabase-schema.sql` in the SQL Editor (§4). |
| Server exits with "missing <table/column> (added in a newer version)" | Schema out of date | Re-run `supabase-schema.sql` (idempotent). |
| Live order updates don't appear on Staff/Kitchen | WebSocket upgrades blocked by the proxy | Forward `Upgrade`/`Connection` headers (§7); confirm the host allows WebSockets. |
| Legit users hitting "Too many requests" | Rate limit too low for shared NAT IP, or wrong `trust proxy` | Raise `API_RATE_LIMIT`; verify `TRUST_PROXY` matches your proxy setup (§3, §6). |
| Warning: "Using the Supabase ANON key in production" | Service_role key not set | Set `SUPABASE_SERVICE_ROLE_KEY` and run `supabase-hardening.sql` (§4). |

---

*Deploy checklist in one line:* set env vars (`NODE_ENV=production`, Supabase service_role key, `JWT_SECRET`) → `npm ci && npm run build` → `npm start` behind HTTPS → grab the owner password from logs → run `supabase-hardening.sql` → verify `/api/health` and a live order.
