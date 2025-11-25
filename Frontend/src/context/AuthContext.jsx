// Frontend/src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

/* =============================================================
   🔥 FIXED API BASE LOGIC
   Local dev  -> "" (Vite proxy handles /api)
   Production -> Railway backend
   Env var    -> optional override (VITE_API_BASE)
============================================================= */

const PROD_API_BASE = "https://quscinabackofficebackend-production.up.railway.app";

const API_BASE =
  import.meta.env?.VITE_API_BASE ||
  (typeof window !== "undefined" &&
  window.location.hostname.endsWith("vercel.app")
    ? PROD_API_BASE
    : "");

// join("/api/auth/login") -> builds correct URL for dev + prod
const join = (p) =>
  `${API_BASE}`.replace(/\/+$/, "") +
  `/${String(p || "").replace(/^\/+/, "")}`;

/* =============================================================
   Safe JSON helper
============================================================= */

async function safeJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || res.statusText || "Invalid response" };
  }
}

/* =============================================================
   Auth Provider
============================================================= */

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { employeeId, role, ... }
  const [token, setToken] = useState(null); // optional JWT
  const [ready, setReady] = useState(false);

  /* =============================================================
     Bootstrap login state
  ============================================================= */

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

      // 3) Fallback: /api/auth/me?soft=1
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
    return () => {
      cancelled = true;
    };
  }, []);

  /* =============================================================
     LOGIN
  ============================================================= */

  async function login(identifier, password, { remember } = {}) {
    let res;

    try {
      res = await fetch(join("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-App": "backoffice",
        },
        body: JSON.stringify({
          identifier,
          password,
          remember,
          app: "backoffice",
        }),
      });
    } catch (networkErr) {
      const err = new Error("Unable to reach server. Check your connection.");
      err.status = 0;
      err.data = null;
      throw err;
    }

    const data = await safeJson(res);

    if (!res.ok) {
      const err = new Error(data?.error || res.statusText || "Login failed");
      err.status = res.status;
      err.data = data || null;
      throw err;
    }

    // success
    const u = data.user || null;
    setUser(u);
    setToken(data.token || null);

    // remember me
    const store = remember ? localStorage : sessionStorage;
    store.setItem("qd_token", data.token || "");
    store.setItem("qd_user", JSON.stringify(u));

    // clear other store
    const other = remember ? sessionStorage : localStorage;
    other.removeItem("qd_token");
    other.removeItem("qd_user");

    return u;
  }

  /* =============================================================
     LOGOUT
  ============================================================= */

  async function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem("qd_token");
    localStorage.removeItem("qd_user");
    sessionStorage.removeItem("qd_token");
    sessionStorage.removeItem("qd_user");

    try {
      await fetch(join("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      /* ignore */
    }
  }

  /* =============================================================
     Return context
  ============================================================= */

  const value = useMemo(
    () => ({ user, token, ready, login, logout }),
    [user, token, ready]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};