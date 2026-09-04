import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ToastHost from './components/Toast';
import CustomerView from './views/CustomerView';
import OrderTrack from './views/OrderTrack';
import Login from './views/Login';
import StaffView from './views/StaffView';
import KitchenView from './views/KitchenView';
import OwnerDashboard from './views/owner/OwnerDashboard';
import { PLATFORM_NAME, PLATFORM_TAGLINE, PLATFORM_COMPANY, PLATFORM_COMPANY_URL } from './utils/brand';

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <ToastHost />
        <div className="flex-1">
          <Routes>
          <Route path="/" element={<CustomerView />} />
          <Route path="/track/:publicCode" element={<OrderTrack />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/staff"
            element={
              <ProtectedRoute roles={['staff', 'owner']}>
                <StaffView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kitchen"
            element={
              <ProtectedRoute roles={['kitchen', 'owner']}>
                <KitchenView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/owner/*"
            element={
              <ProtectedRoute roles={['owner']}>
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />
          {/* legacy bookmarks */}
          <Route path="/admin" element={<Navigate to="/login" replace />} />
          <Route path="/admin/login" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <footer className="border-t border-bean/10 bg-white/60 px-6 py-4 text-center text-[10px] text-bean/60">
          <p className="font-black tracking-wide">Powered by {PLATFORM_NAME}™</p>
          <p className="mt-0.5">{PLATFORM_TAGLINE} · A product from <a href={PLATFORM_COMPANY_URL} target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2 hover:text-chiya">{PLATFORM_COMPANY}</a></p>
        </footer>
      </div>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
