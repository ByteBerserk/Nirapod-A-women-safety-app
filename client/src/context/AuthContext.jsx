import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { authApi, userApi } from '../api/endpoints';
import { setAccessToken, setAuthLostHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const [booting, setBooting] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    if (mounted.current) setUser(null);
  }, []);

  useEffect(() => {
    setAuthLostHandler(clearSession);
    return () => setAuthLostHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await authApi.refresh();
        if (!cancelled && data?.accessToken) {
          setAccessToken(data.accessToken);
          setUser(data.user);
        }
      } catch {

        setAccessToken(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const response = await authApi.login(credentials);
    const { accessToken, user: profile } = response.data;
    setAccessToken(accessToken);
    setUser(profile);
    return profile;
  }, []);

  const register = useCallback(async (payload) => {
    const response = await authApi.register(payload);
    const { accessToken, user: profile } = response.data;
    setAccessToken(accessToken);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {

    }
    clearSession();
  }, [clearSession]);

  const patchUser = useCallback((changes) => {
    setUser((current) => (current ? { ...current, ...changes } : current));
  }, []);

  const reloadUser = useCallback(async () => {
    const data = await userApi.getProfile();
    if (data?.user) setUser(data.user);
    return data?.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      booting,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      isStaff: user?.role === 'admin' || user?.role === 'moderator',
      login,
      register,
      logout,
      patchUser,
      reloadUser,
    }),
    [user, booting, login, register, logout, patchUser, reloadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}
