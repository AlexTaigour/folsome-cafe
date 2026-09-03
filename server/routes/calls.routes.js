import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase, sb, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { validate, serviceCallSchema } from '../validate.js';
import { emitServiceCall, emitServiceCallResolved } from '../sockets.js';

const publicCallLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many service calls. Please wait a moment and try again.' },
});

// Customer "call waiter" / "ask for bill" — public POST (table pages are
// anonymous), staff-only list/resolve.
export default function callsRouter(tables) {
  const router = Router();

  const shape = (r) => ({
    id: r.id,
    table: r.table_no,
    kind: r.kind,
    status: r.status,
    createdAt: r.created_at,
  });

  router.post('/', publicCallLimiter, validate(serviceCallSchema), async (req, res, next) => {
    try {
      const { table, kind } = req.body;
      if (!tables.includes(table)) return res.status(404).json({ error: 'Unknown table' });

      // Debounce: an open call of the same kind on the same table is reused,
      // so a customer mashing the button doesn't flood the counter.
      const existing = sb(
        await supabase
          .from('service_calls')
          .select('*')
          .eq('table_no', table)
          .eq('kind', kind)
          .eq('status', 'open')
          .limit(1)
      );
      if (existing.length) return res.json(shape(existing[0]));

      const row = sb(
        await supabase
          .from('service_calls')
          .insert({ table_no: table, kind, status: 'open', created_at: nowIso() })
          .select('*')
          .single()
      );
      emitServiceCall(shape(row));
      res.status(201).json(shape(row));
    } catch (err) {
      next(err);
    }
  });

  router.get('/', requireAuth('staff', 'owner'), async (req, res, next) => {
    try {
      const rows = sb(
        await supabase
          .from('service_calls')
          .select('*')
          .eq('status', 'open')
          .order('created_at')
      );
      res.json(rows.map(shape));
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/resolve', requireAuth('staff', 'owner'), async (req, res, next) => {
    try {
      if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
      const rows = sb(
        await supabase
          .from('service_calls')
          .update({ status: 'resolved', resolved_at: nowIso(), resolved_by: req.user.id })
          .eq('id', Number(req.params.id))
          .eq('status', 'open')
          .select('*')
      );
      if (!rows.length) return res.status(404).json({ error: 'Already resolved' });
      emitServiceCallResolved({ id: rows[0].id, table: rows[0].table_no });
      res.json(shape(rows[0]));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
