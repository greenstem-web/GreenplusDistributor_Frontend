import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { alert, confirm } from "devextreme/ui/dialog";
import * as authApi from "../api/auth";
import { getToken, isUnauthorized, setSessionLostHandler } from "../api/baseapi";

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}

/** The accounting app's wording, so a user of both sees the same thing. */
const DUPLICATE_TITLE = "Duplicate Login Detected";
const DUPLICATE_ASK = "This account is signed in on another device.<br/>Do you want to continue logging in? This will terminate the current session.";
const DUPLICATE_KICKED = "Another session with this login is detected. Please log out now.";

function isDuplicateLogin(error) {
  return error?.response?.status === 409 && error?.response?.data?.code === "duplicate_login";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // Distinct from "no user": on the first render we do not yet know whether the stored token is
  // still good. Without this the app flashes the login screen on every refresh before /auth/me
  // answers, and a user who is signed in sees a login form for half a second.
  const [loading, setLoading] = useState(true);

  // Why the user was signed out, for the login page to say - e.g. the session ended.
  const [notice, setNotice] = useState(null);

  /**
   * The API refused this tab's session (see baseapi's response interceptor). Several calls can fail
   * at once - the dashboard loads four things - so it is handled ONCE until the next sign-in.
   * Signed in elsewhere: tell the user, as the accounting app does, then back to the login screen.
   * The server is NOT told to sign out - the session it would end is the new one on the other device.
   */
  const lost = useRef(false);

  useEffect(() => {
    setSessionLostHandler((reason) => {
      if (lost.current) return;
      lost.current = true;

      authApi.dropSession();
      if (reason === "duplicate") {
        alert(DUPLICATE_KICKED, DUPLICATE_TITLE).then(() => {
          setNotice("You were signed out because this account signed in on another device.");
          setUser(null);
        });
      } else {
        setNotice("Your session has ended. Please log in again.");
        setUser(null);
      }
    });
    return () => setSessionLostHandler(null);
  }, []);

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
        // A 401 / 409 here means the token expired, the account was deactivated or it signed in
        // elsewhere (the session-lost handler has already said so). Anything else - the API being
        // down, for instance - must NOT discard the token: signing the user out because the dev
        // server restarted is worse than letting the next real call fail.
        if (isUnauthorized(error) || isDuplicateLogin(error)) authApi.dropSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Signs in. If the account is signed in on another device, asks first - continuing ends that
   * session. Returns null when the user chose not to.
   */
  const signIn = useCallback(async (username, password) => {
    let result;
    try {
      result = await authApi.login(username, password);
    } catch (error) {
      if (!isDuplicateLogin(error)) throw error;
      const proceed = await confirm(DUPLICATE_ASK, DUPLICATE_TITLE);
      if (!proceed) return null;
      result = await authApi.login(username, password, true);
    }

    lost.current = false;
    setNotice(null);
    setUser({
      userId: result.userId,
      username: result.username,
      distributorId: result.distributorId,
      distributorName: result.distributorName,
      isAdmin: result.isAdmin,
      mustChangePassword: result.mustChangePassword,
    });
    return result;
  }, []);

  /** Updates what this tab knows about the user - e.g. mustChangePassword after a change. */
  const updateUser = useCallback((patch) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  /** Signs out. `reason`, when given, is shown on the login page - e.g. signed out for being idle. */
  const signOut = useCallback(async (reason) => {
    // The session ends on the server first, so the next login is not asked about this one.
    await authApi.logout();
    setNotice(typeof reason === "string" ? reason : null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, notice, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
