import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

// Applies the account-wide theme preference to the whole document.
function applyTheme(theme) {
  const root = document.documentElement;
  const resolve = () =>
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light';
  root.dataset.theme = resolve();
  if (theme !== 'system') return undefined;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => (root.dataset.theme = resolve());
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => applyTheme(user?.theme || 'light'), [user?.theme]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, setUser, logout }), [user, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// Where each role lands after signing in.
export function homePathFor(user) {
  if (!user) return '/signin';
  return { admin: '/app/admin', staff: '/app/staff', investor: '/app/discover', graduate: '/app' }[user.role] || '/app';
}
