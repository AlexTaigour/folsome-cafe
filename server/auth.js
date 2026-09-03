import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase, sb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// JWT secret: env var wins; otherwise generate once and persist in data/ so
// logins survive restarts without manual .env setup. NOTE: on ephemeral cloud
// filesystems (Render/Railway) data/ is wiped on every deploy, so the secret
// regenerates and all staff are logged out — set JWT_SECRET in production.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️  JWT_SECRET is not set in production. A generated secret is stored in data/.jwt-secret, which is wiped on ephemeral cloud filesystems — every deploy will log all staff out. Set JWT_SECRET in the host environment.'
    );
  }
  const secretDir = path.join(__dirname, '..', 'data');
  const secretFile = path.join(secretDir, '.jwt-secret');
  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing) return existing;
  } catch {}
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(secretDir, { recursive: true });
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

const JWT_SECRET = loadSecret();
export const COOKIE_NAME = 'hcp_token';
const TOKEN_TTL = '12h';

export const hashPassword = (plain) => bcrypt.hashSync(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Cookie flags. In production (public HTTPS) the session cookie MUST be Secure
// so it is never sent over plain HTTP, and sameSite 'strict' tightens CSRF. In
// dev / plain-HTTP LAN we drop Secure (a Secure cookie is never stored over
// http://) and use 'lax' so local flows keep working.
const isProd = process.env.NODE_ENV === 'production';
const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: isProd ? 'strict' : 'lax',
  secure: isProd,
};

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...AUTH_COOKIE_OPTS, maxAge: 12 * 60 * 60 * 1000 });
}

// Clearing must use the same flags the cookie was set with, or some browsers
// refuse to remove it.
export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, AUTH_COOKIE_OPTS);
}

// Returns the active user for a raw JWT, or null. Shared by HTTP middleware
// and the Socket.IO handshake.
export async function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = sb(
      await supabase
        .from('users')
        .select('id, username, role, display_name, is_active')
        .eq('id', payload.sub)
        .maybeSingle()
    );
    if (!user || !user.is_active) return null;
    return { id: user.id, username: user.username, role: user.role, displayName: user.display_name };
  } catch {
    return null;
  }
}

export function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

// requireAuth() → any logged-in user; requireAuth('owner') etc. → role-gated.
export function requireAuth(...roles) {
  return async (req, res, next) => {
    const user = await userFromToken(req.cookies?.[COOKIE_NAME]);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (roles.length && !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.user = user;
    next();
  };
}

// Like requireAuth but doesn't reject — used on POST /api/orders where a staff
// cookie changes order source but customers stay anonymous.
export async function optionalAuth(req, _res, next) {
  req.user = (await userFromToken(req.cookies?.[COOKIE_NAME])) || null;
  next();
}
