import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, LogOut, Coffee, Plus, LayoutDashboard, Loader2, KeyRound, Armchair, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrdersLive } from '../hooks/useOrdersLive';
import { useSound } from '../hooks/useSound';
import OrderCard from '../components/OrderCard';
import AnimatedList from '../components/reactbits/AnimatedList';
import NewOrderModal from '../components/NewOrderModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import TableBoard from '../components/TableBoard';
import ServiceCallsBar from '../components/ServiceCallsBar';

export default function StaffView() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { enabled, toggle, chime } = useSound();
  const { orders, loading, applyStatusLocal } = useOrdersLive({ onNewOrder: chime });
  const [showChangePw, setShowChangePw] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [tab, setTab] = useState('orders'); // orders | tables
  const [filter, setFilter] = useState('all');

  const visible = useMemo(() => {
    if (filter === 'ready') return orders.filter((o) => o.status === 'cooked');
    return orders;
  }, [orders, filter]);

  const readyCount = orders.filter((o) => o.status === 'cooked').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-bean text-cream px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-chiya p-2.5 rounded-xl">
            <Coffee size={20} />
          </div>
          <div>
            <h1 className="font-bold handwritten text-lg leading-tight">HCP Counter</h1>
            <p className="text-[10px] uppercase font-black opacity-50 tracking-widest">
              {user?.displayName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'owner' && (
            <button
              onClick={() => navigate('/owner')}
              className="p-3 rounded-xl bg-white/5 hover:bg-white/10"
              title="Owner dashboard"
            >
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

      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        <ServiceCallsBar />
        {/* Orders = per-order workflow; Tables = floor overview + take payment */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('orders')}
            className={`px-5 py-2.5 rounded-full font-black text-sm flex items-center gap-2 transition-all active:scale-95 ${tab === 'orders' ? 'bg-bean text-cream shadow-md' : 'bg-white text-bean border hover:border-bean/40'}`}
          >
            <ClipboardList size={16} /> Orders
          </button>
          <button
            onClick={() => setTab('tables')}
            className={`px-5 py-2.5 rounded-full font-black text-sm flex items-center gap-2 transition-all active:scale-95 ${tab === 'tables' ? 'bg-bean text-cream shadow-md' : 'bg-white text-bean border hover:border-bean/40'}`}
          >
            <Armchair size={16} /> Tables
          </button>
        </div>

        {tab === 'tables' ? (
          <TableBoard />
        ) : (
          <>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-5 py-2.5 rounded-full font-bold text-sm transition-all active:scale-95 ${filter === 'all' ? 'bg-espresso text-white shadow-md' : 'bg-white text-espresso border hover:border-espresso/40'}`}
            >
              Active ({orders.length})
            </button>
            <button
              onClick={() => setFilter('ready')}
              className={`px-5 py-2.5 rounded-full font-bold text-sm transition-all active:scale-95 ${filter === 'ready' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-purple-600 border border-purple-200 hover:border-purple-400'}`}
            >
              Ready to serve ({readyCount})
            </button>
          </div>
          <button
            onClick={() => setShowNewOrder(true)}
            className="bg-chiya text-white px-5 py-2.5 rounded-full font-black text-sm flex items-center gap-2 shadow-lg hover:shadow-xl hover:brightness-105 transition-all active:scale-95"
          >
            <Plus size={18} /> New Order
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-espresso" size={40} />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center text-gray-400 py-20">
            <Coffee size={48} className="mx-auto mb-4" />
            <p className="font-bold">No active orders — enjoy the quiet ☕</p>
          </div>
        ) : (
          <AnimatedList
            items={visible}
            keyOf={(o) => o.id}
            className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5"
            renderItem={(order) => <OrderCard order={order} role={user?.role === 'owner' ? 'owner' : 'staff'} onStatusLocal={applyStatusLocal} />}
          />
        )}
          </>
        )}
      </main>

      {showNewOrder && <NewOrderModal onClose={() => setShowNewOrder(false)} />}
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
