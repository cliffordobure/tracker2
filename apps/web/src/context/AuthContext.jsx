import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { unregisterParentWebPush } from '../lib/webPush';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api('/auth/me')
      .then(({ user: u }) => {
        setUser(u);
        const s = connectSocket();
        s?.on('notification:new', (n) => {
          showToast(`${n.title}: ${n.body}`, 'success');
        });
      })
      .catch(() => {
        localStorage.removeItem('token');
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  const login = useCallback(
    async (email, password) => {
      const { token, user: u } = await api('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      localStorage.setItem('token', token);
      setUser(u);
      const s = connectSocket();
      s?.on('notification:new', (n) => {
        showToast(`${n.title}: ${n.body}`, 'success');
      });
      return u;
    },
    [showToast]
  );

  const logout = useCallback(async () => {
    if (user?.role === 'parent') {
      await unregisterParentWebPush();
    }
    localStorage.removeItem('token');
    disconnectSocket();
    setUser(null);
  }, [user?.role]);

  const value = useMemo(
    () => ({ user, loading, login, logout, showToast, toast }),
    [user, loading, login, logout, showToast, toast]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
