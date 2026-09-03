import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, EyeOff, Eye, X } from 'lucide-react';
import { fetchMenu, createMenuItem, updateMenuItem, deleteMenuItem } from '../../api/client';

const CATEGORIES = ['Chiya', 'Coffee', 'Snack', 'Khaja', 'Sweets', 'Others'];
const EMPTY = { name: '', category: 'Chiya', price: '', image: '', description: '', cookMinutes: '', isAvailable: true };

export default function MenuTab() {
  const [menu, setMenu] = useState([]);
  const [modal, setModal] = useState(null); // {mode:'add'} | {mode:'edit', item}
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => fetchMenu().then(setMenu).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const openAdd = () => { setForm(EMPTY); setError(''); setModal({ mode: 'add' }); };
  const openEdit = (item) => {
    setForm({
      name: item.name, category: item.category, price: String(item.price), image: item.image,
      description: item.description || '',
      cookMinutes: item.cookMinutes == null ? '' : String(item.cookMinutes),
      isAvailable: item.isAvailable,
    });
    setError('');
    setModal({ mode: 'edit', item });
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const payload = {
      name: form.name,
      category: form.category,
      price: Math.round(Number(form.price)),
      image: form.image,
      description: form.description,
      cookMinutes: form.cookMinutes === '' ? null : Math.round(Number(form.cookMinutes)),
      isAvailable: form.isAvailable,
    };
    try {
      if (modal.mode === 'add') await createMenuItem(payload);
      else await updateMenuItem(modal.item.id, payload);
      await refresh();
      setModal(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAvailable = async (item) => {
    try {
      await updateMenuItem(item.id, {
        name: item.name, category: item.category, price: item.price, image: item.image,
        description: item.description || '', cookMinutes: item.cookMinutes ?? null,
        isAvailable: !item.isAvailable,
      });
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await deleteMenuItem(item.id);
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-black text-bean tracking-tight">Menu</h2>
        <button onClick={openAdd} className="bg-espresso hover:bg-bean text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-md transition-all active:scale-95">
          <Plus size={20} /> New Item
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100 overflow-x-auto">
        <table className="w-full text-left min-w-[560px]">
          <thead className="bg-cream text-espresso uppercase text-[10px] font-black">
            <tr>
              <th className="px-6 py-5">Item</th>
              <th className="px-6 py-5">Category</th>
              <th className="px-6 py-5">Price</th>
              <th className="px-6 py-5">Status</th>
              <th className="px-6 py-5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {menu.map((item) => (
              <tr key={item.id} className={`border-b border-gray-50 ${!item.isAvailable ? 'opacity-50' : ''}`}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {item.image ? (
                      <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-cream" />
                    )}
                    <span className="font-black text-bean">{item.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm">{item.category}</td>
                <td className="px-6 py-4 font-bold">Rs. {item.price}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleAvailable(item)}
                    className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full ${item.isAvailable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {item.isAvailable ? <Eye size={13} /> : <EyeOff size={13} />}
                    {item.isAvailable ? 'Available' : 'Sold out'}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(item)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit size={17} /></button>
                    <button onClick={() => remove(item)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={save} className="bg-white rounded-2xl p-8 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-bean">{modal.mode === 'add' ? 'Add Item' : 'Edit Item'}</h3>
              <button type="button" onClick={() => setModal(null)} className="p-2 bg-gray-100 rounded-full"><X size={16} /></button>
            </div>
            <input
              placeholder="Item name" required maxLength={100}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200"
            />
            <input
              placeholder="Image URL (optional)" maxLength={2000}
              value={form.image}
              onChange={(e) => setForm((p) => ({ ...p, image: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200"
            />
            <input
              type="number" placeholder="Price (Rs.)" required min={0} step={1}
              value={form.price}
              onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200"
            />
            <textarea
              placeholder="Description (optional — shown to customers)" maxLength={500}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200 h-20 resize-none"
            />
            <input
              type="number" placeholder="Cook time in minutes (optional)" min={1} max={240} step={1}
              value={form.cookMinutes}
              onChange={(e) => setForm((p) => ({ ...p, cookMinutes: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              className="w-full p-3 rounded-xl border border-gray-200"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-2 font-bold text-sm text-bean">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => setForm((p) => ({ ...p, isAvailable: e.target.checked }))}
              />
              Available for ordering
            </label>
            {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setModal(null)} className="px-6 py-2 bg-gray-200 rounded-2xl font-bold">Cancel</button>
              <button type="submit" disabled={busy} className="px-6 py-2 bg-espresso text-white rounded-2xl font-black disabled:opacity-50">
                {modal.mode === 'add' ? 'Add' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
