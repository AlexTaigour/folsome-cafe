import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchMe, login as apiLogin, logout as apiLogout } from '../api/client';
import { reconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export const HOME_BY_ROLE = { staff: '/staff', kitchen: '/kitchen', owner: '/owner' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const d = await apiLogin(username, password);
    setUser(d.user);
    reconnectSocket();
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {}
    setUser(null);
    reconnectSocket();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
