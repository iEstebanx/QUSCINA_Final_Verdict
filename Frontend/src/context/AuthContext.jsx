// Frontend/src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const API_BASE = import.meta.env?.VITE_API_BASE ?? "";
const join = (p) => `${API_BASE}`.replace(/\/+$/,"") + `/${String(p||"").replace(/^\/+/, "")}`;

async function safeJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: text || res.statusText || "Invalid response" }; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);   // { employeeId, role, ... }
  const [token, setToken] = useState(null); // optional JWT
  const [ready, setReady] = useState(false);

  // Bootstrap from storage (session first, then local). If empty, ask backend.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // 1) Try sessionStorage
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

      // 2) Try localStorage
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

      // 3) Fallback: cookie session (soft)
      try {
        const res = await fetch(join("/api/auth/me?soft=1"), {
          credentials: "include",
          cache: "no-store",
        });
        const data = await safeJson(res);
        if (res.ok && !cancelled) {
          setUser(data.user || null);
          setToken(data.token || null);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setReady(true);
    }

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  // in AuthContext (same file where setUser/setToken live)
  async function login(identifier, password, { remember } = {}) {
    // if this file doesn't have safeJson/join, either import them or inline:
    // const join = (p) => `${API_BASE}`.replace(/\/+$/,"") + `/${String(p||"").replace(/^\/+/, "")}`;
    // async function safeJson(res) { const t = await res.text(); try { return t ? JSON.parse(t) : {}; } catch { return { error: t || res.statusText || "Invalid response" }; } }

    let res;
    try {
      res = await fetch(join("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
        body: JSON.stringify({ identifier, password, remember, app: "backoffice" }),
      });
    } catch (networkErr) {
      // Network/timeout/etc → throw with status 0 so UI can show a nice message
      const err = new Error("Unable to reach server. Check your connection.");
      err.status = 0;
      err.data = null;
      throw err;
    }

    const data = await safeJson(res);

    if (!res.ok) {
      // ✨ Enrich the error so caller can branch on status (423 temp/permanent lock)
      const err = new Error(data?.error || res.statusText || "Login failed");
      err.status = res.status;   // e.g., 401, 403, 423
      err.data = data || null;   // may contain { remaining_seconds }
      throw err;
    }

    // ✅ success → keep your existing behavior
    const u = data.user || null;
    setUser(u);
    setToken(data.token || null);

    // Save to chosen storage
    const store = remember ? localStorage : sessionStorage;
    store.setItem("qd_token", data.token || "");
    store.setItem("qd_user", JSON.stringify(u));

    // Clear the other store to avoid stale values
    const other = remember ? sessionStorage : localStorage;
    other.removeItem("qd_token");
    other.removeItem("qd_user");

    return u; // (unchanged) callers expecting a user keep working
  }

  function logout() {
    // clear client state first (instant UX)
    setUser(null);
    setToken(null);
    localStorage.removeItem("qd_token");
    localStorage.removeItem("qd_user");
    sessionStorage.removeItem("qd_token");
    sessionStorage.removeItem("qd_user");

    // tell the server to clear the cookie (best-effort)
    fetch(join("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  }

  const value = useMemo(() => ({ user, token, ready, login, logout }), [user, token, ready]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};