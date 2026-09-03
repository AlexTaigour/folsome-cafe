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

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <div className="min-h-screen">
        <ToastHost />
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
    </BrowserRouter>
  </AuthProvider>
);

export default App;
