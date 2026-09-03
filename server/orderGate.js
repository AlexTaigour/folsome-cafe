// In-café ordering lock. Customers reach the app over a public URL, so without
// this anyone on the internet could place an order. Everyone on the café Wi-Fi
// shares the café's single public IP (NAT), while people at home have a
// different one — so an allowlist of the café's public IP(s) lets the server
// tell "in the café" from "outside" and reject the latter.
//
// Staff/owner/kitchen (a valid cookie → req.user) always bypass the gate: they
// place counter/phone orders and aren't necessarily on shop Wi-Fi.
import { getOrderGate } from './services/settingsService.js';

// Café Wi-Fi sits behind one router, so all devices share one IPv6 /64 network
// prefix even though each device's lower 64 bits differ (and rotate, via
// privacy extensions). Match on the prefix, not the full address. Overridable
// for unusual ISP delegations.
const V6_PREFIX = Number(process.env.ORDER_GATE_IPV6_PREFIX) || 64;

// Normalize an address for comparison: lowercase, unwrap IPv4-mapped IPv6
// (`::ffff:1.2.3.4` → `1.2.3.4`), drop IPv6 zone id / brackets.
export function normalizeIp(raw) {
  if (!raw) return '';
  let s = String(raw).trim().toLowerCase().replace(/^\[|\]$/g, '');
  s = s.split('%')[0]; // strip zone id (fe80::1%eth0)
  if (s.startsWith('::ffff:') && s.includes('.')) s = s.slice(7);
  return s;
}

// The real client IP. Prefer the original client from common proxy headers, then
// fall back to Express' req.ip / socket remote address when the app is not
// behind a proxy (local dev or a direct LAN deployment).
export function clientIp(req) {
  const forwarded = [
    req.headers?.['x-forwarded-for'],
    req.headers?.['cf-connecting-ip'],
    req.headers?.['x-real-ip'],
    req.headers?.['true-client-ip'],
  ]
    .flatMap((value) => String(value || '').split(',').map((part) => part.trim()).filter(Boolean))
    .map((ip) => normalizeIp(ip))
    .filter(Boolean);

  const publicForwarded = forwarded.find((ip) => ipKind(ip) === 'public');
  if (publicForwarded) return publicForwarded;
  if (forwarded.length) return forwarded[0];
  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
}

// Classify an address so the owner UI can warn: locking to a loopback/private
// IP is almost always a mistake (local testing, or trust-proxy misconfigured in
// production) and would make the gate either block everyone or do nothing.
// 'public' = a routable internet IP, i.e. a real café connection.
export function ipKind(raw) {
  const ip = normalizeIp(raw);
  if (!ip) return 'unknown';
  if (ip === '::1' || ip === '0.0.0.0') return 'loopback';
  if (ip.includes('.')) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return 'unknown';
    if (p[0] === 127) return 'loopback';
    if (p[0] === 10) return 'private';
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return 'private';
    if (p[0] === 192 && p[1] === 168) return 'private';
    if (p[0] === 169 && p[1] === 254) return 'private'; // link-local / no DHCP
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return 'private'; // CGNAT
    return 'public';
  }
  // IPv6
  const h = expandV6(ip);
  if (!h) return 'unknown';
  if ((h[0] & 0xfe00) === 0xfc00) return 'private'; // fc00::/7 unique-local
  if ((h[0] & 0xffc0) === 0xfe80) return 'private'; // fe80::/10 link-local
  return 'public';
}

// Expand any IPv6 form to its 8 hextets (numbers), or null if not IPv6.
function expandV6(addr) {
  if (!addr.includes(':')) return null;
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let parts;
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    parts = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    parts = head;
  }
  if (parts.length !== 8) return null;
  const hextets = parts.map((p) => parseInt(p || '0', 16));
  return hextets.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : hextets;
}

// Do two IPv6 addresses share the first `prefixBits` bits?
function samePrefixV6(a, b, prefixBits) {
  const ha = expandV6(a);
  const hb = expandV6(b);
  if (!ha || !hb) return false;
  let bits = prefixBits;
  for (let i = 0; i < 8 && bits > 0; i++) {
    const take = Math.min(16, bits);
    const mask = take === 16 ? 0xffff : (0xffff << (16 - take)) & 0xffff;
    if ((ha[i] & mask) !== (hb[i] & mask)) return false;
    bits -= take;
  }
  return true;
}

function ipv4ToInt(ip) {
  const parts = normalizeIp(ip).split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function ipv4InCidr(ip, cidr) {
  const match = String(cidr).trim().match(/^([^/]+)\/(\d{1,2})$/);
  if (!match) return false;
  const [, network, prefixText] = match;
  const prefixBits = Number(prefixText);
  if (!Number.isInteger(prefixBits) || prefixBits < 0 || prefixBits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt == null || netInt == null) return false;
  if (prefixBits === 0) return true;
  const mask = prefixBits === 32 ? 0xffffffff : ((0xffffffff << (32 - prefixBits)) >>> 0);
  return (ipInt & mask) === (netInt & mask);
}

function parseAllowEntry(raw) {
  const value = normalizeIp(raw || '');
  if (!value) return null;
  const slash = value.indexOf('/');
  if (slash === -1) return { addr: value, prefixBits: null };
  const addr = value.slice(0, slash);
  const suffix = value.slice(slash + 1);
  if (!/^\d+$/.test(suffix)) return { addr: value, prefixBits: null };
  return { addr: normalizeIp(addr), prefixBits: Number(suffix) };
}

// Does a client IP match one allowlist entry? IPv4 accepts exact IPs and CIDR
// blocks; IPv6 matches on the /64 (or configured) prefix and also accepts CIDR
// notation like `2001:db8:aaaa:0001::/64`. Families never cross.
export function ipMatches(clientRaw, allowRaw, { v6Prefix = V6_PREFIX } = {}) {
  const client = normalizeIp(clientRaw);
  const allow = normalizeIp(allowRaw);
  if (!client || !allow) return false;
  const clientV6 = client.includes(':');
  const allowEntry = parseAllowEntry(allow);
  if (!allowEntry || !allowEntry.addr) return false;
  const allowV6 = allowEntry.addr.includes(':');
  if (clientV6 !== allowV6) return false;
  if (allow.includes('/')) {
    return clientV6
      ? samePrefixV6(client, allowEntry.addr, Number.isInteger(allowEntry.prefixBits) ? allowEntry.prefixBits : v6Prefix)
      : ipv4InCidr(client, allow);
  }
  return clientV6 ? samePrefixV6(client, allowEntry.addr, v6Prefix) : client === allowEntry.addr;
}

// Is the IP layer configured (enabled with at least one allowed IP)? An
// unconfigured layer is inert, so a half-set gate never locks the shop out.
export function ipLayerActive(gate) {
  return !!(gate?.enabled && gate.ips?.length);
}

// Does this IP satisfy the IP layer? True when the layer is inert.
export function ipAllowed(ip, gate) {
  if (!ipLayerActive(gate)) return true;
  return gate.ips.some((allow) => ipMatches(ip, allow));
}

// ---- GPS layer --------------------------------------------------------
// Great-circle distance in metres between two lat/lng points (haversine).
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius, metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Is the GPS layer configured (enabled with a valid café coordinate)?
export function geoLayerActive(gate) {
  const g = gate?.geo;
  return !!(g?.enabled && Number.isFinite(g.lat) && Number.isFinite(g.lng) && g.radiusM > 0);
}

// Evaluate the GPS layer for a client position. Returns a small verdict object
// so callers can distinguish "layer off", "too far", and "no location sent"
// (the last drives the customer UI's "confirm your location" prompt).
export function geoCheck(gate, coords) {
  if (!geoLayerActive(gate)) return { active: false, pass: true, distance: null };
  const lat = Number(coords?.lat);
  const lng = Number(coords?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { active: true, pass: false, distance: null, missing: true };
  }
  const g = gate.geo;
  const distance = Math.round(haversineMeters(g.lat, g.lng, lat, lng));
  return { active: true, pass: distance <= g.radiusM, distance, missing: false };
}

// ---- combined decision ------------------------------------------------
// Combine the IP and GPS layers. `mode` decides how two *active* layers mix:
//   'any'  (default) — pass if EITHER layer passes. Lets mobile-data guests in
//                      and never false-blocks a Wi-Fi guest who denies GPS.
//   'all'            — must pass EVERY active layer (Wi-Fi AND at the café).
// An inert layer never contributes. If no layer is active the gate is off and
// everyone is allowed (fail open).
export function evaluateGate(gate, { ip, coords } = {}) {
  const ipOn = ipLayerActive(gate);
  const geoOn = geoLayerActive(gate);
  const ipPass = ipOn ? ipAllowed(ip, gate) : null;
  const geo = geoCheck(gate, coords);
  const mode = gate?.mode === 'all' ? 'all' : 'any';

  let allowed;
  if (!ipOn && !geoOn) allowed = true;
  else if (ipOn && !geoOn) allowed = ipPass;
  else if (!ipOn && geoOn) allowed = geo.pass;
  else allowed = mode === 'all' ? ipPass && geo.pass : ipPass || geo.pass;

  // The customer app should ask for location when GPS could still tip an
  // otherwise-blocked request over the line — i.e. it's active, no coords were
  // provided, and IP alone hasn't already allowed the order.
  const ipWouldAllow = mode === 'any' && ipOn && ipPass;
  const needLocation = geoOn && geo.missing && !ipWouldAllow;

  return { allowed, mode, ipOn, ipPass, geoOn, geoPass: geo.pass, distance: geo.distance, needLocation };
}

// A short, customer-facing reason for a blocked order, tailored to which layer
// failed so the UI can guide them (connect to Wi-Fi vs. come closer).
export function blockMessage(verdict, gate) {
  if (verdict.needLocation) return 'Please share your location to confirm you’re at the café.';
  if (verdict.geoOn && !verdict.geoPass && verdict.distance != null) {
    return 'You appear to be too far from the café to order. Please order from inside the café.';
  }
  return 'Ordering is only available inside the café. Please connect to the café Wi-Fi and try again.';
}

// Express middleware for POST /api/orders. Must run after optionalAuth so
// req.user (staff) is populated. Fails OPEN — a settings/DB error must never
// stop the shop taking orders; the worst case is a brief window where an
// outsider could order, which is strictly better than refusing paying guests.
export async function orderGate(req, res, next) {
  try {
    if (req.user) return next(); // logged-in staff/owner/kitchen bypass
    const gate = await getOrderGate();
    // Coordinates ride along in the order body ({ lat, lng }); the client
    // collects them via the browser Geolocation API before submitting.
    const coords = { lat: req.body?.lat, lng: req.body?.lng };
    const verdict = evaluateGate(gate, { ip: clientIp(req), coords });
    if (verdict.allowed) return next();
    return res.status(403).json({
      error: blockMessage(verdict, gate),
      code: verdict.needLocation ? 'need_location' : 'off_premises',
    });
  } catch (err) {
    console.error('orderGate check failed (allowing order):', err.message);
    return next();
  }
}
