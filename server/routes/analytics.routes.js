import { Router } from 'express';
import { requireAuth } from '../auth.js';
import * as analytics from '../services/analyticsService.js';

const router = Router();
router.use(requireAuth('owner'));

// from/to are optional ISO strings (from inclusive, to exclusive). Backstop:
// invalid dates are dropped, a "to" in the far future is clamped to now, and an
// inverted window (from >= to) falls back to the service defaults instead of
// querying a negative range. Owner-only endpoints, so this is belt-and-braces.
const range = (req) => {
  const MAX = Date.now() + 24 * 60 * 60 * 1000; // tolerate small clock skew
  const parse = (s) => {
    if (!s || Number.isNaN(Date.parse(s))) return undefined;
    return Math.min(Date.parse(s), MAX);
  };
  let from = parse(req.query.from);
  let to = parse(req.query.to);
  if (from !== undefined && to !== undefined && from >= to) {
    from = undefined;
    to = undefined;
  }
  return [
    from !== undefined ? new Date(from).toISOString() : undefined,
    to !== undefined ? new Date(to).toISOString() : undefined,
  ];
};

// wrap: await the service and forward rejections to the error handler
const h = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    next(err);
  }
};

router.get('/summary', h((req) => analytics.summary(...range(req))));
router.get('/day-report', h((req) => analytics.dayReport(...range(req))));
router.get('/sales-by-day', h((req) => analytics.salesByDay(...range(req))));
router.get('/top-items', h((req) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  return analytics.topItems(...range(req), limit);
}));
router.get('/peak-hours', h((req) => analytics.peakHours(...range(req))));
router.get('/prep-times', h((req) => analytics.prepTimes(...range(req))));
router.get('/funnel', h((req) => analytics.statusFunnel(...range(req))));

export default router;
