// QUSCINA_BACKOFFICE/Frontend/src/context/ShiftContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { API_BASE } from "@/utils/apiBase";

// Helper to build Backoffice POS shift API URL
const shiftApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;

  // Local dev: backend proxied under /api
  if (!base) return `/api/pos/shift${clean}`;
  if (base.endsWith("/api")) return `${base}/pos/shift${clean}`;
  return `${base}/api/pos/shift${clean}`;
};

const ShiftContext = createContext(null);

export function ShiftProvider({ children }) {
  const [state, setState] = useState({
    loading: false,
    error: null,
    shift: null,     // raw row from pos_shifts
    detected: false, // did we find an open shift
  });

  const refreshLatestShift = async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const url = shiftApi("/latest-open");
      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        throw new Error(
          data?.error || `Failed to load latest open shift (${res.status})`
        );
      }

      const shift = data.shift || null;

      setState({
        loading: false,
        error: null,
        shift,
        detected: Boolean(shift),
      });

      return shift;
    } catch (err) {
      console.error("[Backoffice POS] Failed to load latest shift:", err);
      setState({
        loading: false,
        error: err.message || "Failed to load latest open shift",
        shift: null,
        detected: false,
      });
      return null;
    }
  };

  // Auto load once on mount
  useEffect(() => {
    refreshLatestShift();
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      hasShift: state.detected && !!state.shift,
      shiftId: state.shift?.shift_id ?? null,
      terminalId: state.shift?.terminal_id ?? null,
      employeeId: state.shift?.employee_id ?? null,
      refreshLatestShift,
    }),
    [state]
  );

  return (
    <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>
  );
}

ShiftProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useShift() {
  const ctx = useContext(ShiftContext);
  if (!ctx) {
    throw new Error("useShift must be used inside <ShiftProvider>");
  }
  return ctx;
}

// (optional, but harmless) default export of the context itself
export default ShiftContext;
