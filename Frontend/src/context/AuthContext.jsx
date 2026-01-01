// QUSCINA_BACKOFFICE/Frontend/src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { joinApi } from "@/utils/apiBase";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

async function safeJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || res.statusText || "Invalid response" };
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { employeeId, role, ... }
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

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
        const res = await fetch(joinApi("/api/auth/me?soft=1"), {
          credentials: "include",
          cache: "no-store",
          headers: { "X-App": "backoffice" },
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!window.__qd_originalFetch) {
      window.__qd_originalFetch = window.fetch.bind(window);
    }

    const originalFetch = window.__qd_originalFetch;

    window.fetch = async (input, init = {}) => {
      try {
        const url =
          typeof input === "string"
            ? input
            : input?.url || "";

        const isApiCall =
          typeof url === "string" &&
          (url.includes("/api/") || url.startsWith("/api/") || url.startsWith("api/"));


        if (!isApiCall) return originalFetch(input, init);

        // start with headers from Request (if input is Request)
        const baseHeaders =
          typeof input !== "string" && input?.headers
            ? new Headers(input.headers)
            : new Headers();

        // apply init.headers on top (so caller can override)
        const initHeaders = new Headers(init.headers || {});
        initHeaders.forEach((v, k) => baseHeaders.set(k, v));

        if (!baseHeaders.has("X-App")) baseHeaders.set("X-App", "backoffice");

        const stored =
          token ||
          sessionStorage.getItem("qd_token") ||
          localStorage.getItem("qd_token") ||
          "";

        if (stored && !baseHeaders.has("Authorization")) {
          baseHeaders.set("Authorization", `Bearer ${stored}`);
        }

        return originalFetch(input, {
          ...init,
          headers: baseHeaders,
          credentials: init.credentials ?? "include",
          cache: init.cache ?? "no-store",
        });
      } catch {
        return originalFetch(input, init);
      }
    };

    return () => {
      if (window.__qd_originalFetch) {
        window.fetch = window.__qd_originalFetch;
      }
    };
  }, [token]);


  /**
   * Role-aware login precheck.
   * Backend should return { ok, role, employeeId, loginMode: "password"|"pin", pinNotSet?, ticketExpired?, ticketExpiresAt? }
   */
  async function precheckLogin(identifier) {
    let res;
    try {
      res = await fetch(joinApi("/api/auth/login/precheck"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
        body: JSON.stringify({ identifier, app: "backoffice" }),
      });
    } catch {
      const err = new Error("Unable to reach server. Check your connection.");
      err.status = 0;
      err.data = null;
      throw err;
    }

    const data = await safeJson(res);
    if (!res.ok) {
      const err = new Error(data?.error || res.statusText || "Precheck failed");
      err.status = res.status;
      err.data = data || null;
      throw err;
    }
    return data;
  }

  /**
   * loginMode:
   * - "password": sends { password }
   * - "pin": sends { pin }
   */
  async function login(identifier, secret, { remember, loginMode } = {}) {
    const mode = loginMode === "pin" ? "pin" : "password";

    let res;
    try {
      res = await fetch(joinApi("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
        body: JSON.stringify({
          identifier,
          remember,
          app: "backoffice",
          ...(mode === "pin" ? { pin: secret } : { password: secret }),
        }),
      });
    } catch {
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

    const u = data.user || null;
    setUser(u);
    setToken(data.token || null);

    const store = remember ? localStorage : sessionStorage;
    store.setItem("qd_user", JSON.stringify(u));

    if (data.token) {
      store.setItem("qd_token", data.token);
    } else {
      store.removeItem("qd_token");
    }

    // store the exact identifier the user typed to login
    store.setItem("qd_login_identifier", String(identifier || "").trim());

    const other = remember ? sessionStorage : localStorage;
    other.removeItem("qd_token");
    other.removeItem("qd_user");

    // clear it from the other storage too
    other.removeItem("qd_login_identifier");

    return u;
  }

  async function logout() {
    let res;
    try {
      res = await fetch(
        joinApi(
          "/api/auth/logout?terminal_id=" +
            encodeURIComponent(localStorage.getItem("terminal_id") || "")
        ),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-App": "backoffice" },
        }
      );
    } catch {
      const err = new Error("Unable to reach server. Please try again.");
      err.status = 0;
      err.data = null;
      throw err;
    }

    const data = await safeJson(res);

    // ✅ IMPORTANT: do NOT clear local/session if logout was blocked (409) or failed
    if (!res.ok) {
      const err = new Error(data?.error || res.statusText || "Logout failed");
      err.status = res.status;
      err.data = data || null;
      throw err;
    }

    // ✅ logout ok => clear client state
    setUser(null);
    setToken(null);
    localStorage.removeItem("qd_token");
    localStorage.removeItem("qd_user");
    localStorage.removeItem("qd_login_identifier");
    sessionStorage.removeItem("qd_token");
    sessionStorage.removeItem("qd_user");
    sessionStorage.removeItem("qd_login_identifier");
  }

  const value = useMemo(
    () => ({ user, token, ready, precheckLogin, login, logout }),
    [user, token, ready]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};