// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/Cart.jsx
import {
  Box,
  Typography,
  Divider,
  IconButton,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  TextField,
  InputAdornment,
  FormControl,
  Select,
  Chip,
  Paper, // ⬅️ added
} from "@mui/material";
import PersonOutline from "@mui/icons-material/PersonOutline";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Add,
  Remove,
  MoreVert,
  DeleteOutline,
  DeleteForever,
  Search as SearchIcon,
  SwapVert as SortIcon,
  RestartAlt,
} from "@mui/icons-material";
import { useEffect, useMemo, useState, useRef } from "react";
import { useTheme, alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { API_BASE } from "@/utils/apiBase";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useShift } from "@/context/ShiftContext";

// 🔹 Backoffice auth (not mobileAuth)
import { useAuth } from "@/context/AuthContext";

const PHP = (n) => `₱${Number(n).toFixed(2)}`;
const LS_REFLECTING_KEY = "currentOrderId"; // persist reflected order id
const LS_ORDER_TYPE = "orderType"; // persist dine-in / take-out
const LS_VOIDED_MAP = "posVoidedQtyMap"; // per-order void counts

function nowLabel() {
  const d = new Date();
  const hh = String(d.getHours() % 12 || 12);
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  return `${hh}:${mm} ${ampm}`;
}

/** ---- Focus helpers to avoid "Blocked aria-hidden..." warning ---- */
function blurActive() {
  const el = document.activeElement;
  if (el && typeof el.blur === "function") {
    try {
      el.blur();
    } catch {}
  }
}
function openSafely(setter) {
  blurActive();
  Promise.resolve().then(() => setter(true));
}

function MetaChip({ icon, label }) {
  return (
    <Chip
      size="small"
      icon={icon}
      label={label}
      variant="outlined"
      sx={(theme) => ({
        height: 24,
        "& .MuiChip-label": { px: 1, fontSize: 12, fontWeight: 600 },
        "& .MuiChip-icon": { fontSize: 16, mr: 0.5 },
        bgcolor: alpha(theme.palette.text.primary, 0.06),
        borderColor: alpha(theme.palette.text.primary, 0.14),
      })}
    />
  );
}

// 🔹 helper to build /api/orders URLs safely
const ordersApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;

  // Local dev: Backoffice usually proxies to /api
  if (!base) return `/api/pos/orders${clean}`;
  if (base.endsWith("/api")) return `${base}/pos/orders${clean}`;
  return `${base}/api/pos/orders${clean}`;
};

const EARLY_OPEN_WINDOW_MINUTES = 60;

const SHIFT_TEMPLATES = [
  { code: "SHIFT_1", name: "First Shift", start: "08:00", end: "15:00" },
  { code: "SHIFT_2", name: "Second Shift", start: "15:00", end: "22:00" },
];

function parseHHMMtoTodayDate(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function minutesDiff(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 60000);
}

function suggestShift(now = new Date()) {
  const windows = SHIFT_TEMPLATES.map((t) => ({
    ...t,
    startDate: parseHHMMtoTodayDate(t.start),
    endDate: parseHHMMtoTodayDate(t.end),
  }));

  const inside = windows.find((w) => now >= w.startDate && now < w.endDate);
  if (inside) return inside;

  const upcoming = windows.find((w) => now < w.startDate);
  return upcoming || windows[windows.length - 1];
}

/* --------------------- FloatingShiftModal (Backoffice) --------------------- */

const denominations = [
  { label: "₱1", value: 1 },
  { label: "₱5", value: 5 },
  { label: "₱10", value: 10 },
  { label: "₱20", value: 20 },
  { label: "₱50", value: 50 },
  { label: "₱100", value: 100 },
  { label: "₱200", value: 200 },
  { label: "₱500", value: 500 },
  { label: "₱1000", value: 1000 },
];

const MIN_OPENING_FLOAT = 1_000;   // ₱1,000
const MAX_OPENING_FLOAT = 500_000; // ₱500,000

// Predefined quantity options for dropdown
const quantityOptions = [
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
];

function FloatingShiftModal({ open, onClose, onShiftOpened, terminalId, refreshLatestShift, openShift, }) {
  const theme = useTheme();

  // ✅ Keep "now" fresh while the dialog is open (shift suggestion updates)
  const [nowTick, setNowTick] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setNowTick(new Date()); // refresh immediately on open
    const id = setInterval(() => setNowTick(new Date()), 30_000); // every 30s
    return () => clearInterval(id);
  }, [open]);

  // ✅ Suggested shift based on current time
  const suggested = useMemo(() => suggestShift(nowTick), [nowTick]);

  // (optional) keep selectedShift in sync (even though dropdown is disabled)
  const [selectedShift, setSelectedShift] = useState(() => suggestShift(new Date()));
  useEffect(() => {
    if (!open) return;
    setSelectedShift(suggested);
  }, [open, suggested]);

  const [earlyDialog, setEarlyDialog] = useState({
    open: false,
    message: "",
    earlyMinutes: 0,
  });
  const [earlyReason, setEarlyReason] = useState("");
  const [earlyNote, setEarlyNote] = useState("");
  const [pendingOpenPayload, setPendingOpenPayload] = useState(null);

  const [quantities, setQuantities] = useState({});
  const [entryMode, setEntryMode] = useState("quick");
  const [submitting, setSubmitting] = useState(false);

  const [conflict, setConflict] = useState(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  const handleDropdownChange = (denom, value) => {
    setQuantities((prev) => ({
      ...prev,
      [denom]: value,
    }));
  };

  const handleManualChange = (denom, raw) => {
    const num = Number(raw);
    setQuantities((prev) => ({
      ...prev,
      [denom]: Number.isFinite(num) && num >= 0 ? num : 0,
    }));
  };

  const calculateTotal = () =>
    denominations.reduce((total, { value }) => {
      const qty = quantities[value] || 0;
      return total + value * qty;
    }, 0);

  const handleOpenShift = async () => {
    const total = calculateTotal();

    // ✅ Block if opening float too small
    if (total < MIN_OPENING_FLOAT) {
      const formattedMin = MIN_OPENING_FLOAT.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedTotal = total.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      window.alert(
        `Opening float must be at least ₱${formattedMin}. You entered ₱${formattedTotal}.`
      );
      return;
    }

    // ✅ Block if opening float too large
    if (total > MAX_OPENING_FLOAT) {
      const formattedMax = MAX_OPENING_FLOAT.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedTotal = total.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      window.alert(
        `Opening float cannot exceed ₱${formattedMax}. You entered ₱${formattedTotal}.`
      );
      return;
    }

    const denoms = denominations.map((d) => ({
      denom_value: d.value,
      qty: Number(quantities[d.value] || 0),
    }));
    const tid = terminalId || "TERMINAL-1";

    setSubmitting(true);
    try {
      const now = new Date();

      // ✅ MUST use suggested shift (not user-selectable)
      const shiftStart = parseHHMMtoTodayDate(suggested.start);

      const earlyMinutes = Math.max(0, minutesDiff(shiftStart, now));
      const isTooEarly = earlyMinutes > EARLY_OPEN_WINDOW_MINUTES;

      const payload = {
        terminal_id: tid,
        opening_float: total,
        denominations: denoms,
        note: "",

        // ✅ lock to suggested shift
        shift_code: suggested.code,
        shift_name: suggested.name,
        scheduled_start: suggested.start,
        scheduled_end: suggested.end,

        // ✅ early open metadata
        opened_early: earlyMinutes > 0 ? 1 : 0,
        early_minutes: earlyMinutes,
        early_reason: earlyReason || null,
        early_note: earlyNote || null,
      };

      if (isTooEarly) {
        setPendingOpenPayload(payload);
        setEarlyDialog({
          open: true,
          earlyMinutes,
          message:
            `You are opening ${suggested.name} about ${earlyMinutes} minutes early.\n` +
            `This will be recorded in the shift log. Continue?`,
        });
        setSubmitting(false);
        return;
      }

      const shift = await openShift(payload);

      if (typeof refreshLatestShift === "function") {
        await refreshLatestShift();
      }

      if (typeof onShiftOpened === "function") {
        onShiftOpened(shift || null);
      }
    } catch (err) {
      console.error("[Backoffice POS] open shift failed", err);

      if (err.status === 409 || (err.code && String(err.code).startsWith("SHIFT_"))) {
        let message = err.message || "Failed to open shift.";
        let cTerminalId = tid;
        let cEmployeeName = null;
        let cEmployeeId = null;

        if (err.code === "SHIFT_HELD_BY_OTHER_TERMINAL" && err.holder) {
          cTerminalId = err.holder.terminal_id || tid || "another terminal";
          cEmployeeName =
            err.holder.employee_name ||
            err.holder.employee_username ||
            err.holder.employee_email ||
            (err.holder.employee_id ? `Employee #${err.holder.employee_id}` : "another user");
          cEmployeeId = err.holder.employee_id || null;

          message = `A shift is already open on ${cTerminalId} for ${cEmployeeName}. You can’t open another shift while that terminal’s shift is still open. Please ask them to remit/close their shift first.`;
        } else if (
          err.code === "SHIFT_ALREADY_OPEN_SAME_TERMINAL" ||
          err.code === "SHIFT_ALREADY_OPEN" ||
          err.message === "Shift already open"
        ) {
          cTerminalId = tid;
          message = `A shift is already open on ${cTerminalId}. You can’t open another shift while this terminal’s shift is still open. Please remit/close the current shift first.`;
        }

        setConflict({
          terminalId: cTerminalId,
          employeeName: cEmployeeName,
          employeeId: cEmployeeId,
          message,
        });
        setConflictOpen(true);
        setSubmitting(false);
        return;
      }

      window.alert(err.message || "Failed to open shift");
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = calculateTotal();
  const coins = denominations.filter((d) => d.value <= 20);
  const bills = denominations.filter((d) => d.value > 20);

  const sidebarContrast =
    theme.palette.secondary.contrastText ??
    theme.palette.getContrastText(theme.palette.secondary.main);

  const renderInputField = (denom) => {
    const { label, value } = denom;
    const currentValue = quantities[value];
    const numericValue =
      typeof currentValue === "number" && Number.isFinite(currentValue)
        ? currentValue
        : 0;

    if (entryMode === "manual") {
      return (
        <TextField
          key={value}
          fullWidth
          label={label}
          sx={{ minWidth: 140 }}
          type="number"
          size="small"
          variant="outlined"
          value={numericValue}
          onChange={(e) => handleManualChange(value, e.target.value)}
          inputProps={{ min: 0 }}
        />
      );
    }

    const hasPreset = quantityOptions.some((opt) => opt.value === numericValue);

    const options =
      !hasPreset && numericValue !== 0
        ? [{ value: numericValue, label: `Custom (${numericValue})` }, ...quantityOptions]
        : quantityOptions;

    return (
      <TextField
        key={value}
        select
        fullWidth
        label={label}
        sx={{ minWidth: 140 }}
        value={numericValue}
        onChange={(e) => handleDropdownChange(value, Number(e.target.value))}
        size="small"
        variant="outlined"
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          width: "95%",
          maxWidth: 600,
          mx: "auto",
        },
      }}
    >
      <DialogTitle
        sx={{
          bgcolor: theme.palette.secondary.main,
          color: sidebarContrast,
          py: 2,
        }}
      >
        Open Shift
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          bgcolor: theme.palette.background.paper,
          px: 3,
          py: 3,
        }}
      >
        <Typography
          sx={{
            color: theme.palette.text.primary,
            mb: 2,
            fontSize: "1rem",
            textAlign: "center",
          }}
        >
          Select quantity for each denomination using presets or enter manually.
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Paper
            variant="outlined"
            sx={{
              px: 1.5,
              py: 1.1,
              borderRadius: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              bgcolor: alpha(theme.palette.text.primary, 0.03),
              borderColor: alpha(theme.palette.text.primary, 0.12),
            }}
          >
            {/* Shift name + time inline */}
            <Box
              sx={{
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {suggested.name}
              </Typography>

              <Typography
                variant="body2"
                sx={{
                  opacity: 0.75,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                ({suggested.start}–{suggested.end})
              </Typography>
            </Box>

            <Chip
              size="small"
              label="Auto"
              variant="outlined"
              sx={{
                fontWeight: 700,
                bgcolor: alpha(theme.palette.success.main, 0.12),
                borderColor: alpha(theme.palette.success.main, 0.35),
              }}
            />
          </Paper>

          <Typography sx={{ mt: 0.75, fontSize: 12, opacity: 0.8 }}>
            Based on current time.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <ToggleButtonGroup
            color="primary"
            size="small"
            exclusive
            value={entryMode}
            onChange={(_e, mode) => {
              if (mode) setEntryMode(mode);
            }}
          >
            <ToggleButton value="quick">Quick Select</ToggleButton>
            <ToggleButton value="manual">Manual Entry</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box
          sx={{
            mt: 1,
            width: "100%",
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              bgcolor: theme.palette.background.default,
              borderRadius: 2,
            }}
          >
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
              Coins
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1.5} flexGrow={1}>
              {coins.map((denom) => renderInputField(denom))}
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              bgcolor: theme.palette.background.default,
              borderRadius: 2,
            }}
          >
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
              Bills
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1.5} flexGrow={1}>
              {bills.map((denom) => renderInputField(denom))}
            </Stack>
          </Paper>
        </Box>

        <Box mt={3} textAlign="center">
          <Typography fontWeight="bold" sx={{ fontSize: "1.1rem" }}>
            Total{" "}
            <Box
              component="span"
              sx={{ color: theme.palette.success.main, fontSize: "1.5rem" }}
            >
              ₱{totalAmount.toFixed(2)}
            </Box>
          </Typography>

          {totalAmount < MIN_OPENING_FLOAT && (
            <Typography sx={{ mt: 1, fontSize: "0.9rem", color: theme.palette.error.main }}>
              Minimum opening float is ₱
              {MIN_OPENING_FLOAT.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Typography>
          )}

          {totalAmount > MAX_OPENING_FLOAT && (
            <Typography sx={{ mt: 0.5, fontSize: "0.9rem", color: theme.palette.error.main }}>
              Maximum opening float is ₱
              {MAX_OPENING_FLOAT.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          bgcolor: theme.palette.background.paper,
          p: 2,
          gap: 2,
        }}
      >
        <Button onClick={onClose} sx={{ color: theme.palette.text.primary }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleOpenShift}
          color="primary"
          disabled={submitting || totalAmount < MIN_OPENING_FLOAT || totalAmount > MAX_OPENING_FLOAT}
        >
          {submitting ? "Opening…" : "Open Shift"}
        </Button>
      </DialogActions>

      {/* 🔴 Conflict dialog */}
      <Dialog
        open={conflictOpen}
        onClose={() => setConflictOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Cannot Open Shift</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {conflict?.message ||
              "A shift is already open. You can’t open another shift until the current one is remitted/closed."}
          </Typography>

          {conflict?.terminalId && (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Terminal: <strong>{conflict.terminalId}</strong>
              {conflict?.employeeName && (
                <>
                  {" "}
                  · Current holder: <strong>{conflict.employeeName}</strong>
                  {conflict.employeeId ? ` (ID: ${conflict.employeeId})` : ""}
                </>
              )}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictOpen(false)} variant="contained">
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* 🟠 Early open dialog */}
      <Dialog
        open={earlyDialog.open}
        onClose={() => {
          setEarlyDialog({ open: false, message: "", earlyMinutes: 0 });
          setPendingOpenPayload(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Open Shift Early?</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ whiteSpace: "pre-line" }}>{earlyDialog.message}</Typography>

          
          {/* <TextField
            select
            fullWidth
            size="small"
            label="Reason (optional)"
            value={earlyReason}
            onChange={(e) => setEarlyReason(e.target.value)}
            sx={{ mt: 2 }}
          >
            <MenuItem value="">None</MenuItem>
            <MenuItem value="prep">Prep / setup</MenuItem>
            <MenuItem value="early_customers">Early customers</MenuItem>
            <MenuItem value="staffing">Staffing / schedule</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </TextField> */}

          <TextField
            fullWidth
            size="small"
            label="Note (optional)"
            value={earlyNote}
            onChange={(e) => setEarlyNote(e.target.value)}
            sx={{ mt: 2 }}
            inputProps={{ maxLength: 255 }}
          />
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => {
              setEarlyDialog({ open: false, message: "", earlyMinutes: 0 });
              setPendingOpenPayload(null);
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={async () => {
              if (!pendingOpenPayload) return;
              setSubmitting(true);
              try {
                const payload = {
                  ...pendingOpenPayload,
                  early_reason: earlyReason || null,
                  early_note: earlyNote || null,
                };
                await openShift(payload);

                setEarlyDialog({ open: false, message: "", earlyMinutes: 0 });
                setPendingOpenPayload(null);

                if (typeof refreshLatestShift === "function") {
                  await refreshLatestShift();
                }
                if (typeof onShiftOpened === "function") {
                  onShiftOpened(null);
                }
              } catch (err) {
                console.error("[Backoffice POS] open shift failed", err);
                window.alert(err?.message || "Failed to open shift");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

/* ----------------------------- Main Cart component ----------------------------- */

export default function Cart() {
  const navigate = useNavigate();
  const {
    items,
    addItem,
    incrementItem,
    decrementItem,
    clearCart,
    removeItem,

    // discounts
    discounts,
    removeDiscount,
    clearDiscounts,
    applyDiscount,
    activeDiscount,

    itemDiscounts,
    setItemDiscount,
    clearItemDiscounts,
    itemDiscountAmount,

    // totals + view
    subtotal,
    discountAmount,
    viewMode,
  } = useCart();

  useEffect(() => {
    clearDiscounts();
    clearItemDiscounts();
  }, []);

// 🔹 Backoffice auth
const { user } = useAuth();

// For Backoffice POS we'll just use a static terminal + dummy shift for now.
const { shiftId, hasShift, refreshLatestShift, openShift } = useShift();
const terminalId = "TERMINAL-1";

  const employeeId = useMemo(
    () =>
      (user && (user.sub || user.employeeId)) ||
      localStorage.getItem("employee_id") ||
      null,
    [user]
  );

  // 🔹 NEW: track Open Shift modal + "what to do after opening"
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const nextActionRef = useRef(null);

  const [emptyClearOpen, setEmptyClearOpen] = useState(false);

  const [orderType, setOrderType] = useState(() => {
    try {
      return localStorage.getItem(LS_ORDER_TYPE) || "Dine-in";
    } catch {
      return "Dine-in";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_ORDER_TYPE, orderType);
    } catch {}
  }, [orderType]);

  const [currentOrderId, setCurrentOrderId] = useState(null);

  const setReflecting = (id) => {
    if (id) {
      const strId = String(id);
      setCurrentOrderId(strId);
      localStorage.setItem(LS_REFLECTING_KEY, strId);
    } else {
      setCurrentOrderId(null);
      localStorage.removeItem(LS_REFLECTING_KEY);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem(LS_REFLECTING_KEY);
    if (saved) setCurrentOrderId(saved);
  }, []);

  const [openOrders, setOpenOrders] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("openOrders")) ?? [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem("openOrders", JSON.stringify(openOrders));
  }, [openOrders]);

  const [lockedBaseQty, setLockedBaseQty] = useState({});

  // must be before isModified
  const isReflectingExisting = Boolean(currentOrderId);

  useEffect(() => {
    if (!isReflectingExisting) return;

    if (items.length === 0 && discounts.length === 0) {
      setReflecting(null);
      setLockedBaseQty({});
    }
  }, [isReflectingExisting, items.length, discounts.length]);

  // 🔍 Determine if cart is different from the saved ticket
  const isModified = useMemo(() => {
    if (!isReflectingExisting) return false;

    const original = openOrders.find((o) => o.id === currentOrderId);
    if (!original) return false;

    const baseMap = new Map();
    (original.items || []).forEach((it) => {
      const qty = it.qty ?? 1;
      baseMap.set(String(it.id), qty);
    });

    const liveMap = new Map();
    (items || []).forEach((it) => {
      const qty = it.quantity ?? 1;
      liveMap.set(String(it.id), qty);
    });

    if (baseMap.size !== liveMap.size) return true;

    for (const [id, liveQty] of liveMap.entries()) {
      const baseQty = baseMap.get(id);
      if (baseQty == null) return true;
      if (liveQty !== baseQty) return true;
    }

    // --- per-item discounts signature check ---
    const normItemDisc = (arr) =>
      (arr || [])
        .map((it) => {
          const pct = Number(it.discountPercent ?? it.discount_percent ?? 0) || 0;
          const nm = String(it.discountName ?? it.discount_name ?? "");
          return `${String(it.id)}:${nm}:${pct}`;
        })
        .sort()
        .join("|");

    const baseItemDiscSig = normItemDisc(original.items || []);

    const liveItemDiscSig = (items || [])
      .map((it) => {
        const disc = itemDiscounts[String(it.id)];
        const pct = Number(disc?.percent) || 0;
        const nm = String(disc?.name || "");
        return `${String(it.id)}:${nm}:${pct}`;
      })
      .sort()
      .join("|");

    if (baseItemDiscSig !== liveItemDiscSig) return true;

    const norm = (arr) =>
      (arr || [])
        .map((d) => `${d.name ?? ""}:${Number(d.percent) || 0}`)
        .join("|");

    const baseDiscountSig = norm(original.discounts);
    const liveDiscountSig = norm(discounts);

    if (baseDiscountSig !== liveDiscountSig) return true;

    return false;
  }, [isReflectingExisting, currentOrderId, openOrders, items, discounts, itemDiscounts]);

  const t = useTheme();

  // Cart uses same light paper background as the rest of the app
  const sidebarBg = t.palette.background.paper;
  const sidebarContrast = t.palette.text.primary;
  const sidebarBorder = alpha(t.palette.grey[800], 0.14);
  const softAccent = alpha(t.palette.grey[800], 0.06);
  const softAccentStrong = alpha(t.palette.grey[800], 0.12);

  const handleQtyChange = (id, delta) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const qty = item.quantity ?? 1;
    const baseQty = lockedBaseQty[id] || 0;

    // 🔼 Increase → always local
    if (delta > 0) {
      incrementItem(id);
      return;
    }

    // 🔽 Decrease
    if (delta < 0) {
      // If reflecting an existing ticket:
      //  - baseQty > 0 → the "base" part is locked
      //  - only quantity ABOVE baseQty can be trimmed here
      if (isReflectingExisting && baseQty > 0) {
        if (qty > baseQty) {
          // Just trimming extra items added after reflection
          decrementItem(id);
        }
        // qty <= baseQty is locked → do nothing here
        // use the dedicated "Void item" button instead
        return;
      }

      // 🔹 Non-reflected cart (new order) → standard behavior
      const nextQty = qty - 1;

      if (nextQty <= 0 && baseQty === 0) {
        if (typeof removeItem === "function") {
          removeItem(id);
        } else {
          decrementItem(id);
        }
      } else {
        decrementItem(id);
      }
    }
  };

  const handleVoidItemClick = (item) => {
    if (!item) return;

    const baseQty = lockedBaseQty[item.id] || 0;
    const qty = item.quantity ?? 1;

    // Only allow per-item void when:
    if (!isReflectingExisting || baseQty <= 0 || qty <= 0) return;

    const maxQty = Math.min(baseQty, qty); // can't void more than base or current qty

    setVoidContext({
      itemId: item.id,
      itemName: item.name,
      unitPrice: item.price || 0,
      maxQty,
    });
    setVoidQty(1);
    setVoidReason("");
    setPendingVoidItem(null); // will be set when user clicks Continue
    openSafely(setVoidItemDialogOpen);
  };

  const total = Math.max(0, subtotal - discountAmount - itemDiscountAmount);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDigits, setPinDigits] = useState(Array(6).fill(""));
  const [pinError, setPinError] = useState("");
  const [isPinChecking, setIsPinChecking] = useState(false);
  const pinRefs = useRef([]);
  const [pinVisible, setPinVisible] = useState(false);

  // 🔹 When voiding a single item from a reflected ticket
  const [pendingVoidItem, setPendingVoidItem] = useState(null);

  // Void dialog (quantity + reason)
  const [voidItemDialogOpen, setVoidItemDialogOpen] = useState(false);
  const [voidContext, setVoidContext] = useState(null); // { itemId, itemName, maxQty, unitPrice }
  const [voidQty, setVoidQty] = useState(1);
  const [voidReason, setVoidReason] = useState("");

  // Success dialog after void
  const [voidSuccessOpen, setVoidSuccessOpen] = useState(false);

  // Track how many were voided (for "1 voided" red label)
  const [voidedQtyMap, setVoidedQtyMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_VOIDED_MAP)) ?? {};
    } catch {
      return {};
    }
  });

  // keep it in localStorage so it survives refresh
  useEffect(() => {
    try {
      localStorage.setItem(LS_VOIDED_MAP, JSON.stringify(voidedQtyMap));
    } catch {}
  }, [voidedQtyMap]);

  // --- Load available discount types (same as MenuPage) --------------------
  const [discountChoices, setDiscountChoices] = useState([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [discountLoadError, setDiscountLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingDiscounts(true);
      setDiscountLoadError(null);
      try {
        const base = API_BASE || "";
        const url = base
          ? base.endsWith("/api")
            ? `${base}/discounts`
            : `${base}/api/discounts`
          : "/api/discounts";

        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          throw new Error(`Failed to load discounts (${res.status})`);
        }

        const data = await res.json();

        const options = (data || [])
          .filter((d) => Number(d.isActive) === 1)
          .filter((d) => d.type === "percent" && (d.scope === "order" || d.scope === "item"))
          .map((d) => ({
            id: d.id,
            code: d.code,
            name: d.name,
            percent: Number(d.value),
            scope: d.scope,
          }));

        if (!cancelled) setDiscountChoices(options);
      } catch (e) {
        if (!cancelled)
          setDiscountLoadError(e.message || "Failed to load discounts");
      } finally {
        if (!cancelled) setLoadingDiscounts(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Discount dialog state / logic --------------------------------------
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);
  const hasEditing = useMemo(
    () =>
      editingIndex > -1 &&
      editingIndex < discounts.length &&
      discounts[editingIndex],
    [editingIndex, discounts]
  );

  const [selectedDiscountKey, setSelectedDiscountKey] = useState("");

  useEffect(() => {
    if (!hasEditing || !activeDiscount) {
      setSelectedDiscountKey("");
      return;
    }

    const hit = discountChoices.find(
      (opt) =>
        opt.name === activeDiscount.name &&
        Number(opt.percent) === Number(activeDiscount.percent)
    );

    if (hit) {
      setSelectedDiscountKey(hit.code || String(hit.id));
    } else {
      setSelectedDiscountKey("");
    }
  }, [hasEditing, activeDiscount, discountChoices]);

  const handleChangeDiscountType = (event) => {
    setSelectedDiscountKey(event.target.value);
  };

  const applySelectedDiscountType = () => {
    if (!selectedDiscountKey) {
      setDlgOpen(false);
      return;
    }

    const opt = discountChoices.find(
      (opt) => (opt.code || String(opt.id)) === selectedDiscountKey
    );

    if (!opt) {
      setDlgOpen(false);
      return;
    }

    applyDiscount(opt.name, opt.percent);
    setDlgOpen(false);
  };

  const selectedOption =
    discountChoices.find(
      (opt) => (opt.code || String(opt.id)) === selectedDiscountKey
    ) || null;

  const currentPercent = hasEditing
    ? Number(
        selectedOption?.percent ?? discounts[editingIndex]?.percent ?? 0
      )
    : 0;

  const previewAmount = (subtotal * Math.max(0, currentPercent)) / 100;

  // --- Simple "picker" dialog opened from summary label --------------------
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState("");

  const [pickerTarget, setPickerTarget] = useState({ type: "order", itemId: null }); 

  // 🔹 Filter discounts by picker target (order vs item)
  const pickerOptions = useMemo(() => {
    const itemScoped = discountChoices.filter((d) => d.scope === "item");
    const orderScoped = discountChoices.filter((d) => d.scope === "order");

    if (pickerTarget.type === "item") {
      // ✅ If DB has no item discounts, still show order discounts as fallback
      return itemScoped.length ? itemScoped : orderScoped;
    }

    // order picker
    return orderScoped;
  }, [pickerTarget.type, pickerTarget.itemId, discountChoices]);

  const openDiscountPicker = () => {
    if (!discountChoices.length || discountLoadError) return;

    setPickerTarget({ type: "order", itemId: null });

    const hit = activeDiscount
      ? discountChoices.find(
          (opt) =>
            opt.scope === "order" &&
            opt.name === activeDiscount.name &&
            Number(opt.percent) === Number(activeDiscount.percent)
        )
      : null;

    setPickerKey(hit ? hit.code || String(hit.id) : "");
    openSafely(setPickerOpen);
  };

  const openItemDiscountPicker = (itemId) => {
    if (!discountChoices.length || discountLoadError) return;

    setPickerTarget({ type: "item", itemId: String(itemId) });

    const existing = itemDiscounts[String(itemId)];
    const hit = existing
      ? discountChoices.find(
          (opt) =>
            opt.scope === "item" &&
            opt.name === existing.name &&
            Number(opt.percent) === Number(existing.percent)
        )
      : null;

    setPickerKey(hit ? hit.code || String(hit.id) : "");
    openSafely(setPickerOpen);
  };

  const closeDiscountPicker = () => setPickerOpen(false);

  const applyPickedDiscount = () => {
    // allow clearing by selecting "None"
    if (!pickerKey) {
      if (pickerTarget.type === "item" && pickerTarget.itemId) {
        setItemDiscount(pickerTarget.itemId, null);
      } else {
        clearDiscounts();
      }
      setPickerOpen(false);
      return;
    }

    const opt = discountChoices.find(
      (opt) => (opt.code || String(opt.id)) === pickerKey
    );
    if (!opt) {
      setPickerOpen(false);
      return;
    }

    if (pickerTarget.type === "item" && pickerTarget.itemId) {
      // item-scope only
      setItemDiscount(pickerTarget.itemId, opt);
    } else {
      // order-scope only
      applyDiscount(opt.name, opt.percent);
    }

    setPickerOpen(false);
  };

  const openDiscountDialog = (index) => {
    setEditingIndex(index);
    openSafely(setDlgOpen);
  };
  const removeCurrent = () => {
    const idx = editingIndex;
    setDlgOpen(false);
    setEditingIndex(-1);
    if (idx > -1) removeDiscount(idx);
  };

  // --- Menu / clear / void -------------------------------------------------
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const openMenu = (e) => setMenuAnchor(e.currentTarget);
  const closeMenu = () => setMenuAnchor(null);

  const onClickClearOrVoid = () => {
    closeMenu();

    // Only for NEW carts (menu is hidden for reflected orders)
    const nothingToClear = items.length === 0 && discounts.length === 0;

    if (nothingToClear) {
      openSafely(setEmptyClearOpen);
      return;
    }

    openSafely(setConfirmOpen);
  };

  const cancelConfirm = () => setConfirmOpen(false);

  const [newOrderConfirmOpen, setNewOrderConfirmOpen] = useState(false);
  const onClickNewOrder = () => {
    openSafely(setNewOrderConfirmOpen);
  };
  const cancelNewOrder = () => setNewOrderConfirmOpen(false);
  const confirmNewOrder = () => {
    clearDiscounts();
    clearItemDiscounts();
    clearCart();
    setReflecting(null);
    setLockedBaseQty({});
    setNewOrderConfirmOpen(false);
  };

  // 🔹 async void (call backend) or clear
  const confirmAction = async () => {
    setDlgOpen(false);
    setEditingIndex(-1);

    // Only clears local cart; no more order-level voids
    clearDiscounts();
    clearItemDiscounts();
    clearCart();
    setReflecting(null);
    setLockedBaseQty({});
    setConfirmOpen(false);
  };

  const confirmTitle = "Clear Order";
  const confirmBody = "Remove all items and discounts from the cart?";

  // --- Pending order dialog -----------------------------------------------
  const [pendingOpen, setPendingOpen] = useState(false);
  const [custName, setCustName] = useState("");
  const [tableNo, setTableNo] = useState("");

  const [nameTouched, setNameTouched] = useState(false);
  const [tableTouched, setTableTouched] = useState(false);

  const openPendingDialog = () => {
    setCustName("");
    setTableNo("");
    openSafely(setPendingOpen);
  };

  const closePendingDialog = () => {
    setPendingOpen(false);
    setNameTouched(false);
    setTableTouched(false);
  };

  const nameError = (() => {
    const nm = custName.trim();
    if (!nm) return "Customer name is required";
    if (nm.length < 3) return "Minimum 3 characters";
    if (/\d/.test(nm)) return "Digits are not allowed";
    return "";
  })();

  const tableError = (() => {
    const tb = tableNo.trim();
    if (!tb) return "Table number is required";
    if (!/^[0-9]+$/.test(tb)) return "Digits only (no spaces / letters)";

    const hasPendingSameTable = openOrders.some(
      (o) =>
        (o?.status ?? "pending") === "pending" &&
        String(o.table || "") === tb
    );

    if (hasPendingSameTable) {
      return "This table already has a pending order";
    }

    return "";
  })();

  const canSavePending = items.length > 0 && !nameError && !tableError;

  // 🔹 backend-connected Pending save
  const savePendingOrder = async () => {
    const name = custName.trim();
    const table = tableNo.trim();

    if (!canSavePending) return;

    if (!shiftId) {
      window.alert("No open shift. Please open a shift before saving orders.");
      return;
    }

    const payload = {
      shiftId,
      terminalId,
      employeeId,
      orderType,
      customerName: name,
      tableNo: table,
      items: items.map((i) => {
        const qty = Number(i.quantity ?? 1) || 1;
        const price = Number(i.price || 0) || 0;
        const disc = itemDiscounts[String(i.id)];
        const pct = Number(disc?.percent) || 0;
        const discAmt = (price * qty * pct) / 100;

        return {
          id: i.id,
          name: i.name,
          price,
          qty,
          discountName: disc?.name || null,
          discountPercent: pct || 0,
          discountAmount: discAmt || 0,
        };
      }),
      discounts: discounts.map((d) => ({
        name: d.name,
        percent: Number(d.percent) || 0,
      })),
    };

    let orderId = null;
    let netAmount = 0;
    let data = {};

    try {
      const res = await fetch(ordersApi("/pending"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Failed to save pending (${res.status})`);
      }

      orderId = String(data.orderId || data.summary?.id);
      netAmount =
        Number(data.summary?.amount) ||
        payload.items.reduce(
          (s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1),
          0
        ) *
          (1 -
            payload.discounts.reduce(
              (pct, d) => pct + (Number(d.percent) || 0),
              0
            ) /
              100);

      // ✅ KOT PRINT GOES HERE
      if (orderId) {
        try {
          window.open(
            `/pos/print/kitchen/${encodeURIComponent(orderId)}`,
            "_blank",
            "noopener,noreferrer"
          );
        } catch (e) {
          console.warn("Failed to open KOT print window:", e);
        }
      }
    } catch (err) {
      console.error("[Cart] savePendingOrder failed", err);
      window.alert(err.message || "Failed to save pending order");
      return;
    }

    const order = {
      id: orderId,
      orderNo: data?.summary?.orderNo ?? data?.summary?.order_no ?? null,
      status: "pending",
      source: "Backoffice POS",
      employee: employeeId,
      time: new Date().toISOString(),
      customer: name,
      table: table,
      items: payload.items,
      discounts: payload.discounts,
      amount: netAmount,
    };

    setOpenOrders((prev) => [order, ...prev]);

    clearDiscounts();
    clearItemDiscounts();
    clearCart();
    setReflecting(null);
    setLockedBaseQty({});
    setPendingOpen(false);
  };

  const saveUpdatedTicket = async () => {
    if (!currentOrderId) return;

    if (!shiftId) {
      window.alert("No open shift. Please open a shift before saving orders.");
      return;
    }

    const baseOrder =
      openOrders.find((o) => o.id === currentOrderId) || {};

    const payload = {
      shiftId,
      terminalId,
      employeeId,
      orderType,
      customerName: baseOrder.customer || "Walk-in",
      tableNo: baseOrder.table || null,
      items: items.map((i) => {
        const qty = Number(i.quantity ?? 1) || 1;
        const price = Number(i.price || 0) || 0;
        const disc = itemDiscounts[String(i.id)];
        const pct = Number(disc?.percent) || 0;
        const discAmt = (price * qty * pct) / 100;

        return {
          id: i.id,
          name: i.name,
          price,
          qty,
          discountName: disc?.name || null,
          discountPercent: pct || 0,
          discountAmount: discAmt || 0,
        };
      }),
      discounts: discounts.map((d) => ({
        name: d.name,
        percent: Number(d.percent) || 0,
      })),
    };

    let updatedSummary = null;

    try {
      const url = ordersApi(`/${encodeURIComponent(currentOrderId)}/pending`);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(
          data.error || `Failed to update pending order (${res.status})`
        );
      }

      updatedSummary = data.summary || null;
    } catch (err) {
      console.error("[Cart] saveUpdatedTicket failed", err);
      window.alert(err.message || "Failed to save updated ticket");
      return;
    }

    // ✅ Update local snapshot to match backend
    const updated = {
      id: currentOrderId,
      orderNo: updatedSummary?.orderNo ?? updatedSummary?.order_no ?? baseOrder.orderNo ?? null,
      status: "pending",
      source: "Backoffice POS",
      employee: employeeId,
      time: new Date().toISOString(),
      customer: payload.customerName,
      table: payload.tableNo,
      items: payload.items.map((it) => ({
        ...it,
        image: (baseOrder.items || []).find((b) => b.id === it.id)?.image,
      })),
      discounts: payload.discounts.map((d) => ({ ...d })),
      amount:
        updatedSummary?.amount ??
        Math.max(
          0,
          payload.items.reduce(
            (s, it) =>
              s + (Number(it.price) || 0) * (Number(it.qty) || 1),
            0
          ) *
            (1 -
              payload.discounts.reduce(
                (pct, d) => pct + (Number(d.percent) || 0),
                0
              ) /
                100)
        ),
    };

    setOpenOrders((prev) =>
      prev.map((o) => (o.id === currentOrderId ? updated : o))
    );

    const base = {};
    updated.items.forEach((it) => {
      base[it.id] = it.qty;
    });
    setLockedBaseQty(base);
  };

  // --- Open Orders list / summary -----------------------------------------
  const [openOrdersDlg, setOpenOrdersDlg] = useState(false);
  const [sortKey, setSortKey] = useState("time");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [summaryOrder, setSummaryOrder] = useState(null);

  const filteredOrders = useMemo(() => {
    const active = openOrders.filter(
      (o) => (o?.status ?? "pending") !== "voided"
    );
    const bySearch = active.filter((o) => {
      const blob = `${o.customer} ${o.table} ${PHP(
        o.amount
      )} ${o.employee}`.toLowerCase();
      return blob.includes(search.toLowerCase());
    });
    const cmp = (a, b) => {
      let va, vb;
      switch (sortKey) {
        case "name":
          va = a.customer?.toLowerCase() || "";
          vb = b.customer?.toLowerCase() || "";
          break;
        case "table":
          va = String(a.table || "");
          vb = String(b.table || "");
          break;
        case "amount":
          va = a.amount || 0;
          vb = b.amount || 0;
          break;
        case "employee":
          va = a.employee || "";
          vb = b.employee || "";
          break;
        case "time":
        default:
          va = new Date(a.time).getTime();
          vb = new Date(b.time).getTime();
          break;
      }
      const res = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? res : -res;
    };
    return [...bySearch].sort(cmp);
  }, [openOrders, search, sortKey, sortDir]);

  const openSummary = (order) => {
    // close the list dialog first so nothing can change selection behind
    setOpenOrdersDlg(false);

    // detach reference so future openOrders updates won't affect this object
    const safe = typeof structuredClone === "function"
      ? structuredClone(order)
      : JSON.parse(JSON.stringify(order));

    setSummaryOrder(safe);
    blurActive();
  };
  const closeSummary = () => setSummaryOrder(null);

  const restoreToCart = (order) => {
    if (!order) return;

    const idStr = String(order.id);

    // Guard: if you're already reflecting this exact order, do nothing
    if (currentOrderId && String(currentOrderId) === idStr) {
      setSummaryOrder(null);
      return;
    }

    // Always start clean
    clearCart();
    clearDiscounts();
    clearItemDiscounts();

    // Aggregate by item id (in case backend returns duplicates rows)
    const agg = new Map();
    (order.items || []).forEach((it) => {
      const key = String(it.id);
      const qty = Number(it.qty ?? it.quantity ?? 1) || 0;
      if (qty <= 0) return;

      const prev = agg.get(key);
      if (!prev) {
        agg.set(key, {
          id: it.id,
          name: it.name,
          price: it.price,
          image: it.image,
          qty,
        });
      } else {
        prev.qty += qty;
      }
    });

    // Restore once per item (using qty loop)
    agg.forEach((it) => {
      for (let k = 0; k < it.qty; k++) {
        addItem({
          id: it.id,
          name: it.name,
          price: it.price,
          image: it.image,
        });
      }
    });

    // Restore discounts
    if (Array.isArray(order.discounts)) {
      order.discounts.forEach((d) =>
        applyDiscount(d.name ?? "Discount", d.percent ?? 0)
      );
    }

    // Restore per-item discounts (if present on order.items)
    clearItemDiscounts();
    (order.items || []).forEach((it) => {
      const pct = Number(it.discountPercent ?? it.discount_percent ?? 0) || 0;
      const name = it.discountName ?? it.discount_name ?? null;
      if (pct > 0 && name) {
        setItemDiscount(String(it.id), { name, percent: pct, scope: "item" });
      }
    });

    // ✅ Lock base quantities based on aggregated totals
    const base = {};
    agg.forEach((it) => {
      base[it.id] = it.qty;
    });

    setLockedBaseQty(base);
    setReflecting(idStr);
    setSummaryOrder(null);
  };

  console.log("Current shiftId:", shiftId);

  // 🔹 Load open/pending orders from backend once we have a shift
  useEffect(() => {
    if (!shiftId) return;

    const load = async () => {
      try {
        const url = ordersApi(`/open?shiftId=${shiftId}`);
        const res = await fetch(url, { credentials: "include" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.ok === false) {
          throw new Error(
            data.error || `Failed to load open orders (${res.status})`
          );
        }

        const mapped = (data.orders || []).map((o) => ({
          id: String(o.id),
          status: o.status,
          orderNo: o.orderNo ?? o.order_no ?? null,
          source: o.source || "Backoffice POS",
          employee: o.employee,
          time: o.time,
          customer: o.customer,
          table: o.table,
          amount: o.amount,
          items: o.items || [],
          discounts: o.discounts || [],
        }));

        setOpenOrders(mapped);
      } catch (err) {
        console.error("[Cart] failed to load open orders", err);
      }
    };

    load();
  }, [shiftId]);

  // --- Save (update ticket) confirm dialog -------------------------------
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  const originalOrder = useMemo(() => {
    if (!isReflectingExisting || !currentOrderId) return null;
    return openOrders.find((o) => o.id === currentOrderId) || null;
  }, [isReflectingExisting, currentOrderId, openOrders]);

  const updatedOrder = useMemo(() => {
    if (!isReflectingExisting || !currentOrderId) return null;
    const base = openOrders.find((o) => o.id === currentOrderId);
    if (!base) return null;

    const updatedItems = (items || []).map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      qty: i.quantity ?? 1,
      image: i.image,
    }));

    const updatedDiscounts = (discounts || []).map((d) => ({ ...d }));

    const ss = updatedItems.reduce(
      (s, it) => s + (it.price || 0) * (it.qty ?? 1),
      0
    );
    const tp = updatedDiscounts.reduce(
      (a, d) => a + (Number(d.percent) || 0),
      0
    );
    const amount = Math.max(0, ss - (ss * tp) / 100);

    return {
      ...base,
      items: updatedItems,
      discounts: updatedDiscounts,
      amount,
    };
  }, [isReflectingExisting, currentOrderId, openOrders, items, discounts, itemDiscounts]);

  const handleConfirmSaveUpdated = () => {
    saveUpdatedTicket();

    if (!currentOrderId) return;

    clearCart();
    clearDiscounts();
    clearItemDiscounts();
    setReflecting(null);
    setLockedBaseQty({});
    setSaveConfirmOpen(false);
  };

  // --- Footer controls -----------------------------------------------------
  let primaryLabel;
  let primaryIsOpenOrders;

  if (isReflectingExisting) {
    if (isModified) {
      primaryLabel = "Save";
      primaryIsOpenOrders = false;
    } else {
      primaryLabel = "Open Orders";
      primaryIsOpenOrders = true;
    }
  } else {
    primaryIsOpenOrders = items.length === 0;
    primaryLabel = primaryIsOpenOrders ? "Open Orders" : "Pending";
  }

  // 🔹 Core primary button logic (requires an open shift)
  const runPrimaryLogic = () => {
    if (isReflectingExisting && isModified) {
      return openSafely(setSaveConfirmOpen);
    }

    if (isReflectingExisting && !isModified) {
      return openSafely(setOpenOrdersDlg);
    }

    if (items.length === 0) return openSafely(setOpenOrdersDlg);
    return openPendingDialog();
  };

  // 🔹 Wrapper that ensures a shift is open (Behavior A)
  const onPrimaryClick = () => {
    if (!shiftId) {
      // Remember what user tried to do and open the shift dialog
      nextActionRef.current = () => {
        runPrimaryLogic();
      };
      openSafely(() => setShiftDialogOpen(true));
      return;
    }
    runPrimaryLogic();
  };

  const currentOrder = useMemo(
    () =>
      currentOrderId
        ? openOrders.find((o) => o.id === currentOrderId) || null
        : null,
    [currentOrderId, openOrders]
  );

  const goCharge = () =>
    navigate("/pos/charge", {
      state: {
        orderType,
        orderId: currentOrderId || null,
        customerName: currentOrder?.customer || "",
        tableNo: currentOrder?.table || "",
      },
    });

  const sortLabels = {
    time: "Time",
    table: "Table #",
    amount: "Amount",
    employee: "Employee",
    name: "Name",
  };

  const menuActionLabel = isReflectingExisting ? "Void Order" : "Clear Order";
  const MenuIcon = isReflectingExisting ? DeleteForever : DeleteOutline;

  const firstDiscount = discounts[0];
  const discountSuffix = firstDiscount
    ? `(${firstDiscount.name ?? "Discount"} ${
        Number(firstDiscount.percent) || 0
      }%)`
    : "";

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        bgcolor: sidebarBg,
        color: sidebarContrast,
        display: "flex",
        flexDirection: "column",
        borderLeft: `1px solid ${sidebarBorder}`,
      }}
    >
      {/* 🔹 Open Shift modal (shown when user clicks primary with no shift) */}
      {shiftDialogOpen && (
        <FloatingShiftModal
          open={shiftDialogOpen}
          terminalId={terminalId}
          refreshLatestShift={refreshLatestShift}
          openShift={openShift}
          onClose={() => {
            setShiftDialogOpen(false);
            nextActionRef.current = null;
          }}
          onShiftOpened={(shift) => {
            setShiftDialogOpen(false);
            if (typeof nextActionRef.current === "function") {
              nextActionRef.current();
            }
            nextActionRef.current = null;
          }}
        />
      )}

      <Box sx={{ p: 2, flexGrow: 1, overflowY: "auto" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            Orders
          </Typography>

          {/* 🔹 Only show menu for NEW carts (no reflected ticket) */}
          {!isReflectingExisting && (
            <>
              <IconButton
                size="medium"
                sx={{ color: "inherit" }}
                onClick={openMenu}
                aria-label="More"
              >
                <MoreVert fontSize="medium" />
              </IconButton>

              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={closeMenu}
                elevation={0}
                PaperProps={{
                  sx: {
                    mt: 1,
                    minWidth: 200,
                    bgcolor: t.palette.grey[800],
                    color: t.palette.getContrastText(t.palette.grey[800]),
                    "& .MuiMenuItem-root": {
                      gap: 1,
                      py: 1,
                      "&:hover": {
                        bgcolor: alpha(t.palette.common.white, 0.08),
                      },
                    },
                    "& .MuiListItemIcon-root, & .MuiSvgIcon-root, & .MuiTypography-root": {
                      color: "inherit",
                    },
                    border: `1px solid ${alpha(t.palette.common.black, 0.12)}`,
                  },
                }}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                <MenuItem onClick={onClickClearOrVoid} sx={{ color: "#fff" }}>
                  <ListItemIcon sx={{ color: "#fff", minWidth: 32 }}>
                    <DeleteOutline fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Clear Order"
                    primaryTypographyProps={{
                      sx: { color: "#fff", fontWeight: 600 },
                    }}
                  />
                </MenuItem>
              </Menu>
            </>
          )}
        </Box>

        <Divider
          sx={{
            borderColor: alpha(t.palette.grey[800], 0.12),
            my: 1.5,
            mx: -2,
          }}
        />
        
        <ToggleButtonGroup
          value={orderType}
          exclusive
          onChange={(_, v) => v && setOrderType(v)}
          fullWidth
          sx={{
            backgroundColor: softAccent,
            borderRadius: "20px",
            overflow: "hidden",
            mb: 2,
            "& .MuiToggleButton-root": {
              fontSize: "1rem",
              py: 1,
              color: sidebarContrast,
            },
          }}
        >
          {["Dine-in", "Take-out"].map((type) => (
            <ToggleButton
              key={type}
              value={type}
              sx={{
                color: "inherit",
                "&.Mui-selected": {
                  bgcolor: t.palette.primary.main,
                  color: t.palette.getContrastText(t.palette.primary.main),
                },
                "&:hover": {
                  bgcolor: alpha(sidebarContrast, 0.15),
                },
              }}
            >
              {type}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Items */}
        {viewMode === "image"
          ? items.map((item) => {
              const baseQty = lockedBaseQty[item.id] || 0;
              const canVoid =
                isReflectingExisting && baseQty > 0 && (item.quantity ?? 1) > 0;
              const voidKey =
                currentOrderId ? `${currentOrderId}:${item.id}` : null;
              const voidedQty = voidKey ? voidedQtyMap[voidKey] || 0 : 0;

              return (
                <Box
                  key={item.id}
                  sx={{
                    mb: 1.5,
                    backgroundColor: softAccent,
                    borderRadius: 2,
                    display: "flex",
                    height: 95,
                    overflow: "hidden",
                  }}
                >
                  {item.image && (
                    <Box
                      component="img"
                      src={item.image}
                      alt={item.name}
                      sx={{
                        width: 95,
                        height: "100%",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <Box
                    sx={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      pt: 0.5,
                      pb: 1,
                      px: 1,
                      minWidth: 0,
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 500,
                        fontSize: "17px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.name}
                    </Typography>
                    <Typography
                      sx={{
                        fontWeight: 500,
                        fontSize: "14px",
                        mt: 0.25,
                        lineHeight: 1.2,
                      }}
                    >
                      {PHP((item.price || 0) * (item.quantity ?? 1))}{" "}
                      <Typography
                        component="span"
                        sx={{
                          color: alpha(sidebarContrast, 0.75),
                          ml: 0.5,
                          fontSize: "0.85rem",
                        }}
                      >
                        ({item.quantity ?? 1}×{PHP(item.price || 0)})
                      </Typography>
                    </Typography>

                    {(() => {
                      const itemDisc = itemDiscounts[String(item.id)];
                      const itemDiscLabel = itemDisc?.percent
                        ? `${itemDisc.name} (${Number(itemDisc.percent) || 0}%)`
                        : "Item discount";

                      return (
                        <Chip
                          size="small"
                          variant={itemDisc?.percent ? "filled" : "outlined"}
                          label={itemDiscLabel}
                          onClick={() => openItemDiscountPicker(item.id)}
                          sx={{
                            mt: 0.75,
                            alignSelf: "flex-start",
                            fontWeight: 700,
                            bgcolor: itemDisc?.percent ? alpha(t.palette.success.main, 0.14) : "transparent",
                            borderColor: alpha(t.palette.text.primary, 0.18),
                          }}
                        />
                      );
                    })()}

                    {/* Bottom row: Void button (left) + qty pill (right) */}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "flex-end",
                        mt: 1,
                        gap: 1,
                      }}
                    >
                      {voidedQty > 0 && (
                        <Typography
                          sx={{
                            mt: 0.5,
                            fontSize: 12,
                            fontWeight: 600,
                            color: t.palette.error.main,
                          }}
                        >
                          {voidedQty} voided
                        </Typography>
                      )}
                      {canVoid && (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={() => handleVoidItemClick(item)}
                          sx={{
                            px: 1.5,
                            minWidth: 0,
                            fontSize: 12,
                            textTransform: "none",
                            borderRadius: 999,
                            borderColor: t.palette.error.main,
                            bgcolor: t.palette.error.main,
                            color: "#fff",
                            "&:hover": {
                              bgcolor: t.palette.error.dark,
                              borderColor: t.palette.error.dark,
                            },
                          }}
                        >
                          Void item
                        </Button>
                      )}

                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          bgcolor: softAccentStrong,
                          borderRadius: "20px",
                          overflow: "hidden",
                          ml: "auto",
                        }}
                      >
                        {(() => {
                          const qty = item.quantity ?? 1;
                          const baseQtyInner = lockedBaseQty[item.id] || 0;
                          const lockedForThisItem =
                            qty <= baseQtyInner && baseQtyInner > 0;

                          return (
                            <IconButton
                              onClick={() => handleQtyChange(item.id, -1)}
                              size="small"
                              disabled={lockedForThisItem}
                              sx={{
                                color: "inherit",
                                px: 0.8,
                                py: 0.5,
                              }}
                            >
                              {lockedForThisItem ? (
                                <LockOutlinedIcon fontSize="small" />
                              ) : qty === 1 ? (
                                <DeleteOutline fontSize="small" />
                              ) : (
                                <Remove fontSize="small" />
                              )}
                            </IconButton>
                          );
                        })()}
                        <Typography
                          variant="body2"
                          sx={{
                            minWidth: 24,
                            textAlign: "center",
                            px: 1,
                            fontWeight: 500,
                          }}
                        >
                          {item.quantity ?? 1}
                        </Typography>
                        <IconButton
                          onClick={() => handleQtyChange(item.id, +1)}
                          size="small"
                          sx={{
                            color: "inherit",
                            px: 0.8,
                            py: 0.5,
                          }}
                        >
                          <Add fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              );
            })
          : items.map((item) => {
              const baseQty = lockedBaseQty[item.id] || 0;
              const canVoid =
                isReflectingExisting &&
                baseQty > 0 &&
                (item.quantity ?? 1) > 0;
              const voidKey =
                currentOrderId ? `${currentOrderId}:${item.id}` : null;
              const voidedQty = voidKey ? voidedQtyMap[voidKey] || 0 : 0;

              return (
                <Box
                  key={item.id}
                  sx={{
                    mb: 1.5,
                    backgroundColor: softAccent,
                    borderRadius: 2,
                    p: 1,
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 500,
                      fontSize: "17px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.name}
                  </Typography>
                  <Typography
                    sx={{
                      fontWeight: 500,
                      fontSize: "14px",
                      lineHeight: 1.2,
                    }}
                  >
                    {PHP((item.price || 0) * (item.quantity ?? 1))}{" "}
                    <Typography
                      component="span"
                      sx={{
                        color: alpha(sidebarContrast, 0.75),
                        ml: 0.5,
                        fontSize: "0.85rem",
                      }}
                    >
                      ({item.quantity ?? 1}×{PHP(item.price || 0)})
                    </Typography>
                  </Typography>

                  {(() => {
                    const itemDisc = itemDiscounts[String(item.id)];
                    const itemDiscLabel = itemDisc?.percent
                      ? `${itemDisc.name} (${Number(itemDisc.percent) || 0}%)`
                      : "Item discount";

                    return (
                      <Chip
                        size="small"
                        variant={itemDisc?.percent ? "filled" : "outlined"}
                        label={itemDiscLabel}
                        onClick={() => openItemDiscountPicker(item.id)}
                        sx={{
                          mt: 0.75,
                          alignSelf: "flex-start",
                          fontWeight: 700,
                          bgcolor: itemDisc?.percent ? alpha(t.palette.success.main, 0.14) : "transparent",
                          borderColor: alpha(t.palette.text.primary, 0.18),
                        }}
                      />
                    );
                  })()}

                  {/* Bottom row: Void button (left) + qty pill (right) */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-end",
                      mt: 1,
                      gap: 1,
                    }}
                  >
                    {voidedQty > 0 && (
                      <Typography
                        sx={{
                          mt: 0.5,
                          fontSize: 12,
                          fontWeight: 600,
                          color: t.palette.error.main,
                        }}
                      >
                        {voidedQty} voided
                      </Typography>
                    )}
                    {canVoid && (
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => handleVoidItemClick(item)}
                        sx={{
                          px: 1.5,
                          minWidth: 0,
                          fontSize: 12,
                          textTransform: "none",
                          borderRadius: 999,
                          borderColor: t.palette.error.main,
                          bgcolor: t.palette.error.main,
                          color: "#fff",
                          "&:hover": {
                            bgcolor: t.palette.error.dark,
                            borderColor: t.palette.error.dark,
                          },
                        }}
                      >
                        Void item
                      </Button>
                    )}

                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        bgcolor: softAccentStrong,
                        borderRadius: "20px",
                        overflow: "hidden",
                        ml: "auto",
                      }}
                    >
                      {(() => {
                        const qty = item.quantity ?? 1;
                        const baseQtyInner = lockedBaseQty[item.id] || 0;
                        const lockedForThisItem =
                          qty <= baseQtyInner && baseQtyInner > 0;

                        return (
                          <IconButton
                            onClick={() => handleQtyChange(item.id, -1)}
                            size="small"
                            disabled={lockedForThisItem}
                            sx={{
                              color: "inherit",
                              px: 0.8,
                              py: 0.5,
                            }}
                          >
                            {lockedForThisItem ? (
                              <LockOutlinedIcon fontSize="small" />
                            ) : qty === 1 ? (
                              <DeleteOutline fontSize="small" />
                            ) : (
                              <Remove fontSize="small" />
                            )}
                          </IconButton>
                        );
                      })()}
                      <Typography
                        variant="body2"
                        sx={{
                          minWidth: 24,
                          textAlign: "center",
                          px: 1,
                          fontWeight: 500,
                        }}
                      >
                        {item.quantity ?? 1}
                      </Typography>
                      <IconButton
                        onClick={() => handleQtyChange(item.id, +1)}
                        size="small"
                        sx={{
                          color: "inherit",
                          px: 0.8,
                          py: 0.5,
                        }}
                      >
                        <Add fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </Box>
              );
            })}
      </Box>

      {/* Summary */}
      <Box
        sx={{
          bgcolor: alpha(t.palette.grey[50] || "#fff", 0.9),
          p: 1.5,
          borderTop: `1px solid ${alpha(t.palette.grey[800], 0.12)}`,
        }}
      >
        <Row label="Sub Total" value={PHP(subtotal)} />

        <Row label="Item Discounts" value={`-${PHP(itemDiscountAmount)}`} />
        {/* Discounts (read-only) */}
        <Row
          label={`Discounts ${discountSuffix ? ` ${discountSuffix}` : ""}`}
          value={`-${PHP(discountAmount)}`}
        />

        <Divider
          sx={{
            borderColor: alpha(sidebarContrast, 0.25),
            my: 1,
            mx: -1.5,
          }}
        />
        <Row label="Total Payment" value={PHP(total)} bold />

        {isReflectingExisting && (
          <Button
            fullWidth
            variant="contained"
            color="primary"
            startIcon={<RestartAlt />}
            onClick={onClickNewOrder}
            sx={{ mt: 1, mb: 1 }}
          >
            New Order
          </Button>
        )}

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={onPrimaryClick}
          >
            {primaryLabel}
          </Button>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            disabled={items.length === 0 || !shiftId}
            onClick={goCharge}
          >
            Charge
          </Button>
        </Box>
      </Box>

      {/* Discount dialog */}
      <Dialog
        open={dlgOpen}
        onClose={() => setDlgOpen(false)}
        PaperProps={{ sx: { minWidth: 340 } }}
      >
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <Box
            sx={(theme) => ({
              width: 44,
              height: 44,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 14,
              bgcolor: alpha(theme.palette.text.primary, 0.12),
              color: "inherit",
              flexShrink: 0,
            })}
          >
            {hasEditing ? `${currentPercent}%` : "--"}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="overline"
              component="span"
              sx={{ opacity: 0.8, lineHeight: 1 }}
            >
              Discount
            </Typography>
            <Typography
              variant="h6"
              component="span"
              sx={{
                display: "block",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 220,
              }}
            >
              {hasEditing ? discounts[editingIndex]?.name ?? "" : ""}
            </Typography>
          </Box>
          <IconButton
            color="error"
            onClick={removeCurrent}
            title="Remove discount"
            sx={{ ml: "auto" }}
            disabled={!hasEditing}
          >
            <DeleteOutline />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 1.25 }}>
          {hasEditing && (
            <Stack spacing={1.25}>
              <Row label="Subtotal base" value={PHP(subtotal)} />

              <Box>
                <Typography
                  variant="caption"
                  sx={{ mb: 0.5, display: "block", fontWeight: 500 }}
                >
                  Discount type
                </Typography>
                <FormControl fullWidth size="small">
                  <Select
                    value={selectedDiscountKey}
                    onChange={handleChangeDiscountType}
                    displayEmpty
                    disabled={
                      loadingDiscounts || !!discountLoadError
                    }
                    renderValue={(v) => {
                      if (!v) return "Select discount";
                      const opt = discountChoices.find(
                        (opt) =>
                          (opt.code || String(opt.id)) === v
                      );
                      return opt
                        ? `${opt.name} (${opt.percent}%)`
                        : "Select discount";
                    }}
                  >
                    {pickerOptions.map((opt) => (
                      <MenuItem
                        key={opt.id ?? opt.code}
                        value={opt.code || String(opt.id)}
                      >
                        {opt.name} ({opt.percent}%)
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {loadingDiscounts && (
                  <Typography
                    variant="caption"
                    sx={{ mt: 0.5, opacity: 0.7 }}
                  >
                    Loading discounts…
                  </Typography>
                )}
                {discountLoadError && (
                  <Typography
                    variant="caption"
                    color="error"
                    sx={{ mt: 0.5 }}
                  >
                    {discountLoadError}
                  </Typography>
                )}
              </Box>

              <Row label="Percent" value={`${currentPercent}%`} />
              <Divider sx={{ my: 0.5 }} />
              <Row
                label="Discount amount"
                value={`-${PHP(previewAmount)}`}
                bold
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2 }}>
          <Button onClick={() => setDlgOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={applySelectedDiscountType}
            disabled={!hasEditing || !selectedDiscountKey}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Clear / Void */}
      <Dialog
        open={confirmOpen}
        onClose={cancelConfirm}
        PaperProps={{ sx: { minWidth: 360 } }}
      >
        <DialogTitle sx={{ pb: 1.5 }}>
          <Typography
            variant="h6"
            component="span"
            sx={{ display: "block", lineHeight: 1.2, mb: 0.25 }}
          >
            {confirmTitle}
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 1 }}>
          <Typography
            variant="body2"
            component="span"
            sx={{ display: "block", opacity: 0.85 }}
          >
            {confirmBody}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={cancelConfirm} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={confirmAction}
            color="error"
            variant="contained"
            startIcon={
              isReflectingExisting ? <DeleteForever /> : <DeleteOutline />
            }
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm New Order */}
      <Dialog
        open={newOrderConfirmOpen}
        onClose={cancelNewOrder}
        PaperProps={{ sx: { minWidth: 360 } }}
      >
        <DialogTitle sx={{ pb: 1.5 }}>
          <Typography
            variant="h6"
            component="span"
            sx={{ display: "block", lineHeight: 1.2, mb: 0.25 }}
          >
            New Order
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 1 }}>
          <Typography
            variant="body2"
            component="span"
            sx={{ display: "block", opacity: 0.85 }}
          >
            Start a fresh order and empty the current cart? The original
            ticket will remain unchanged.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={cancelNewOrder} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={confirmNewOrder}
            variant="contained"
            startIcon={<RestartAlt />}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Pending → Save Order */}
      <Dialog
        open={pendingOpen}
        onClose={closePendingDialog}
        PaperProps={{ sx: { minWidth: 400 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
          <Typography
            variant="h6"
            component="span"
            sx={{ flex: 1 }}
          >
            Customer Name
          </Typography>
          <Typography
            variant="subtitle2"
            component="span"
            sx={{ opacity: 0.8 }}
          >
            {nowLabel()}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          <TextField
            fullWidth
            placeholder="e.g. Juan D."
            value={custName}
            onChange={(e) => {
              const raw = e.target.value;
              // allow letters, spaces, dot, hyphen
              const cleaned = raw.replace(/[^A-Za-z .-]/g, "");
              const limited = cleaned.slice(0, 30);
              setCustName(limited);
            }}
            onBlur={() => setNameTouched(true)}
            error={nameTouched && Boolean(nameError)}
            helperText={nameError || " "}
            sx={{ mb: 2 }}
            InputProps={{
              sx: {
                bgcolor: alpha(t.palette.common.white, 0.7),
                borderRadius: 1,
              },
              inputProps: { maxLength: 30 },
            }}
          />

          <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
            Table Number
          </Typography>
          <TextField
            fullWidth
            placeholder="e.g. 12"
            value={tableNo}
            onChange={(e) => {
              const raw = e.target.value;
              const digits = raw.replace(/\D/g, "");
              const limited = digits.slice(0, 3);
              setTableNo(limited);
            }}
            onBlur={() => setTableTouched(true)}
            error={tableTouched && Boolean(tableError)}
            helperText={tableError || " "}
            InputProps={{
              sx: {
                bgcolor: alpha(t.palette.common.white, 0.7),
                borderRadius: 1,
              },
              inputMode: "numeric",
              pattern: "[0-9]*",
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="contained"
            onClick={savePendingOrder}
            disabled={!canSavePending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Open Orders list */}
      <Dialog
        open={openOrdersDlg}
        onClose={() => setOpenOrdersDlg(false)}
        PaperProps={{ sx: { minWidth: 560 } }}
      >
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <Typography
            variant="h6"
            component="span"
            sx={{ flex: 1 }}
          >
            Open Orders
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              mb: 1,
              alignItems: "center",
            }}
          >
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select
                value={sortKey}
                onChange={(e) => {
                  const v = e.target.value;
                  setSortKey(v);
                  setSortDir("asc");
                }}
                displayEmpty
                renderValue={(v) =>
                  v ? sortLabels[v] : "Sort by"
                }
              >
                {Object.entries(sortLabels).map(
                  ([key, label]) => (
                    <MenuItem key={key} value={key}>
                      {label}
                    </MenuItem>
                  )
                )}
              </Select>
            </FormControl>

            <IconButton
              size="small"
              onClick={() =>
                setSortDir((d) =>
                  d === "asc" ? "desc" : "asc"
                )
              }
              title={`Direction: ${
                sortDir === "asc" ? "Ascending" : "Descending"
              }`}
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
              }}
            >
              <SortIcon
                sx={{
                  transform:
                    sortDir === "desc"
                      ? "scaleY(-1)"
                      : "none",
                }}
              />
            </IconButton>
          </Box>

          <TextField
            fullWidth
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 1 }}
          />

          <Box sx={{ display: "grid", gap: 1 }}>
            {filteredOrders.map((o) => (
              <Box
                key={o.id}
                onClick={() => openSummary(o)}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  p: 1,
                  borderRadius: 1.5,
                  cursor: "pointer",
                  bgcolor: alpha(t.palette.text.primary, 0.06),
                  "&:hover": {
                    bgcolor: alpha(
                      t.palette.text.primary,
                      0.1
                    ),
                  },
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>
                    {`#${o.orderNo ?? o.id} • Table #${o.table} – ${new Date(o.time).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 0.25, flexWrap: "wrap" }}
                  >
                    <MetaChip
                      icon={<PersonOutline />}
                      label={o.customer}
                    />
                    <MetaChip
                      icon={<BadgeOutlined />}
                      label={o.employee}
                    />
                  </Stack>
                </Box>
                <Typography sx={{ fontWeight: 700 }}>
                  {PHP(o.amount)}
                </Typography>
              </Box>
            ))}
            {filteredOrders.length === 0 && (
              <Typography
                sx={{
                  opacity: 0.7,
                  textAlign: "center",
                  py: 3,
                }}
              >
                No open orders.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setOpenOrdersDlg(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Order Summary */}
      <Dialog
        open={Boolean(summaryOrder)}
        onClose={closeSummary}
        PaperProps={{ sx: { minWidth: 420 } }}
      >
        <DialogTitle>
          <Typography variant="h6" component="span">
            Order Summary
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {summaryOrder && (
            <Stack spacing={1}>
              <Row label="Order No" value={`#${summaryOrder.orderNo ?? summaryOrder.id}`}/>

              <Row label="Customer" value={summaryOrder.customer} />
              <Row label="Table" value={summaryOrder.table} />
              <Row
                label="Time"
                value={new Date(
                  summaryOrder.time
                ).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              />
              <Divider />
              {summaryOrder.items.map((it, idx) => (
                <Row
                  key={idx}
                  label={`${it.name} (${it.qty}×${PHP(
                    it.price
                  )})`}
                  value={PHP(
                    (it.qty ?? 1) * (it.price || 0)
                  )}
                />
              ))}
              <Divider />
              <Row
                label="Amount"
                value={PHP(summaryOrder.amount)}
                bold
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={closeSummary}>Cancel</Button>
          <Button variant="contained" onClick={() => restoreToCart(summaryOrder)} disabled={!summaryOrder}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Save Updated Ticket Confirm */}
      <Dialog
        open={saveConfirmOpen}
        onClose={() => setSaveConfirmOpen(false)}
        PaperProps={{ sx: { minWidth: 440 } }}
      >
        <DialogTitle>
          <Typography variant="h6" component="span">
            Update Saved Order
          </Typography>
          <Typography
            variant="body2"
            sx={{ opacity: 0.75 }}
          >
            Review changes before saving. Cart will be cleared after
            saving.
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 1.5 }}>
          {!originalOrder || !updatedOrder ? (
            <Typography
              variant="body2"
              sx={{ opacity: 0.8 }}
            >
              No ticket found to compare.
            </Typography>
          ) : (
            <Stack spacing={2}>
              <Box>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, mb: 0.5 }}
                >
                  Original Ticket
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ opacity: 0.7 }}
                >
                  {originalOrder.customer} · Table{" "}
                  {originalOrder.table} ·{" "}
                  {new Date(
                    originalOrder.time
                  ).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Typography>
                <Divider sx={{ my: 1 }} />
                {originalOrder.items.map((it, idx) => (
                  <Row
                    key={`old-${idx}`}
                    label={`${it.name} (${it.qty}×${PHP(
                      it.price
                    )})`}
                    value={PHP(
                      (it.qty ?? 1) * (it.price || 0)
                    )}
                  />
                ))}
                <Divider sx={{ my: 0.75 }} />
                <Row
                  label="Amount"
                  value={PHP(originalOrder.amount)}
                  bold
                />
              </Box>

              <Box>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, mb: 0.5 }}
                >
                  Updated Ticket
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ opacity: 0.7 }}
                >
                  {updatedOrder.customer} · Table{" "}
                  {updatedOrder.table} ·{" "}
                  {new Date(
                    updatedOrder.time
                  ).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Typography>
                <Divider sx={{ my: 1 }} />
                {updatedOrder.items.map((it, idx) => (
                  <Row
                    key={`new-${idx}`}
                    label={`${it.name} (${it.qty}×${PHP(
                      it.price
                    )})`}
                    value={PHP(
                      (it.qty ?? 1) * (it.price || 0)
                    )}
                  />
                ))}
                <Divider sx={{ my: 0.75 }} />
                <Row
                  label="Amount"
                  value={PHP(updatedOrder.amount)}
                  bold
                />
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            onClick={() => setSaveConfirmOpen(false)}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmSaveUpdated}
            disabled={!originalOrder || !updatedOrder}
          >
            Confirm Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Void Item dialog (quantity + reason) */}
      <Dialog
        open={voidItemDialogOpen && !!voidContext}
        onClose={() => {
          setVoidItemDialogOpen(false);
          setVoidContext(null);
          setVoidQty(1);
          setVoidReason("");
        }}
        PaperProps={{ sx: { minWidth: 360 } }}
      >
        <DialogTitle>Void Item</DialogTitle>
        <DialogContent dividers>
          {voidContext && (
            <Box sx={{ mt: 0.5 }}>
              <Typography
                variant="subtitle1"
                sx={{ mb: 0.5, fontWeight: 600 }}
              >
                {voidContext.itemName}
              </Typography>
              <Typography
                variant="body2"
                sx={{ mb: 2, opacity: 0.8 }}
              >
                Max voidable quantity: {voidContext.maxQty}
              </Typography>

              <TextField
                fullWidth
                type="number"
                size="small"
                label="Quantity to void"
                value={voidQty}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) {
                    setVoidQty("");
                  } else {
                    setVoidQty(n);
                  }
                }}
                inputProps={{
                  min: 1,
                  max: voidContext.maxQty,
                }}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                size="small"
                label="Reason (optional)"
                value={voidReason}
                onChange={(e) =>
                  setVoidReason(e.target.value.slice(0, 255))
                }
                multiline
                minRows={2}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            onClick={() => {
              setVoidItemDialogOpen(false);
              setVoidContext(null);
              setVoidQty(1);
              setVoidReason("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={
              !voidContext ||
              !voidQty ||
              Number(voidQty) < 1 ||
              Number(voidQty) > (voidContext?.maxQty || 0)
            }
            onClick={() => {
              if (!voidContext) return;
              const safeQty = Math.min(
                Math.max(1, Number(voidQty) || 1),
                voidContext.maxQty || 1
              );

              setPendingVoidItem({
                itemId: voidContext.itemId,
                itemName: voidContext.itemName,
                unitPrice: voidContext.unitPrice,
                qty: safeQty,
                maxQty: voidContext.maxQty,
                reason: voidReason.trim() || null,
              });

              setPinError("");
              setPinDigits(Array(6).fill(""));
              setPinVisible(false);
              openSafely(setPinDialogOpen);
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* ✅ Discount Picker (Order or Item) */}
      <Dialog
        open={pickerOpen}
        onClose={closeDiscountPicker}
        PaperProps={{ sx: { minWidth: 360 } }}
      >
        <DialogTitle>
          {pickerTarget.type === "item" ? "Item Discount" : "Order Discount"}
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 1.5 }}>
          {loadingDiscounts ? (
            <Typography variant="body2" sx={{ opacity: 0.75 }}>
              Loading discounts…
            </Typography>
          ) : discountLoadError ? (
            <Typography variant="body2" color="error">
              {discountLoadError}
            </Typography>
          ) : (
            <FormControl fullWidth size="small">
              <Select
                value={pickerKey}
                onChange={(e) => setPickerKey(e.target.value)}
                displayEmpty
                renderValue={(v) => {
                  if (!v) return "None";
                  const opt = discountChoices.find(
                    (d) => (d.code || String(d.id)) === v
                  );
                  return opt ? `${opt.name} (${opt.percent}%)` : "Select discount";
                }}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>

                {pickerOptions.map((opt) => (
                  <MenuItem key={opt.id ?? opt.code} value={opt.code || String(opt.id)}>
                    {opt.name} ({opt.percent}%)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={closeDiscountPicker}>Cancel</Button>
          <Button
            variant="contained"
            onClick={applyPickedDiscount}
            disabled={loadingDiscounts || !!discountLoadError}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* Approval PIN Dialog */}
      <Dialog
        open={pinDialogOpen}
        onClose={() => {
          setPinDialogOpen(false);
          setPinDigits(Array(6).fill(""));
          setPinError("");
          setPinVisible(false);
          setPendingVoidItem(null);
        }}
        PaperProps={{ sx: { minWidth: 360 } }}
      >
        <DialogTitle>
          <Typography variant="h6" component="span">
            Approval Required
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            Enter 6-digit PIN to continue
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
              mt: 0.5,
            }}
          >
            {/* PIN row */}
            <Stack direction="row" spacing={1} alignItems="center">
              <LockOutlinedIcon fontSize="small" />

              {/* 6-digit PIN boxes */}
              <Stack direction="row" spacing={0.5}>
                {pinDigits.map((digit, idx) => (
                  <TextField
                    key={idx}
                    size="small"
                    inputRef={(el) => {
                      pinRefs.current[idx] = el;
                    }}
                    value={pinVisible ? digit : digit ? "•" : ""}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      const val = raw ? raw[raw.length - 1] : "";

                      setPinError("");
                      setPinDigits((prev) => {
                        const next = [...prev];
                        next[idx] = val;
                        return next;
                      });

                      if (val && idx < 5) {
                        pinRefs.current[idx + 1]?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Backspace" &&
                        !pinDigits[idx] &&
                        idx > 0
                      ) {
                        pinRefs.current[idx - 1]?.focus();
                      }
                    }}
                    inputProps={{
                      inputMode: "numeric",
                      pattern: "[0-9]*",
                      maxLength: 1,
                      style: {
                        textAlign: "center",
                        width: 28,
                      },
                      "aria-label": `PIN digit ${idx + 1}`,
                    }}
                    sx={{
                      "& .MuiInputBase-input": {
                        p: "8px 6px",
                      },
                      width: 34,
                    }}
                  />
                ))}
              </Stack>

              {/* show / hide toggle */}
              <IconButton
                size="small"
                onClick={() => setPinVisible((prev) => !prev)}
              >
                {pinVisible ? (
                  <VisibilityOutlinedIcon />
                ) : (
                  <VisibilityOffOutlinedIcon />
                )}
              </IconButton>
            </Stack>

            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              Use a 6-digit numeric PIN.
            </Typography>

            {/* 🔹 NEW: Quantity selector for per-item void */}
            {pinError && (
              <Typography
                variant="body2"
                color="error"
                sx={{ mt: 0.5 }}
              >
                {pinError}
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            onClick={() => {
              setPinDialogOpen(false);
              setPinDigits(Array(6).fill(""));
              setPinError("");
              setPinVisible(false);
              setPendingVoidItem(null);
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            disabled={pinDigits.some((d) => !d) || isPinChecking}
            onClick={async () => {
              const pin = pinDigits.join("");
              if (pin.length !== 6) return;

              setIsPinChecking(true);
              setPinError("");

              try {
                // 1) Verify PIN (same endpoint as before)
                const verifyUrl = ordersApi("/verify-refund-pin");

                const res = await fetch(verifyUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  credentials: "include",
                  body: JSON.stringify({ pin }),
                });

                const data = await res.json();
                console.log("DISCOUNTS RAW:", data);
                console.log("DISCOUNT OPTIONS:", options);

                if (!data.ok) {
                  setPinError(data.error || "Invalid PIN");
                  setIsPinChecking(false);
                  return;
                }

                // 2) PIN OK → if we have a pendingVoidItem + currentOrderId, call /void-item
                if (pendingVoidItem && currentOrderId) {
                  const { itemId, qty = 1, unitPrice, reason } = pendingVoidItem;

                  try {
                    const voidUrl = ordersApi(
                      `/${encodeURIComponent(currentOrderId)}/void-item`
                    );

                    const res2 = await fetch(voidUrl, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({
                        itemId,
                        qty,
                        reason: reason || null,
                        employeeId,
                      }),
                    });

                    const data2 = await res2.json().catch(() => ({}));

                    if (!res2.ok || data2.ok === false) {
                      throw new Error(
                        data2.error || `Failed to void item (${res2.status})`
                      );
                    }

                    const newStatus = data2.status || "";

                    // 🔹 Update lockedBaseQty then decrement local qty
                    setLockedBaseQty((prev) => {
                      const next = { ...prev };
                      const current = Number(next[itemId] || 0);
                      next[itemId] = Math.max(0, current - qty);
                      return next;
                    });

                    // Track how many were voided (for "1 voided" label)
                    setVoidedQtyMap((prev) => {
                      if (!currentOrderId) return prev; // safety
                      const key = `${currentOrderId}:${itemId}`;
                      return {
                        ...prev,
                        [key]: (prev[key] || 0) + qty,
                      };
                    });

                    // Decrement from cart items (qty may be > 1)
                    for (let i = 0; i < qty; i++) {
                      decrementItem(itemId);
                    }

                    // Update openOrders snapshot
                    setOpenOrders((prev) =>
                      prev.map((o) => {
                        if (o.id !== currentOrderId) return o;
                        const nextItems = (o.items || []).map((it) =>
                          it.id === itemId
                            ? {
                                ...it,
                                qty: Math.max(0, (it.qty ?? 1) - qty),
                              }
                            : it
                        );
                        const voidAmount = (unitPrice || 0) * qty;
                        const nextAmount = Math.max(
                          0,
                          (o.amount || 0) - voidAmount
                        );

                        return {
                          ...o,
                          status: newStatus || o.status,
                          items: nextItems,
                          amount: nextAmount,
                        };
                      })
                    );

                    // If backend says entire order is now voided → clear cart & reflection
                    if (newStatus.toLowerCase() === "voided") {
                      clearCart();
                      clearDiscounts();
                      setReflecting(null);
                      setLockedBaseQty({ });
                      setCurrentOrderId(null);
                    }

                    // Close PIN dialog
                    setIsPinChecking(false);
                    setPinDialogOpen(false);
                    setPinDigits(Array(6).fill(""));
                    setPinVisible(false);
                    setPendingVoidItem(null);
                    setPinError("");

                    setVoidItemDialogOpen(false);
                    setVoidContext(null);
                    setVoidQty(1);
                    setVoidReason("");
                    setVoidSuccessOpen(true);
                  } catch (err2) {
                    console.error("[Cart] void-item failed", err2);
                    setIsPinChecking(false);
                    setPinError(err2.message || "Failed to void item");
                    return;
                  }
                } else {
                  // No pending item: just close PIN dialog
                  setIsPinChecking(false);
                  setPinDialogOpen(false);
                  setPinDigits(Array(6).fill(""));
                  setPinVisible(false);
                  setPendingVoidItem(null);
                  setPinError("");
                }
              } catch (err) {
                console.error("[Cart] PIN check failed", err);
                setIsPinChecking(false);
                setPinError("Server error");
              }
            }}
          >
            {isPinChecking ? "Checking…" : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Void success dialog */}
      <Dialog
        open={voidSuccessOpen}
        onClose={() => setVoidSuccessOpen(false)}
        PaperProps={{ sx: { minWidth: 320 } }}
      >
        <DialogTitle>Void Successful</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            The item was voided successfully.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="contained"
            onClick={() => setVoidSuccessOpen(false)}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Empty Clear Info */}
      <Dialog
        open={emptyClearOpen}
        onClose={() => setEmptyClearOpen(false)}
        PaperProps={{ sx: { minWidth: 360 } }}
      >
        <DialogTitle sx={{ pb: 1.5 }}>
          <Typography
            variant="h6"
            component="span"
          >
            Nothing to Clear
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 1 }}>
          <Typography
            variant="body2"
            sx={{ opacity: 0.85 }}
          >
            There are no items in the cart to clear.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button
            variant="contained"
            onClick={() => setEmptyClearOpen(false)}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Row({ label, value, bold = false }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        py: 0.5,
      }}
    >
      <Typography sx={{ fontWeight: bold ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: bold ? 700 : 400 }}>
        {value}
      </Typography>
    </Box>
  );
}