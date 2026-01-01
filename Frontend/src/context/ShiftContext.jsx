// QUSCINA_BACKOFFICE/Frontend/src/context/ShiftContext.jsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import PropTypes from "prop-types";
import { API_BASE } from "@/utils/apiBase";
import { useAuth } from "@/context/AuthContext";

/** Helper: terminal id storage */
function getTerminalId() {
  return localStorage.getItem("terminal_id") || "TERMINAL-1";
}

/** Join API_BASE + path safely */
function join(base, path) {
  return `${String(base || "").replace(/\/+$/, "")}/${String(path || "").replace(
    /^\/+/,
    ""
  )}`;
}

/** Backoffice shift API URL builder */
const shiftApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;

  // Local dev: backend proxied under /api
  if (!base) return `/api/pos/shift${clean}`;
  if (base.endsWith("/api")) return join(base, `pos/shift${clean}`);
  return join(base, `api/pos/shift${clean}`);
};

const ShiftContext = createContext(null);

/** Generic JSON fetch with credentials + good error passthrough */
async function fetchJSON(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const isGet = method === "GET";

  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(isGet ? {} : { "Content-Type": "application/json" }),
      "X-App": "backoffice",
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

const fetchJSONAuthed = fetchJSON;

/** Persist latest shift metadata (header fallbacks) */
function persistShiftMeta(shift) {
  if (shift?.shift_id) localStorage.setItem("last_shift_id", String(shift.shift_id));
  if (shift?.shift_code) localStorage.setItem("last_shift_code", String(shift.shift_code));
  if (shift?.shift_name) localStorage.setItem("last_shift_name", String(shift.shift_name));
  if (shift?.opened_at) localStorage.setItem("last_shift_opened_at", String(shift.opened_at));
}

/** Clear shift metadata */
function clearShiftMeta() {
  localStorage.removeItem("last_shift_id");
  localStorage.removeItem("last_shift_code");
  localStorage.removeItem("last_shift_name");
  localStorage.removeItem("last_shift_opened_at");
}

export function ShiftProvider({ children }) {
  const [shiftState, setShiftState] = useState({
    isOpen: false,
    loading: false,
    data: null, // raw row from pos_shifts
    error: null,
  });

  const { ready, token, user, logout } = useAuth();

  // avoids “login warnings” during very first auto-refresh
  const initialRefreshDoneRef = useRef(false);

  /** GET current open shift for this user+terminal */
  const refreshCurrentOpen = useCallback(async () => {
    const terminalId = getTerminalId();
    setShiftState((s) => ({ ...s, loading: true, error: null }));

    try {
      const data = await fetchJSONAuthed(
        shiftApi(`/me/open?terminal_id=${encodeURIComponent(terminalId)}`),
        { method: "GET" }
      );

      const shift = data?.shift || null;

      if (shift?.shift_id) persistShiftMeta(shift);
      if (!shift) clearShiftMeta();

      setShiftState({
        isOpen: Boolean(shift && String(shift.status) === "Open"),
        loading: false,
        data: shift,
        error: null,
      });

      return shift;
    } catch (err) {
      setShiftState((s) => ({ ...s, loading: false }));

      if (err.status === 401) {
        // session/token is invalid even if qd_user exists in storage
        try {
          await logout(); // clears user/token + storage
        } catch {}

        clearShiftMeta();

        setShiftState({
          isOpen: false,
          loading: false,
          data: null,
          error: null, // don't spam errors on login page
        });

        return null;
      } else {
        setShiftState((s) => ({
          ...s,
          error: err.message || "Failed to load current shift.",
        }));
      }

      return null;
    } finally {
      initialRefreshDoneRef.current = true;
    }
  }, [token, logout]);

  /** GET summary for a shift */
  const getSummary = useCallback(async (shift_id) => {
    const id = Number(
      shift_id || shiftState?.data?.shift_id || localStorage.getItem("last_shift_id")
    );
    if (!id) throw new Error("No shift to summarize.");

    const data = await fetchJSONAuthed(shiftApi(`/${id}/summary`), { method: "GET" });
    return data;
  }, [shiftState?.data?.shift_id]);

  /** Open shift */
  const openShift = useCallback(async (payload) => {
    // block client-side if we already know it's open
    if (shiftState?.data && String(shiftState.data.status) === "Open") {
      const err = new Error("Shift already open");
      err.code = "SHIFT_ALREADY_OPEN";
      throw err;
    }

    const asObj =
      payload && typeof payload === "object"
        ? payload
        : { opening_float: Number(payload || 0) };

    const terminalId = asObj?.terminal_id ?? getTerminalId();

    const denoms = Array.isArray(asObj?.denominations) ? asObj.denominations : [];
    const sanitizedDenoms = denoms
      .map((d) => ({
        denom_value: Number(d?.denom_value),
        qty: Number.isFinite(Number(d?.qty)) ? Number(d.qty) : 0,
      }))
      .filter((d) => Number.isFinite(d.denom_value) && d.denom_value >= 0 && d.qty >= 0);

    const body = {
      terminal_id: String(terminalId),
      opening_float: Number(asObj?.opening_float ?? 0),
      denominations: sanitizedDenoms,
      note: typeof asObj?.note === "string" ? asObj.note : undefined,

      // ✅ shift template metadata (same as cashier)
      shift_code: asObj?.shift_code ? String(asObj.shift_code) : undefined,
      shift_name: asObj?.shift_name ? String(asObj.shift_name) : undefined,
      scheduled_start: asObj?.scheduled_start ? String(asObj.scheduled_start) : undefined,
      scheduled_end: asObj?.scheduled_end ? String(asObj.scheduled_end) : undefined,
      opened_early: Number(asObj?.opened_early ?? 0),
      early_minutes: Number(asObj?.early_minutes ?? 0),
      early_reason: asObj?.early_reason != null ? String(asObj.early_reason) : null,
      early_note: asObj?.early_note != null ? String(asObj.early_note) : null,
    };

    setShiftState((s) => ({ ...s, loading: true, error: null }));

    try {
      const data = await fetchJSONAuthed(shiftApi("/open"), {
        method: "POST",
        body: JSON.stringify(body),
      });

      const shift = data?.shift || null;

      if (shift?.shift_id) persistShiftMeta(shift);
      setShiftState({
        isOpen: true,
        loading: false,
        data: shift,
        error: null,
      });

      return shift;
    } catch (err) {
      setShiftState((s) => ({ ...s, loading: false, error: err.message || "Failed to open shift" }));
      throw err;
    }
  }, [shiftState?.data]);

  /** Cash drawer move */
  const cashMove = useCallback(async (args) => {
    const body = {
      shift_id: Number(args?.shift_id),
      type: String(args?.type),
      amount: Number(args?.amount),
      reason: args?.reason || undefined,
      denominations: Array.isArray(args?.denominations)
        ? args.denominations.map((d) => ({
            denom_value: Number(d?.denom_value),
            qty: Number(d?.qty) || 0,
          }))
        : [],
    };

    if (!body.shift_id || !body.type || !Number.isFinite(body.amount) || body.amount <= 0) {
      throw new Error("Invalid cash move payload");
    }

    try {
      return await fetchJSONAuthed(shiftApi("/cash-move"), {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (err) {
      // match cashier behavior: let CashModal show inline for INSUFFICIENT_CASH
      throw err;
    }
  }, []);

  /** Remit / close shift */
  const remitShift = useCallback(async ({ shift_id, declared_cash, closing_note }) => {
    const id = Number(
      shift_id || shiftState?.data?.shift_id || localStorage.getItem("last_shift_id")
    );
    if (!id) throw new Error("No shift to remit.");

    const body = {
      declared_cash: Number(declared_cash ?? 0),
      closing_note: closing_note || undefined,
    };

    const data = await fetchJSONAuthed(shiftApi(`/${id}/remit`), {
      method: "POST",
      body: JSON.stringify(body),
    });

    const shift = data?.shift || null;

    // After remit, shift is no longer open
    setShiftState({
      isOpen: false,
      loading: false,
      data: shift,
      error: null,
    });

    clearShiftMeta();
    return shift;
  }, [shiftState?.data?.shift_id]);

  /** List cash moves */
  const listCashMoves = useCallback(async (shift_id) => {
    const id = Number(
      shift_id || shiftState?.data?.shift_id || localStorage.getItem("last_shift_id")
    );
    if (!id) throw new Error("No shift to list moves for.");

    return await fetchJSONAuthed(shiftApi(`/${id}/cash-moves`), { method: "GET" });
  }, [shiftState?.data?.shift_id]);

  /** Local-only clear (compat) */
  const clearShift = useCallback(() => {
    setShiftState({ isOpen: false, loading: false, data: null, error: null });
    clearShiftMeta();
  }, []);

  // auto refresh on mount
  useEffect(() => {
    if (!ready) return;     // wait for AuthContext bootstrap
    if (!user) return;      // not logged in, don't call /me/open
    refreshCurrentOpen();
  }, [ready, user, refreshCurrentOpen]);

  const value = useMemo(
    () => ({
      shift: shiftState, // { isOpen, loading, data, error }

      isOpen: shiftState.isOpen,
      loading: shiftState.loading,
      error: shiftState.error,
      data: shiftState.data,

      hasShift: Boolean(shiftState.data),
      shiftId: shiftState.data?.shift_id ?? null,

      shiftCode:
        shiftState.data?.shift_code ??
        localStorage.getItem("last_shift_code") ??
        null,

      shiftNo:
        (shiftState.data?.shift_code
          ? String(shiftState.data.shift_code).toUpperCase().replace("SHIFT_", "S")
          : localStorage.getItem("last_shift_code")
          ? String(localStorage.getItem("last_shift_code")).toUpperCase().replace("SHIFT_", "S")
          : null),
      
      terminalId: shiftState.data?.terminal_id ?? null,
      employeeId: shiftState.data?.employee_id ?? null,

      refreshCurrentOpen,
      getSummary,
      openShift,
      cashMove,
      remitShift,
      listCashMoves,
      clearShift,
    }),
    [shiftState, refreshCurrentOpen, getSummary, openShift, cashMove, remitShift, listCashMoves, clearShift]
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

ShiftProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useShift() {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error("useShift must be used inside <ShiftProvider>");
  return ctx;
}

export default ShiftContext;