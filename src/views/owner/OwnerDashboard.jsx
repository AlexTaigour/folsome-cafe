import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { Coffee, TrendingUp, Menu as MenuIcon, Users, QrCode, LogOut, ClipboardList, ChefHat, KeyRound, Sunset, NotebookPen, History, Wifi } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ChangePasswordModal from '../../components/ChangePasswordModal';
import AnalyticsTab from './AnalyticsTab';
import MenuTab from './MenuTab';
import UsersTab from './UsersTab';
import QrTab from './QrTab';
import OrderGateTab from './OrderGateTab';
import DayReportTab from './DayReportTab';
import CreditTab from './CreditTab';
import OrderHistoryTab from './OrderHistoryTab';

const TABS = [
  { to: '/owner', end: true, icon: TrendingUp, label: 'Analytics' },
  { to: '/owner/history', icon: History, label: 'History' },
  { to: '/owner/day-report', icon: Sunset, label: 'Day Report' },
  { to: '/owner/credit', icon: NotebookPen, label: 'Udhaaro' },
  { to: '/owner/menu', icon: MenuIcon, label: 'Menu' },
  { to: '/owner/users', icon: Users, label: 'Users' },
  { to: '/owner/qr', icon: QrCode, label: 'Table QR' },
  { to: '/owner/ordering', icon: Wifi, label: 'In-Café Lock' },
];

export default function OwnerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showChangePw, setShowChangePw] = useState(false);

  const linkClass = ({ isActive }) =>
    `w-full text-left px-5 py-4 rounded-2xl transition-all flex items-center gap-4 ${
      isActive ? 'bg-chiya text-white shadow-xl' : 'hover:bg-white/5 opacity-70 hover:opacity-100'
    }`;

  const utilClass =
    'flex items-center gap-3 px-5 py-3 rounded-2xl text-sm font-bold opacity-70 hover:opacity-100 hover:bg-white/5 whitespace-nowrap transition-all';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <aside className="bg-bean text-cream md:w-72 md:fixed md:inset-y-0 md:left-0 p-5 md:p-8 flex md:flex-col gap-4 md:gap-0 overflow-x-auto">
        <div className="hidden md:flex items-center gap-4 mb-12">
          <div className="bg-chiya p-3 rounded-2xl shadow-lg">
            <Coffee size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold handwritten tracking-wider">HCP Owner</h1>
            <p className="text-[10px] uppercase font-black opacity-50 tracking-widest">{user?.displayName}</p>
          </div>
        </div>

        <nav className="flex md:flex-col md:flex-grow gap-2 md:gap-3 md:space-y-0">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className={linkClass}>
              <tab.icon size={20} className="shrink-0" />
              <span className="font-bold whitespace-nowrap">{tab.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="md:mt-auto md:pt-8 md:space-y-3 md:border-t md:border-white/5 flex md:flex-col gap-2 md:gap-0">
          <button onClick={() => navigate('/staff')} className={utilClass}>
            <ClipboardList size={18} /> Counter
          </button>
          <button onClick={() => navigate('/kitchen')} className={utilClass}>
            <ChefHat size={18} /> Kitchen
          </button>
          <button onClick={() => setShowChangePw(true)} className={utilClass}>
            <KeyRound size={18} /> My Password
          </button>
          <button onClick={() => logout().then(() => navigate('/login'))} className="flex items-center gap-3 px-5 py-3 rounded-2xl text-sm font-bold text-red-400 hover:bg-red-400/10 whitespace-nowrap transition-all">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-grow md:ml-72 p-4 md:p-10 overflow-y-auto">
        <Routes>
          <Route index element={<AnalyticsTab />} />
          <Route path="history" element={<OrderHistoryTab />} />
          <Route path="day-report" element={<DayReportTab />} />
          <Route path="credit" element={<CreditTab />} />
          <Route path="menu" element={<MenuTab />} />
          <Route path="users" element={<UsersTab />} />
          <Route path="qr" element={<QrTab />} />
          <Route path="ordering" element={<OrderGateTab />} />
          <Route path="*" element={<Navigate to="/owner" replace />} />
        </Routes>
      </main>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
