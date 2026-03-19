import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

const ROLE_PORTAL_ACCESS = {
  admin: ['distributor', 'frontdesk', 'consultant', 'branch', 'hr', 'finance', 'gm', 'director', 'mis', 'stock', 'admin', 'training'],
  distributor: ['distributor'],
  frontdesk: ['distributor', 'frontdesk'],
  consultant: ['consultant'],
  dispenser: ['distributor', 'frontdesk', 'branch'],
  branch_manager: ['distributor', 'frontdesk', 'branch'],
  hr_manager: ['hr'],
  finance: ['finance'],
  gm: ['distributor', 'frontdesk', 'consultant', 'branch', 'hr', 'finance', 'gm', 'stock'],
  director: ['distributor', 'frontdesk', 'consultant', 'branch', 'hr', 'finance', 'gm', 'director', 'stock'],
  mis: ['mis'],
  stock: ['stock'],
  training: ['training', 'distributor'],
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.me()
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.auth.login(username, password);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  const hasPortalAccess = useCallback((portalId) => {
    if (!user) return false;
    const access = ROLE_PORTAL_ACCESS[user.role] || [];
    return access.includes(portalId);
  }, [user]);

  const getAccessiblePortals = useCallback(() => {
    if (!user) return [];
    return ROLE_PORTAL_ACCESS[user.role] || [];
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPortalAccess, getAccessiblePortals }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
