import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, KeyRound, Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react';
import { changePassword } from '../api/client';

// Self-service password change for the logged-in user (any role).
// Owners reset OTHER users' passwords from the Users tab instead.
export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await changePassword(current, next);
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err.status === 401 ? 'Current password is incorrect' : err.message);
      setBusy(false);
    }
  };

  const inputClass =
    'w-full p-3 pr-12 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-chiya outline-none transition-all font-bold text-bean';

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
      >
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-10 text-center"
            >
              <CheckCircle2 size={56} className="mx-auto text-green-500 mb-4" />
              <p className="text-xl font-black text-bean">Password updated</p>
              <p className="text-sm text-gray-400 font-bold mt-1">Use it on your next login</p>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={submit} className="space-y-4" exit={{ opacity: 0 }}>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-black text-bean flex items-center gap-2">
                  <span className="bg-cream p-2 rounded-xl">
                    <KeyRound size={18} className="text-chiya" />
                  </span>
                  Change Password
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  placeholder="Current password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  tabIndex={-1}
                  title={show ? 'Hide passwords' : 'Show passwords'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-chiya transition-colors"
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <input
                type={show ? 'text' : 'password'}
                placeholder="New password (min 8 chars)"
                required
                minLength={8}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className={inputClass}
              />
              <div>
                <input
                  type={show ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={`${inputClass} ${mismatch ? 'border-red-300 focus:border-red-400' : ''}`}
                />
                {mismatch && (
                  <p className="text-red-400 text-xs font-bold mt-1.5 ml-1">Passwords don't match</p>
                )}
              </div>

              {error && <p className="text-red-500 text-sm font-bold text-center">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-2xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || mismatch}
                  className="px-6 py-3 bg-espresso hover:bg-bean text-white rounded-2xl font-black disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  {busy ? 'Saving…' : 'Update'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
