import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, LogOut, ChefHat, Loader2, LayoutDashboard, KeyRound, PackageX, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrdersLive } from '../hooks/useOrdersLive';
import { useSound } from '../hooks/useSound';
import { setOrderStatus, fetchMenu, setMenuItemAvailability } from '../api/client';
import { getSocket } from '../api/socket';
import AnimatedList from '../components/reactbits/AnimatedList';
import BrewingLoader from '../components/BrewingLoader';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { toast } from '../components/Toast';
import { minutesSince } from '../utils/format';

// KDS column definitions: which statuses land in which lane, and the primary
// action for each card. Dark theme, oversized touch targets for tablets.
const LANES = [
  { key: 'new', title: 'New', statuses: ['pending'], accent: 'border-orange-500', action: { to: 'accepted', label: 'Accept', style: 'bg-amber-500' } },
  { key: 'accepted', title: 'Accepted', statuses: ['accepted'], accent: 'border-amber-400', action: { to: 'preparing', label: 'Start', style: 'bg-blue-500' } },
  { key: 'preparing', title: 'Preparing', statuses: ['preparing'], accent: 'border-blue-500', action: { to: 'cooked', label: 'Cooked ✓', style: 'bg-purple-500' } },
];

const LATE_MINUTES = 15;

function KdsCard({ order, action, onStatusLocal }) {
  const [busy, setBusy] = useState(false);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const mins = minutesSince(order.createdAt);

  const act = async (to) => {
    if (busy) return;
    setBusy(true);
    // Optimistic: the status change moves the card to the next lane
    // immediately; persistence happens in the background.
    const undo = onStatusLocal?.(order.id, to);
    try {
      await setOrderStatus(order.id, to);
    } catch (err) {
      undo?.(); // conditional — a concurrent user's pushed status wins
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-2xl font-black text-white">
            {order.orderType === 'takeaway' ? `🥡 #${order.queueNo ?? '–'}` : `T${order.table}`}
          </p>
          <p className="text-[10px] text-slate-400 font-bold">{order.publicCode}</p>
        </div>
        <span className={`text-xs font-black px-2.5 py-1 rounded-full ${mins >= LATE_MINUTES ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-700 text-slate-300'}`}>
          {mins}m
        </span>
      </div>
      <ul className="space-y-1.5 mb-3">
        {order.items.map((it) => (
          <li key={it.id} className="text-white font-bold text-lg leading-tight">
            <span className="text-chiya">{it.qty}×</span> {it.name}
          </li>
        ))}
      </ul>
      {order.note && (
        <p className="text-amber-300 text-sm font-bold bg-amber-500/10 rounded-lg px-3 py-2 mb-3 break-words">
          ⚠ {order.note}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => act(action.to)}
          disabled={busy}
          className={`flex-1 ${action.style} text-white py-4 rounded-xl font-black text-lg active:scale-95 transition-transform disabled:opacity-50`}
        >
          {action.label}
        </button>
        <button
          onClick={() => window.confirm('Cancel this order?') && act('cancelled')}
          disabled={busy}
          className="px-4 bg-slate-700 text-red-400 rounded-xl font-black text-sm disabled:opacity-50"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// Quick "86 board": kitchen flips items sold-out/back without owner access.
// Instantly removes the item from the customer menu everywhere.
function StockModal({ onClose }) {
  const [menu, setMenu] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => fetchMenu().then(setMenu).catch(() => {});
  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('menu:updated', load);
    return () => socket.off('menu:updated', load);
  }, []);

  const flip = async (item) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await setMenuItemAvailability(item.id, !item.isAvailable);
      // menu:updated socket push reloads the list
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-5 border-b border-slate-800">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <PackageX size={20} className="text-red-400" /> Out of Stock
          </h2>
          <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-slate-300">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!menu ? (
            <Loader2 className="animate-spin text-chiya mx-auto my-10" size={28} />
          ) : (
            menu.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                  item.isAvailable ? 'bg-slate-800' : 'bg-red-500/10 border border-red-500/30'
                }`}
              >
                <div>
                  <p className={`font-bold ${item.isAvailable ? 'text-white' : 'text-red-300 line-through'}`}>
                    {item.name}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">{item.category}</p>
                </div>
                <button
                  onClick={() => flip(item)}
                  disabled={busyId === item.id}
                  className={`px-4 py-2 rounded-xl font-black text-xs active:scale-95 transition-all disabled:opacity-50 ${
                    item.isAvailable
                      ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                      : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                  }`}
                >
                  {busyId === item.id ? '…' : item.isAvailable ? 'Mark sold out' : 'Back in stock'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function KitchenView() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { enabled, toggle, chime } = useSound('tvx_sound_kds');
  const { orders, loading, applyStatusLocal } = useOrdersLive({ onNewOrder: chime });
  const [showChangePw, setShowChangePw] = useState(false);
  const [showStock, setShowStock] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="bg-slate-900 text-white px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-chiya p-2.5 rounded-xl">
            <ChefHat size={20} />
          </div>
          <div>
            <h1 className="font-black text-lg leading-tight">Kitchen Display</h1>
            <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">{user?.displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowStock(true)} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-red-300" title="Mark items sold out">
            <PackageX size={18} />
          </button>
          {user?.role === 'owner' && (
            <button onClick={() => navigate('/owner')} className="p-3 rounded-xl bg-white/5 hover:bg-white/10" title="Owner dashboard">
              <LayoutDashboard size={18} />
            </button>
          )}
          <button onClick={toggle} className="p-3 rounded-xl bg-white/5 hover:bg-white/10" title="Sound alerts">
            {enabled ? <Bell size={18} /> : <BellOff size={18} className="text-red-400" />}
          </button>
          <button onClick={() => setShowChangePw(true)} className="p-3 rounded-xl bg-white/5 hover:bg-white/10" title="Change my password">
            <KeyRound size={18} />
          </button>
          <button onClick={() => logout().then(() => navigate('/login'))} className="p-3 rounded-xl text-red-400 hover:bg-red-400/10" title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <BrewingLoader tone="dark" label="Loading orders" />
        </div>
      ) : (
        <main className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[1600px] mx-auto">
          {LANES.map((lane) => {
            const laneOrders = orders
              .filter((o) => lane.statuses.includes(o.status))
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // oldest first
            return (
              <section key={lane.key} className={`bg-slate-900 rounded-3xl border-t-4 ${lane.accent} min-h-[70vh]`}>
                <h2 className="text-white font-black uppercase tracking-widest text-sm px-5 py-4 flex items-center justify-between">
                  {lane.title}
                  <span className="bg-slate-700 text-slate-200 rounded-full px-3 py-0.5">{laneOrders.length}</span>
                </h2>
                <AnimatedList
                  items={laneOrders}
                  keyOf={(o) => o.id}
                  className="px-4 pb-4 space-y-3"
                  renderItem={(order) => <KdsCard order={order} action={lane.action} onStatusLocal={applyStatusLocal} />}
                />
              </section>
            );
          })}
        </main>
      )}

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      {showStock && <StockModal onClose={() => setShowStock(false)} />}
    </div>
  );
}
