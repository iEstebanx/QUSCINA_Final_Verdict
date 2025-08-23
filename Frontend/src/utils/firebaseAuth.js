// Frontend/src/utils/firebaseAuth.js
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // { sub, role, name, username, email } from token OR backend summary
  const [token, setToken] = useState(null);     // JWT string
  const [ready, setReady] = useState(false);

  // bootstrap from localStorage
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
    const res = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      credentials: "include", // allow cookie if remember=true
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password, remember }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Login failed");

    // prefer server user summary; fall back to decoding token if needed
    const u = data.user || {};
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
    // optionally call a /logout that clears the cookie
    fetch("http://localhost:5000/api/auth/logout", { credentials: "include" }).catch(() => {});
  }

  const value = useMemo(() => ({ user, token, ready, login, logout }), [user, token, ready]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}