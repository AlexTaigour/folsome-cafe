import { Router } from 'express';
import { supabase, sb } from '../db.js';
import { requireAuth, hashPassword } from '../auth.js';
import { validate, createUserSchema, updateUserSchema } from '../validate.js';

const router = Router();
router.use(requireAuth('owner'));

const intId = (raw) => (/^\d+$/.test(raw) ? Number(raw) : null);

const shape = (r) => ({
  id: r.id,
  username: r.username,
  role: r.role,
  displayName: r.display_name,
  isActive: !!r.is_active,
  createdAt: r.created_at,
});

router.get('/', async (req, res, next) => {
  try {
    const rows = sb(await supabase.from('users').select('*').order('created_at'));
    res.json(rows.map(shape));
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createUserSchema), async (req, res, next) => {
  try {
    const { username, password, role, displayName } = req.body;
    const { data, error } = await supabase
      .from('users')
      .insert({ username, password_hash: hashPassword(password), role, display_name: displayName })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Username already taken' });
      }
      throw new Error(error.message);
    }
    res.status(201).json(shape(data));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validate(updateUserSchema), async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const target =
      id === null
        ? null
        : sb(await supabase.from('users').select('*').eq('id', id).maybeSingle());
    if (!target) return res.status(404).json({ error: 'User not found' });

    const { displayName, role, isActive, password } = req.body;
    const lockingSelfOut =
      target.id === req.user.id && (isActive === false || (role && role !== 'owner'));
    if (lockingSelfOut) {
      return res.status(409).json({ error: 'You cannot deactivate or demote your own account' });
    }

    const patch = {};
    if (displayName !== undefined) patch.display_name = displayName;
    if (role !== undefined) patch.role = role;
    if (isActive !== undefined) patch.is_active = isActive;
    if (password) patch.password_hash = hashPassword(password);

    const row = Object.keys(patch).length
      ? sb(await supabase.from('users').update(patch).eq('id', target.id).select('*').single())
      : target;
    res.json(shape(row));
  } catch (err) {
    next(err);
  }
});

// "Delete" deactivates — FK history (orders.created_by etc.) must stay valid.
router.delete('/:id', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (id === null) return res.status(404).json({ error: 'User not found' });
    if (id === req.user.id) {
      return res.status(409).json({ error: 'You cannot deactivate your own account' });
    }
    const rows = sb(
      await supabase.from('users').update({ is_active: false }).eq('id', id).select('id')
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
