import React, { useEffect, useMemo, useState } from 'react';
import { X, Minus, Plus, ShoppingCart } from 'lucide-react';
import { fetchMenu, fetchTables, placeOrder } from '../api/client';

// Staff walk-in order entry: compact menu picker, no image-heavy cards.
export default function NewOrderModal({ onClose }) {
  const [menu, setMenu] = useState([]);
  const [tables, setTables] = useState([]);
  const [cart, setCart] = useState({});
  const [form, setForm] = useState({ name: 'Walk-in', phone: '000000', table: '', orderType: 'dine', note: '' });
  const [category, setCategory] = useState('All');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetchMenu(), fetchTables()]).then(([m, t]) => {
      setMenu(m.filter((i) => i.isAvailable));
      setTables(t);
    });
  }, []);

  const categories = useMemo(() => ['All', ...new Set(menu.map((i) => i.category))], [menu]);
  const shown = category === 'All' ? menu : menu.filter((i) => i.category === category);
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: menu.find((m) => m.id === Number(id)), qty }))
    .filter((l) => l.item);
  const total = lines.reduce((s, l) => s + l.item.price * l.qty, 0);

  const bump = (id, delta) =>
    setCart((p) => {
      const next = (p[id] || 0) + delta;
      if (next <= 0) {
        const { [id]: _, ...rest } = p;
        return rest;
      }
      return { ...p, [id]: Math.min(next, 20) };
    });

  const takeaway = form.orderType === 'takeaway';

  const submit = async () => {
    if ((!takeaway && !form.table) || !lines.length || busy) return;
    setBusy(true);
    setError('');
    try {
      await placeOrder({
        name: form.name || 'Walk-in',
        phone: form.phone || '000000',
        orderType: form.orderType,
        table: takeaway ? undefined : form.table,
        note: form.note,
        items: lines.map((l) => ({ menuItemId: l.item.id, qty: l.qty })),
      });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-xl font-black text-bean flex items-center gap-2">
            <ShoppingCart size={20} /> New Order
          </h2>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 grid md:grid-cols-2 gap-5">
          {/* menu picker */}
          <div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-3">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold flex-shrink-0 ${category === c ? 'bg-chiya text-white' : 'bg-gray-100 text-espresso'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {shown.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-bean truncate">{item.name}</p>
                    <p className="text-xs text-chiya font-black">Rs. {item.price}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => bump(item.id, -1)} disabled={!cart[item.id]} className="p-1.5 rounded-full bg-white border disabled:opacity-30">
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center font-black text-sm">{cart[item.id] || 0}</span>
                    <button onClick={() => bump(item.id, 1)} className="p-1.5 rounded-full bg-white border">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* order details */}
          <div className="space-y-3">
            <input
              placeholder="Customer name (optional)"
              className="w-full p-3 border rounded-xl text-sm"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              placeholder="Phone (optional)"
              className="w-full p-3 border rounded-xl text-sm"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
            <div>
              <div className="flex gap-1.5 mb-2">
                {['dine', 'takeaway'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((p) => ({ ...p, orderType: t }))}
                    className={`flex-1 py-1.5 rounded-lg font-bold text-sm ${form.orderType === t ? 'bg-espresso text-white' : 'border'}`}
                  >
                    {t === 'dine' ? '🪑 Dine in' : '🥡 Takeaway'}
                  </button>
                ))}
              </div>
              {!takeaway && (
                <>
                  <p className="text-xs font-black text-gray-400 uppercase mb-1">Table</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {tables.map((t) => (
                      <button
                        key={t}
                        onClick={() => setForm((p) => ({ ...p, table: t }))}
                        className={`py-1.5 rounded-lg font-bold text-sm ${form.table === t ? 'bg-chiya text-white' : 'border'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <textarea
              placeholder="Note"
              className="w-full p-3 border rounded-xl text-sm h-16"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            />
            <div className="bg-cream rounded-xl p-3 space-y-1">
              {lines.length === 0 && <p className="text-xs text-gray-400 text-center">No items yet</p>}
              {lines.map((l) => (
                <div key={l.item.id} className="flex justify-between text-xs font-bold">
                  <span>{l.qty}× {l.item.name}</span>
                  <span>Rs. {l.qty * l.item.price}</span>
                </div>
              ))}
              <div className="flex justify-between font-black border-t border-latte/40 pt-1 mt-1">
                <span>Total</span>
                <span>Rs. {total}</span>
              </div>
            </div>
            {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
            <button
              onClick={submit}
              disabled={(!takeaway && !form.table) || !lines.length || busy}
              className="w-full bg-espresso text-white py-3 rounded-xl font-black disabled:opacity-40"
            >
              {busy ? 'Placing…' : `Place Order — Rs. ${total}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
