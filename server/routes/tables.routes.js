import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { validate, settleSchema } from '../validate.js';
import { getBoard, getTableBill, settleTable, TAKEAWAY_TABLE } from '../services/tableService.js';

// Factory: the configured table list (["1".."N"]) comes from server.js.
export default function tablesRouter(tables) {
  const router = Router();
  const knownTable = (t) => tables.includes(t) || t === TAKEAWAY_TABLE;

  // Live table board — free / dining / awaiting-payment per table.
  router.get('/board', requireAuth('staff', 'owner'), async (req, res, next) => {
    try {
      res.json(await getBoard(tables));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:tableNo/bill', requireAuth('staff', 'owner'), async (req, res, next) => {
    try {
      if (!knownTable(req.params.tableNo)) {
        return res.status(404).json({ error: 'Unknown table' });
      }
      res.json(await getTableBill(req.params.tableNo));
    } catch (err) {
      next(err);
    }
  });

  // Take payment: settles unpaid orders on the table in one payment — the
  // whole tab, or just body.orderIds when staff splits the bill.
  router.post(
    '/:tableNo/settle',
    requireAuth('staff', 'owner'),
    validate(settleSchema),
    async (req, res, next) => {
      try {
        if (!knownTable(req.params.tableNo)) {
          return res.status(404).json({ error: 'Unknown table' });
        }
        res.json(await settleTable(req.params.tableNo, req.body, req.user));
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
