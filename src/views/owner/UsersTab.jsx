import React, { useEffect, useState } from 'react';
import { Plus, X, KeyRound, UserX, UserCheck, Loader2, CheckCircle2 } from 'lucide-react';
import { fetchUsers, createUser, updateUser } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const ROLE_STYLES = {
  owner: 'bg-chiya/10 text-chiya',
  staff: 'bg-blue-100 text-blue-600',
  kitchen: 'bg-purple-100 text-purple-600',
};
const EMPTY = { username: '', password: '', displayName: '', role: 'staff' };

// Owner-side reset of another user's password (no current-password needed —
// this is the recovery path when someone forgets theirs).
function ResetPasswordModal({ target, onClose, onDone }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await updateUser(target.id, { password: pw });
      setDone(true);
      setTimeout(() => { onDone?.(); onClose(); }, 1200);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
            <p className="font-black text-bean">Password updated</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-bean">Reset password</h3>
              <button type="button" onClick={onClose} className="p-2 bg-gray-100 rounded-full"><X size={16} /></button>
            </div>
            <p className="text-sm text-gray-500 font-bold">
              New password for <span className="text-chiya">@{target.username}</span>
            </p>
            <input
              type="text" placeholder="New password (min 8 chars)" required minLength={8}
              autoFocus autoComplete="off"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-chiya outline-none font-bold"
            />
            {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 rounded-2xl font-bold">Cancel</button>
              <button type="submit" disabled={busy} className="px-6 py-2 bg-espresso text-white rounded-2xl font-black disabled:opacity-50 flex items-center gap-2">
                {busy && <Loader2 size={14} className="animate-spin" />} Reset
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => fetchUsers().then(setUsers).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await createUser(form);
      await refresh();
      setShowAdd(false);
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await updateUser(u.id, { isActive: !u.isActive });
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-black text-bean tracking-tight">Users</h2>
        <button onClick={() => { setForm(EMPTY); setError(''); setShowAdd(true); }} className="bg-espresso hover:bg-bean text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-md transition-all active:scale-95">
          <Plus size={20} /> New User
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100 overflow-x-auto">
        <table className="w-full text-left min-w-[520px]">
          <thead className="bg-cream text-espresso uppercase text-[10px] font-black">
            <tr>
              <th className="px-6 py-5">User</th>
              <th className="px-6 py-5">Role</th>
              <th className="px-6 py-5">Status</th>
              <th className="px-6 py-5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-b border-gray-50 ${!u.isActive ? 'opacity-50' : ''}`}>
                <td className="px-6 py-4">
                  <p className="font-black text-bean">{u.displayName}</p>
                  <p className="text-xs text-gray-400 font-bold">@{u.username}{u.id === me?.id && ' (you)'}</p>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-black px-3 py-1 rounded-full uppercase ${ROLE_STYLES[u.role]}`}>{u.role}</span>
                </td>
                <td className="px-6 py-4 text-sm font-bold">{u.isActive ? 'Active' : 'Disabled'}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-1">
                    <button onClick={() => setResetTarget(u)} title="Reset password" className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg">
                      <KeyRound size={17} />
                    </button>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => toggleActive(u)}
                        title={u.isActive ? 'Disable' : 'Enable'}
                        className={`p-2 rounded-lg ${u.isActive ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                      >
                        {u.isActive ? <UserX size={17} /> : <UserCheck size={17} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={add} className="bg-white rounded-2xl p-8 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-bean">New User</h3>
              <button type="button" onClick={() => setShowAdd(false)} className="p-2 bg-gray-100 rounded-full"><X size={16} /></button>
            </div>
            <input
              placeholder="Display name" required maxLength={80}
              value={form.displayName}
              onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200"
            />
            <input
              placeholder="Username (login)" required minLength={3} maxLength={50} pattern="[a-zA-Z0-9_.\-]+"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200"
            />
            <input
              type="password" placeholder="Password (min 8 chars)" required minLength={8}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200"
              autoComplete="new-password"
            />
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200"
            >
              <option value="staff">Staff — counter, serving, bills</option>
              <option value="kitchen">Kitchen — order queue</option>
              <option value="owner">Owner — full access</option>
            </select>
            {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowAdd(false)} className="px-6 py-2 bg-gray-200 rounded-2xl font-bold">Cancel</button>
              <button type="submit" disabled={busy} className="px-6 py-2 bg-espresso text-white rounded-2xl font-black disabled:opacity-50">Create</button>
            </div>
          </form>
        </div>
      )}

      {resetTarget && (
        <ResetPasswordModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}
