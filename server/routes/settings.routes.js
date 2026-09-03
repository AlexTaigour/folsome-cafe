import { Router } from 'express';
import { requireAuth, optionalAuth } from '../auth.js';
import { validate, orderGateSchema } from '../validate.js';
import { getOrderGate, setOrderGate } from '../services/settingsService.js';
import { clientIp, ipKind, evaluateGate } from '../orderGate.js';

const router = Router();

// Public — lets the customer menu check whether it may order from here (and
// show the right prompt: connect to Wi-Fi / share location / too far) before
// submitting. Optional ?lat=&lng= feed the GPS layer. Returns only the verdict
// flags, never the allowlist or café coordinates (those are owner-only config).
// A logged-in staff cookie always reports allowed=true (they bypass the gate).
router.get('/order-gate/status', optionalAuth, async (req, res, next) => {
  try {
    const gate = await getOrderGate();
    const ip = clientIp(req);
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
    const v = evaluateGate(gate, { ip, coords: { lat, lng } });
    res.json({
      // "on" = any layer is active, so the client knows the gate is in effect.
      enabled: v.ipOn || v.geoOn,
      allowed: !!req.user || v.allowed,
      geoRequired: v.geoOn,       // GPS layer is active
      needLocation: !req.user && v.needLocation, // client should ask for coords
      distance: v.distance,       // metres from café, once coords are provided
      mode: v.mode,
      ip,
    });
  } catch (err) {
    next(err);
  }
});

// Owner: read the full gate config (enabled + IP allowlist) plus the requester's
// current IP, so the dashboard can offer "lock to this network".
router.get('/order-gate', requireAuth('owner'), async (req, res, next) => {
  try {
    const gate = await getOrderGate();
    const ip = clientIp(req);
    // currentIpKind lets the UI warn against locking to a loopback/private IP
    // (local testing, or trust-proxy misconfigured) instead of a real café IP.
    res.json({ ...gate, currentIp: ip, currentIpKind: ipKind(ip) });
  } catch (err) {
    next(err);
  }
});

// Owner: just the requester's current IP + classification. Backs the dashboard's
// "Detect my IP" button so the owner can re-check after switching to café Wi-Fi
// without reloading the whole page. Kept separate from GET /order-gate so a
// re-detect is a tiny request that never touches the settings store.
router.get('/order-gate/my-ip', requireAuth('owner'), (req, res) => {
  const ip = clientIp(req);
  res.json({ ip, kind: ipKind(ip) });
});

// Owner: update the gate (toggle and/or replace the IP list).
router.put('/order-gate', requireAuth('owner'), validate(orderGateSchema), async (req, res, next) => {
  try {
    const gate = await setOrderGate(req.body, req.user.id);
    const ip = clientIp(req);
    res.json({ ...gate, currentIp: ip, currentIpKind: ipKind(ip) });
  } catch (err) {
    next(err);
  }
});

export default router;
