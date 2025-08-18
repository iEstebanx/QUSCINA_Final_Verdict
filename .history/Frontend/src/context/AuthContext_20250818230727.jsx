// src/context/AuthContext.jsx
import { createContext, useContext, useMemo, useState } from "react";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // {id, email, role: 'Admin'|'Manager'...}

  const login = async (email, password) => {
    // TODO: replace with Firebase/your API
    // demo:
    setUser({ id: "U1", email, role: "Admin" });
  };
  const logout = async () => setUser(null);

  const value = useMemo(() => ({ user, login, logout }), [user]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}