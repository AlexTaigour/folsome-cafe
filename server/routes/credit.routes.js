import { Router } from 'express';
import { supabase, sb, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { validate, creditRepaySchema } from '../validate.js';

// Udhaaro (credit) ledger. Balance per customer = SUM(amount) by phone;
// positive entries are bills taken on credit, negative are repayments.
const router = Router();
router.use(requireAuth('staff', 'owner'));

// Outstanding balances, biggest debtors first.
router.get('/', async (req, res, next) => {
  try {
    const rows = sb(
      await supabase
        .from('credit_entries')
        .select('customer_name, customer_phone, amount, created_at')
        .order('created_at')
    );
    const byPhone = new Map();
    for (const r of rows) {
      const cur = byPhone.get(r.customer_phone) || {
        phone: r.customer_phone,
        name: r.customer_name,
        balance: 0,
        lastAt: r.created_at,
      };
      cur.name = r.customer_name; // latest name wins
      cur.balance += r.amount;
      cur.lastAt = r.created_at;
      byPhone.set(r.customer_phone, cur);
    }
    const customers = [...byPhone.values()].filter((c) => c.balance !== 0);
    customers.sort((a, b) => b.balance - a.balance);
    res.json({
      customers,
      totalOutstanding: customers.reduce((s, c) => s + Math.max(0, c.balance), 0),
    });
  } catch (err) {
    next(err);
  }
});

// Full history for one customer.
router.get('/:phone', async (req, res, next) => {
  try {
    const rows = sb(
      await supabase
        .from('credit_entries')
        .select('id, customer_name, amount, method, note, created_at, users(display_name)')
        .eq('customer_phone', req.params.phone)
        .order('created_at', { ascending: false })
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.customer_name,
        amount: r.amount,
        method: r.method,
        note: r.note,
        createdAt: r.created_at,
        takenBy: r.users?.display_name ?? null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Record a repayment (negative ledger entry).
router.post('/repay', validate(creditRepaySchema), async (req, res, next) => {
  try {
    const { phone, name, amount, method, note } = req.body;
    const row = sb(
      await supabase
        .from('credit_entries')
        .insert({
          customer_name: name,
          customer_phone: phone,
          amount: -amount,
          method,
          taken_by: req.user.id,
          note,
          created_at: nowIso(),
        })
        .select('*')
        .single()
    );
    res.status(201).json({ id: row.id, amount: row.amount, createdAt: row.created_at });
  } catch (err) {
    next(err);
  }
});

export default router;
