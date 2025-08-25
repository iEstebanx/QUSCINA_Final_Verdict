// Frontend/src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);   // { employeeId, role, ... }
  const [token, setToken] = useState(null); // JWT (if you keep it client-side)
  const [ready, setReady] = useState(false);

  // Bootstrap from localStorage
  useEffect(() => {
    const t = localStorage.getItem("qd_token");
    const u = localStorage.getItem("qd_user");
    if (t && u) {
      setToken(t);
      try { setUser(JSON.parse(u)); } catch {}
    }
    setReady(true);
  }, []);

  async function login(identifier, password, { remember } = {}) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      credentials: "include", // allow cookie for remember=true
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password, remember }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Login failed");

    const u = data.user || null;
    setUser(u);
    setToken(data.token || null);

    if (remember) {
      localStorage.setItem("qd_token", data.token || "");
      localStorage.setItem("qd_user", JSON.stringify(u));
    } else {
      localStorage.removeItem("qd_token");
      localStorage.removeItem("qd_user");
    }
    return u;
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem("qd_token");
    localStorage.removeItem("qd_user");
    fetch(`${API_BASE}/api/auth/logout`, { credentials: "include" }).catch(() => {});
  }

  const value = useMemo(() => ({ user, token, ready, login, logout }), [user, token, ready]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};