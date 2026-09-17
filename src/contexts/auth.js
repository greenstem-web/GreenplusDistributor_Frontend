import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as authApi from "../api/auth";
import { getToken, isUnauthorized } from "../api/baseapi";

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // Distinct from "no user": on the first render we do not yet know whether the stored token is
  // still good. Without this the app flashes the login screen on every refresh before /auth/me
  // answers, and a user who is signed in sees a login form for half a second.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }

      try {
        const me = await authApi.getCurrentUser();
        if (!cancelled) setUser(me);
      } catch (error) {
        // A 401 here means the token expired or the account was deactivated. Anything else - the API
        // being down, for instance - must NOT discard the token: signing the user out because the
        // dev server restarted is worse than letting the next real call fail.
        if (isUnauthorized(error)) authApi.logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username, password) => {
    const result = await authApi.login(username, password);
    setUser({
      userId: result.userId,
      username: result.username,
      distributorId: result.distributorId,
      distributorName: result.distributorName,
    });
    return result;
  }, []);

  const signOut = useCallback(() => {
    authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
