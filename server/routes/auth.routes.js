import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase, sb } from '../db.js';
import {
  verifyPassword,
  hashPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from '../auth.js';
import { validate, loginSchema, changePasswordSchema } from '../validate.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    // ilike gives case-insensitive match; escape its wildcards so "own%r"
    // can't pattern-match a real username.
    const exact = username.replace(/[\\%_]/g, '\\$&');
    const user = sb(
      await supabase
        .from('users')
        .select('*')
        .ilike('username', exact)
        .eq('is_active', true)
        .maybeSingle()
    );
    // Constant-shape error: never reveal whether the username exists.
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    setAuthCookie(res, signToken(user));
    res.json({
      user: { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth(), (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// Any logged-in user changes their own password; owners reset others via /api/users.
router.post(
  '/change-password',
  requireAuth(),
  validate(changePasswordSchema),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const row = sb(
        await supabase
          .from('users')
          .select('id, password_hash')
          .eq('id', req.user.id)
          .maybeSingle()
      );
      if (!row || !verifyPassword(currentPassword, row.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      sb(
        await supabase
          .from('users')
          .update({ password_hash: hashPassword(newPassword) })
          .eq('id', row.id)
          .select('id')
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

export default router;
