import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { authApi, userApi } from '../api/endpoints';
import { setAccessToken, setAuthLostHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `booting` is separate from a loading flag: it covers the one-time attempt
  // to restore a session from the refresh cookie. Routes must not redirect to
  // the login page while it is true, or a refresh would log everyone out.
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

  // The axios interceptor calls this when refreshing fails for good.
  useEffect(() => {
    setAuthLostHandler(clearSession);
    return () => setAuthLostHandler(null);
  }, [clearSession]);

  /*
   * On boot, ask the server to mint a new access token from the httpOnly
   * refresh cookie. This is what makes a page refresh keep you signed in
   * without ever putting a token in localStorage.
   */
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
        // No cookie, or it expired. A signed-out visitor is a normal state.
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
      // Even if the server call fails, the local session must end.
    }
    clearSession();
  }, [clearSession]);

  /** Merges a partial update into the cached profile after a settings save. */
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
