// Frontend/src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const API_BASE = import.meta.env?.VITE_API_BASE ?? "";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);   // { employeeId, role, ... }
  const [token, setToken] = useState(null); // optional JWT
  const [ready, setReady] = useState(false);

  // Bootstrap from storage (session first, then local). If empty, ask backend.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // 1) Try sessionStorage (for non-remember logins)
      const tSess = sessionStorage.getItem("qd_token");
      const uSess = sessionStorage.getItem("qd_user");

      if (tSess && uSess) {
        try {
          if (!cancelled) {
            setToken(tSess);
            setUser(JSON.parse(uSess));
            setReady(true);
          }
          return;
        } catch {}
      }

      // 2) Try localStorage (for remember-me logins)
      const tLocal = localStorage.getItem("qd_token");
      const uLocal = localStorage.getItem("qd_user");
      if (tLocal && uLocal) {
        try {
          if (!cancelled) {
            setToken(tLocal);
            setUser(JSON.parse(uLocal));
            setReady(true);
          }
          return;
        } catch {}
      }

      // 3) Fallback: if a cookie session exists, restore it
      try {
        const res = await fetch(`${API_BASE}/api/auth/me?soft=1`, {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setUser(data.user || null);
            setToken(data.token || null);
          }
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setReady(true);
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(identifier, password, { remember } = {}) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      credentials: "include", // needed for cookie on remember=true
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password, remember }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Login failed");

    const u = data.user || null;
    setUser(u);
    setToken(data.token || null);

    // Save to chosen storage
    const store = remember ? localStorage : sessionStorage;
    store.setItem("qd_token", data.token || "");
    store.setItem("qd_user", JSON.stringify(u));

    // Clear the other store so we don’t keep stale values
    const other = remember ? sessionStorage : localStorage;
    other.removeItem("qd_token");
    other.removeItem("qd_user");

    return u;
  }

  function logout() {
    setUser(null);
    setToken(null);
    // Clear both storages
    localStorage.removeItem("qd_token");
    localStorage.removeItem("qd_user");
    sessionStorage.removeItem("qd_token");
    sessionStorage.removeItem("qd_user");
    // Clear cookie session if any
    fetch(`${API_BASE}/api/auth/logout`, { credentials: "include" }).catch(() => {});
  }

  const value = useMemo(() => ({ user, token, ready, login, logout }), [user, token, ready]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};