// Frontend/src/context/AdminContext.jsx
import { createContext, useContext, useMemo, useState } from "react";

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

/** Holds admin-wide state (filters, selected outlet, etc.) */
export function AdminProvider({ children }) {
  const [outlet, setOutlet] = useState("HQ");
  const [dateRange, setDateRange] = useState(null);

  const value = useMemo(() => ({ outlet, setOutlet, dateRange, setDateRange }), [outlet, dateRange]);
  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>;
}
