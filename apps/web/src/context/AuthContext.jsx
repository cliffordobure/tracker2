import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { unregisterParentWebPush } from '../lib/webPush';

const AuthContext = createContext(null);

function bindParentTripToasts(socket, showToast) {
  if (!socket) return;
  let lastAt = 0;
  socket.on('notification:new', (n) => {
    lastAt = Date.now();
    showToast(`${n.title}: ${n.body}`, 'success');
  });
  socket.on('trip:started', (payload) => {
    const alert = payload?.alert;
    if (!alert?.title || Date.now() - lastAt < 4000) return;
    showToast(alert.body ? `${alert.title}: ${alert.body}` : alert.title, 'success');
  });
}

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
        bindParentTripToasts(connectSocket(), showToast);
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
      bindParentTripToasts(connectSocket(), showToast);
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

  const updateUser = useCallback((next) => {
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, updateUser, showToast, toast }),
    [user, loading, login, logout, updateUser, showToast, toast]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
