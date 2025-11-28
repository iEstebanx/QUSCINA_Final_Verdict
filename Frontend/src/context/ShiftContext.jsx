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

/** Generic JSON fetch that preserves backend error message/code/holder */
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  const isError = !res.ok || data?.ok === false;

  if (isError) {
    const msg = data?.error || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    err.code = data?.code;
    err.holder = data?.holder;
    throw err;
  }

  return data;
}

export function ShiftProvider({ children }) {
  const [state, setState] = useState({
    loading: false,
    error: null,
    shift: null, // raw row from pos_shifts
    detected: false, // did we find an open shift
  });

  const refreshLatestShift = async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const url = shiftApi("/latest-open");
      const data = await fetchJSON(url, {
        method: "GET",
      });

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

  const clearShift = () => {
    setState({
      loading: false,
      error: null,
      shift: null,
      detected: false,
    });
  };

  /**
   * Open a POS shift from Backoffice.
   * NOTE: No snackbar here – caller (e.g. FloatingShiftModal) should catch
   * the error and show its own dialog. For conflicts, backend already sends
   * a friendly message in err.message.
   */
  const openShift = async (payload) => {
    // 🚫 If we already know there is an open shift, do NOT open another
    if (
      state.shift &&
      String(state.shift.status || "").toLowerCase() === "open"
    ) {
      const err = new Error("Shift already open");
      err.code = "SHIFT_ALREADY_OPEN";
      throw err;
    }

    const asObj =
      payload && typeof payload === "object"
        ? payload
        : { opening_float: Number(payload || 0) };

    const terminalId =
      typeof asObj.terminal_id === "string" && asObj.terminal_id.trim()
        ? asObj.terminal_id.trim()
        : "TERMINAL-1";

    const denoms = Array.isArray(asObj.denominations)
      ? asObj.denominations
      : [];

    const sanitizedDenoms = denoms
      .map((d) => ({
        denom_value: Number(d?.denom_value),
        qty: Number.isFinite(Number(d?.qty)) ? Number(d.qty) : 0,
      }))
      .filter(
        (d) =>
          Number.isFinite(d.denom_value) &&
          d.denom_value >= 0 &&
          d.qty >= 0
      );

    const body = {
      terminal_id: terminalId,
      opening_float: Number(asObj.opening_float ?? 0),
      denominations: sanitizedDenoms,
      note: typeof asObj.note === "string" ? asObj.note : undefined,
    };

    setState((s) => ({ ...s, loading: true }));

    try {
      const data = await fetchJSON(shiftApi("/open"), {
        method: "POST",
        body: JSON.stringify(body),
      });

      const shift = data.shift || null;

      setState({
        loading: false,
        error: null,
        shift,
        detected: Boolean(shift),
      });

      return shift;
    } catch (err) {
      // Don’t show any snackbar/toast here – UI will show dialog using err.message
      console.error("[Backoffice POS] Failed to open shift:", err);
      setState((s) => ({
        ...s,
        loading: false,
        // keep error in state if some component wants to read it,
        // but the main UX will be controlled by the calling dialog
        error: err.message || "Failed to open shift",
      }));
      throw err;
    }
  };

  // Auto load latest shift once on mount
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
      openShift, // exposed so Backoffice POS modal can call it
      clearShift,
    }),
    [state, refreshLatestShift, openShift]
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

// optional default export
export default ShiftContext;