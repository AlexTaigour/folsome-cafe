import { Router } from 'express';
import { supabase, sb } from '../db.js';
import { requireAuth } from '../auth.js';
import { validate, menuItemSchema, availabilitySchema } from '../validate.js';
import { emitMenuUpdated } from '../sockets.js';

const router = Router();

// Postgres rejects non-numeric ids at the protocol level; pre-check instead.
const intId = (raw) => (/^\d+$/.test(raw) ? Number(raw) : null);

const shape = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  price: r.price,
  image: r.image,
  description: r.description ?? '',
  cookMinutes: r.cook_minutes ?? null,
  isAvailable: !!r.is_available,
});

// Public: customer menu. Owners get sold-out items too (to toggle them back).
router.get('/', async (req, res, next) => {
  try {
    const rows = sb(
      await supabase
        .from('menu_items')
        .select('*')
        .eq('is_deleted', false)
        .order('category')
        .order('name')
    );
    res.json(rows.map(shape));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth('owner'), validate(menuItemSchema), async (req, res, next) => {
  try {
    const { name, category, price, image, description, cookMinutes, isAvailable } = req.body;
    const row = sb(
      await supabase
        .from('menu_items')
        .insert({ name, category, price, image, description, cook_minutes: cookMinutes, is_available: isAvailable })
        .select('*')
        .single()
    );
    emitMenuUpdated();
    res.status(201).json(shape(row));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth('owner'), validate(menuItemSchema), async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (id === null) return res.status(404).json({ error: 'Item not found' });
    const { name, category, price, image, description, cookMinutes, isAvailable } = req.body;
    const rows = sb(
      await supabase
        .from('menu_items')
        .update({ name, category, price, image, description, cook_minutes: cookMinutes, is_available: isAvailable })
        .eq('id', id)
        .eq('is_deleted', false)
        .select('*')
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    emitMenuUpdated();
    res.json(shape(rows[0]));
  } catch (err) {
    next(err);
  }
});

// Kitchen ran out of an item mid-shift: flip availability only. Kitchen can't
// edit anything else about the item — full edits stay owner-only above.
router.put(
  '/:id/availability',
  requireAuth('kitchen', 'staff', 'owner'),
  validate(availabilitySchema),
  async (req, res, next) => {
    try {
      const id = intId(req.params.id);
      if (id === null) return res.status(404).json({ error: 'Item not found' });
      const rows = sb(
        await supabase
          .from('menu_items')
          .update({ is_available: req.body.isAvailable })
          .eq('id', id)
          .eq('is_deleted', false)
          .select('*')
      );
      if (!rows.length) return res.status(404).json({ error: 'Item not found' });
      emitMenuUpdated();
      res.json(shape(rows[0]));
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', requireAuth('owner'), async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (id === null) return res.status(404).json({ error: 'Item not found' });
    const rows = sb(
      await supabase
        .from('menu_items')
        .update({ is_deleted: true })
        .eq('id', id)
        .eq('is_deleted', false)
        .select('id')
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    emitMenuUpdated();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
