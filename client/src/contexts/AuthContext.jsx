import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

const ROLE_PORTAL_ACCESS = {
  admin: ['distributor', 'frontdesk', 'consultant', 'branch', 'hr', 'finance', 'gm', 'director', 'mis', 'stock', 'admin', 'training', 'staff'],
  distributor: ['distributor'],
  frontdesk: ['distributor', 'frontdesk', 'staff'],
  consultant: ['consultant', 'staff'],
  dispenser: ['branch', 'staff'],
  branch_manager: ['frontdesk', 'branch', 'staff'],
  hr_manager: ['hr', 'staff'],
  finance: ['finance', 'staff'],
  gm: ['distributor', 'frontdesk', 'consultant', 'branch', 'hr', 'finance', 'gm', 'stock', 'staff'],
  director: ['distributor', 'frontdesk', 'consultant', 'branch', 'hr', 'finance', 'gm', 'director', 'stock', 'staff'],
  mis: ['mis', 'staff'],
  stock: ['stock', 'staff'],
  warehouse: ['stock', 'staff'],
  training: ['training', 'distributor', 'staff'],
  staff: ['staff'],
  support_staff: ['staff'],
};

const SESSION_ALIVE_KEY = 'dyna_session_alive';
const VERSION_KEY = 'dyna_app_version';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [systemUpdated, setSystemUpdated] = useState(false);
  const [postLoginNotifications, setPostLoginNotifications] = useState([]);
  const [showLoginAfterRefresh, setShowLoginAfterRefresh] = useState(false);

  useEffect(() => {
    const isRefresh = sessionStorage.getItem(SESSION_ALIVE_KEY) === 'true';

    if (isRefresh) {
      api.auth.logout().catch(() => {});
      sessionStorage.removeItem(SESSION_ALIVE_KEY);

      api.version.check()
        .then(data => {
          if (data?.version) {
            const cachedVersion = sessionStorage.getItem(VERSION_KEY);
            if (cachedVersion && cachedVersion !== data.version) {
              setSystemUpdated(true);
            }
            sessionStorage.setItem(VERSION_KEY, data.version);
          }
        })
        .catch(() => {})
        .finally(() => {
          setShowLoginAfterRefresh(true);
          setLoading(false);
        });
    } else {
      sessionStorage.setItem(SESSION_ALIVE_KEY, 'true');

      api.version.check()
        .then(data => {
          if (data?.version) {
            sessionStorage.setItem(VERSION_KEY, data.version);
          }
        })
        .catch(() => {});

      api.auth.me()
        .then(data => {
          if (data.user) setUser(data.user);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.auth.login(username, password);
    const loggedInUser = data.user;
    const previousLastLogin = data.user?.previousLastLogin || null;

    sessionStorage.setItem(SESSION_ALIVE_KEY, 'true');
    setSystemUpdated(false);
    setShowLoginAfterRefresh(false);
    setUser(loggedInUser);

    if (previousLastLogin && loggedInUser) {
      const recipientId = loggedInUser.username || loggedInUser.id;
      api.notifications.listSince(recipientId, previousLastLogin)
        .then(notifications => {
          if (Array.isArray(notifications) && notifications.length > 0) {
            setPostLoginNotifications(notifications);
          }
        })
        .catch(() => {});
    }

    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    sessionStorage.removeItem(SESSION_ALIVE_KEY);
    setUser(null);
    setPostLoginNotifications([]);
  }, []);

  const dismissPostLoginNotifications = useCallback(() => {
    setPostLoginNotifications([]);
  }, []);

  const dismissSystemUpdated = useCallback(() => {
    setSystemUpdated(false);
  }, []);

  const hasPortalAccess = useCallback((portalId) => {
    if (!user) return false;
    const primaryAccess = ROLE_PORTAL_ACCESS[user.role] || [];
    if (primaryAccess.includes(portalId)) return true;
    const additionalRoles = Array.isArray(user.additional_roles) ? user.additional_roles : [];
    return additionalRoles.some(r => (ROLE_PORTAL_ACCESS[r] || []).includes(portalId));
  }, [user]);

  const getAccessiblePortals = useCallback(() => {
    if (!user) return [];
    const primary = ROLE_PORTAL_ACCESS[user.role] || [];
    const additionalRoles = Array.isArray(user.additional_roles) ? user.additional_roles : [];
    const extra = additionalRoles.flatMap(r => ROLE_PORTAL_ACCESS[r] || []);
    return [...new Set([...primary, ...extra])];
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      hasPortalAccess,
      getAccessiblePortals,
      systemUpdated,
      dismissSystemUpdated,
      postLoginNotifications,
      dismissPostLoginNotifications,
      showLoginAfterRefresh,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
