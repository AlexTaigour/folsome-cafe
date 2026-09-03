import 'dotenv/config';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { supabase, checkSchema } from './server/db.js';
import { runMigration } from './server/migrate.js';
import { runSeed } from './server/seed.js';
import { initSockets } from './server/sockets.js';
import { requireAuth } from './server/auth.js';
import authRoutes from './server/routes/auth.routes.js';
import menuRoutes from './server/routes/menu.routes.js';
import ordersRoutes from './server/routes/orders.routes.js';
import analyticsRoutes from './server/routes/analytics.routes.js';
import usersRoutes from './server/routes/users.routes.js';
import tablesRoutes from './server/routes/tables.routes.js';
import callsRoutes from './server/routes/calls.routes.js';
import creditRoutes from './server/routes/credit.routes.js';
import settingsRoutes from './server/routes/settings.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 10000;
const TABLE_COUNT = Number(process.env.TABLE_COUNT) || 10;
const isProd = process.env.NODE_ENV === 'production';

// All state lives in Supabase and every handler is stateless, so an unhandled
// promise rejection (e.g. a Supabase hiccup inside a fire-and-forget audit
// write) shouldn't take the whole shop down — log it and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
// A truly uncaught *synchronous* exception leaves the process in an unknown
// state. In production, log and exit so the host (Render/Railway/etc.) restarts
// a clean instance; in dev/LAN stay up for debugging.
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  if (isProd) setTimeout(() => process.exit(1), 100).unref();
});

const app = express();

// Behind a cloud proxy (Render/Railway/etc.) the socket peer is the load
// balancer, so the real client IP lives in X-Forwarded-For. Trusting one proxy
// hop makes req.ip that real client address — which the in-café order gate and
// the rate limiters need to tell shop Wi-Fi from the outside internet.
// TRUST_PROXY overrides: set 0 for a direct LAN deployment (no proxy) so XFF
// can't be spoofed.
app.set('trust proxy', process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : 1);

const server = http.createServer(app);
// Cloud proxies keep idle connections ~60s; Node's default 5s keepAliveTimeout
// makes the proxy reuse a just-closed socket → intermittent 502s.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Vite dev server origin; in production the app is same-origin so CORS is moot.
const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
initSockets(server, DEV_ORIGINS);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // menu item images are arbitrary remote URLs; fonts come from Google
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        // Production is HTTPS-only (upgrade + no plaintext). Dev/LAN also allows
        // the Vite HMR socket and plain-HTTP API so the built app still runs off
        // HTTPS (e.g. `npm start` on localhost) without the browser upgrading
        // every request to https:// and failing.
        'connect-src': isProd
          ? ["'self'", 'https:', 'wss:']
          : ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        'upgrade-insecure-requests': isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors({ origin: DEV_ORIGINS, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Lightweight request log for /api (health checks skipped). No extra dependency
// — enough to see traffic, slow calls and error statuses in host logs. Layer a
// real error tracker (e.g. Sentry) on top for production alerting.
app.use((req, res, next) => {
  if (!req.originalUrl.startsWith('/api') || req.originalUrl === '/api/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms ip=${req.ip}`
    );
  });
  next();
});

// Global API rate-limit backstop. Per-endpoint limiters (login, orders, calls)
// are stricter; this catches everything else. Keyed by req.ip, so it relies on
// `trust proxy` being correct. Every café device shares one public IP behind
// NAT, so the ceiling is generous and tunable via API_RATE_LIMIT.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT) || 3000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl === '/api/health',
  message: { error: 'Too many requests. Please slow down.' },
});
app.use('/api', apiLimiter);

// ---------------- API ----------------
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/settings', settingsRoutes);

const TABLES = Array.from({ length: TABLE_COUNT }, (_, i) => String(i + 1));

// public: the table-number labels customers pick from
app.get('/api/tables', (req, res) => {
  res.json(TABLES);
});
// staff/owner: board, combined bills, settlement
app.use('/api/tables', tablesRoutes(TABLES));
// customer service calls (call waiter / ask for bill)
app.use('/api/calls', callsRoutes(TABLES));
// udhaaro (credit) ledger
app.use('/api/credit', creditRoutes);

// LAN address for QR generation (owner only)
app.get('/api/server-info', requireAuth('owner'), (req, res) => {
  const nets = os.networkInterfaces();
  let lanIp = 'localhost';
  for (const iface of Object.values(nets).flat()) {
    if (iface?.family === 'IPv4' && !iface.internal) {
      lanIp = iface.address;
      break;
    }
  }
  res.json({ lanIp, port: PORT, baseUrl: `http://${lanIp}:${PORT}` });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---------------- static frontend ----------------
app.use('/resources', express.static(path.join(__dirname, 'resources')));
app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ---------------- error handler ----------------
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

// ---------------- production config warnings ----------------
if (!isProd) {
  console.warn(
    '⚠️  NODE_ENV is not "production". For a public deployment set NODE_ENV=production so the session cookie is Secure and the CSP is HTTPS-only.'
  );
}

// ---------------- startup ----------------
try {
  await checkSchema(); // exits with SQL Editor instructions if tables are missing
  await runMigration();
  await runSeed();
} catch (err) {
  console.error(
    '❌ Failed to initialize database — check SUPABASE_URL and your Supabase key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)'
  );
  console.error(err.message);
  process.exit(1);
}

const countRows = async (table) =>
  (await supabase.from(table).select('id', { count: 'exact', head: true })).count ?? 0;

server.listen(PORT, '0.0.0.0', async () => {
  const [users, menu, orders] = await Promise.all(
    ['users', 'menu_items', 'orders'].map(countRows)
  );
  console.log(`✅ Folsom Cafe & Resturent server on http://0.0.0.0:${PORT}`);
  console.log(`   db: ${users} users, ${menu} menu items, ${orders} orders (Supabase)`);
});

// ---------------- graceful shutdown ----------------
// Cloud hosts send SIGTERM on redeploy; close the server so in-flight requests
// (including a bill settlement) finish instead of being cut off. Force-exit if
// connections don't drain in time.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — shutting down gracefully`);
  server.close((err) => {
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    console.log('HTTP server closed — exiting');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Could not close connections in time — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
