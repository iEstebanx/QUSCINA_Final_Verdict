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
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useShift } from "@/context/ShiftContext";

// 🔹 Backoffice auth (not mobileAuth)
import { useAuth } from "@/context/AuthContext";

const PHP = (n) => `₱${Number(n).toFixed(2)}`;
const LS_REFLECTING_KEY = "currentOrderId"; // persist reflected order id
const LS_ORDER_TYPE = "orderType"; // persist dine-in / take-out

// 🔹 Build Backoffice POS shift API URL
const shiftApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;

  if (!base) return `/api/pos/shift${clean}`;
  if (base.endsWith("/api")) return `${base}/pos/shift${clean}`;
  return `${base}/api/pos/shift${clean}`;
};

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

function FloatingShiftModal({ open, onClose, onShiftOpened, terminalId, refreshLatestShift }) {
  const [quantities, setQuantities] = useState({});
  const [entryMode, setEntryMode] = useState("quick"); // 'quick' | 'manual'
  const [submitting, setSubmitting] = useState(false);
  const theme = useTheme();

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
    const denoms = denominations.map((d) => ({
      denom_value: d.value,
      qty: Number(quantities[d.value] || 0),
    }));
    const tid = terminalId || "TERMINAL-1";

    setSubmitting(true);
    try {
      const res = await fetch(shiftApi("/open"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          terminal_id: tid,
          opening_float: total,
          denominations: denoms,
          note: "",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        // 🔴 Special handling: shift already open on another terminal (e.g. TERMINAL-1 / Cashier)
        if (
          res.status === 409 &&
          data?.code === "SHIFT_HELD_BY_OTHER_TERMINAL" &&
          data?.holder
        ) {
          setConflict({
            terminalId: data.holder.terminal_id || "Unknown terminal",
            employeeName:
              data.holder.employee_name || "Unknown employee",
            employeeId: data.holder.employee_id || null,
          });
          setConflictOpen(true);
          return; // don't throw; we already handled it with a dialog
        }

        // Other kinds of errors → show generic alert
        throw new Error(
          data?.error || `Failed to open shift (${res.status})`
        );
      }

      // ✅ Success
      if (typeof refreshLatestShift === "function") {
        await refreshLatestShift();
      }

      if (typeof onShiftOpened === "function") {
        onShiftOpened(data.shift || null);
      }
    } catch (err) {
      console.error("[Backoffice POS] open shift failed", err);
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
      // 🔢 Manual numeric entry
      return
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
        />;
    }

    // ⚡ Quick select (dropdown) mode
    const hasPreset = quantityOptions.some(
      (opt) => opt.value === numericValue
    );

    const options =
      !hasPreset && numericValue !== 0
        ? [
            { value: numericValue, label: `Custom (${numericValue})` },
            ...quantityOptions,
          ]
        : quantityOptions;

    return (
      <TextField
        key={value}
        select
        fullWidth
        label={label}
        sx={{ minWidth: 140 }}
        value={numericValue}
        onChange={(e) =>
          handleDropdownChange(value, Number(e.target.value))
        }
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

        {/* 🔘 Entry mode toggle */}
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

        {/* Two-column layout */}
        <Box
          sx={{
            mt: 1,
            width: "100%",
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
          {/* Coins */}
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

          {/* Bills */}
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
              sx={{
                color: theme.palette.success.main,
                fontSize: "1.5rem",
              }}
            >
              ₱{totalAmount.toFixed(2)}
            </Box>
          </Typography>
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
          disabled={false}// disabled={submitting}
        >
          {submitting ? "Opening…" : "Open Shift"}
        </Button>
      </DialogActions>

      {/* 🔴 Conflict dialog: someone else already has an open shift */}
      <Dialog
        open={conflictOpen}
        onClose={() => {
          setConflictOpen(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Shift Already Open</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            A shift is already open on{" "}
            <strong>{conflict?.terminalId || "another terminal"}</strong>.
          </Typography>
          <Typography variant="body2">
            Current holder:{" "}
            <strong>
              {conflict?.employeeName || "Unknown employee"}
            </strong>
            {conflict?.employeeId
              ? ` (ID: ${conflict.employeeId})`
              : ""}
            .
          </Typography>
          <Typography variant="body2" sx={{ mt: 1.5, opacity: 0.8 }}>
            Please ask them to close their shift in the Cashier POS before
            opening a Backoffice shift.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConflictOpen(false)}
            variant="contained"
          >
            OK
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

    // totals + view
    subtotal,
    discountAmount,
    viewMode,
  } = useCart();

  // 🔹 Backoffice auth
  const { user } = useAuth();

  // For Backoffice POS we'll just use a static terminal + dummy shift for now.
const { shiftId, hasShift, refreshLatestShift } = useShift();
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

    const norm = (arr) =>
      (arr || [])
        .map((d) => `${d.name ?? ""}:${Number(d.percent) || 0}`)
        .join("|");

    const baseDiscountSig = norm(original.discounts);
    const liveDiscountSig = norm(discounts);

    if (baseDiscountSig !== liveDiscountSig) return true;

    return false;
  }, [isReflectingExisting, currentOrderId, openOrders, items, discounts]);

  const t = useTheme();
  const sidebarBg = t.palette.secondary.main;
  const sidebarContrast =
    t.palette.secondary.contrastText ??
    t.palette.getContrastText(t.palette.secondary.main);

  const handleQtyChange = (id, delta) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const qty = item.quantity ?? 1;
    const baseQty = lockedBaseQty[id] || 0;

    if (delta > 0) {
      incrementItem(id);
      return;
    }

    if (delta < 0) {
      if (qty <= baseQty && baseQty > 0) {
        return;
      }

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

  const total = Math.max(0, subtotal - discountAmount); // no VAT, just net total

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDigits, setPinDigits] = useState(Array(6).fill(""));
  const [pinError, setPinError] = useState("");
  const [isPinChecking, setIsPinChecking] = useState(false);
  const pinRefs = useRef([]);
  const [pinVisible, setPinVisible] = useState(false);

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

        const options = data
          .filter((d) => d.isActive)
          .filter((d) => d.type === "percent" && d.scope === "order")
          .map((d) => ({
            id: d.id,
            code: d.code,
            name: d.name,
            percent: Number(d.value),
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

  const openDiscountPicker = () => {
    if (!discountChoices.length || discountLoadError) return;

    const hit = activeDiscount
      ? discountChoices.find(
          (opt) =>
            opt.name === activeDiscount.name &&
            Number(opt.percent) === Number(activeDiscount.percent)
        )
      : null;

    setPickerKey(hit ? hit.code || String(hit.id) : "");
    openSafely(setPickerOpen);
  };

  const closeDiscountPicker = () => setPickerOpen(false);

  const applyPickedDiscount = () => {
    if (!pickerKey) {
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
    applyDiscount(opt.name, opt.percent);
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

    if (isReflectingExisting) {
      setPinError("");
      setPinDigits(Array(6).fill(""));
      openSafely(setPinDialogOpen);
      return;
    }

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
    clearCart();
    clearDiscounts();
    setReflecting(null);
    setLockedBaseQty({});
    setNewOrderConfirmOpen(false);
  };

  // 🔹 async void (call backend) or clear
  const confirmAction = async () => {
    setDlgOpen(false);
    setEditingIndex(-1);

    if (currentOrderId) {
      try {
        const res = await fetch(
          ordersApi(`/${encodeURIComponent(currentOrderId)}/void`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ employeeId }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || `Failed to void (${res.status})`);
        }

        setOpenOrders((prev) =>
          prev.map((o) =>
            o.id === currentOrderId
              ? {
                  ...o,
                  status: "voided",
                  voidedAt: new Date().toISOString(),
                }
              : o
          )
        );
      } catch (err) {
        console.error("[Cart] Failed to void order", err);
        window.alert(err.message || "Failed to void order");
      }
    }

    clearCart();
    clearDiscounts();
    setReflecting(null);
    setLockedBaseQty({});
    setConfirmOpen(false);
  };

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
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        qty: i.quantity ?? 1,
      })),
      discounts: discounts.map((d) => ({
        name: d.name,
        percent: Number(d.percent) || 0,
      })),
    };

    let orderId = null;
    let netAmount = 0;

    try {
      const res = await fetch(ordersApi("/pending"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
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
    } catch (err) {
      console.error("[Cart] savePendingOrder failed", err);
      window.alert(err.message || "Failed to save pending order");
      return;
    }

    const order = {
      id: orderId,
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
    clearCart();
    setReflecting(null);
    setLockedBaseQty({});
    setPendingOpen(false);
  };

  const saveUpdatedTicket = () => {
    if (!currentOrderId) return;

    const updated = {
      id: currentOrderId,
      status: "pending",
      source: "Backoffice POS",
      employee: employeeId,
      time: new Date().toISOString(),
      customer:
        openOrders.find((o) => o.id === currentOrderId)?.customer ||
        "Walk-in",
      table: openOrders.find((o) => o.id === currentOrderId)?.table || "-",
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        qty: i.quantity ?? 1,
        image: i.image,
      })),
      discounts: discounts.map((d) => ({ ...d })),
    };

    const ss = updated.items.reduce((s, i) => s + i.price * i.qty, 0);
    const tp = updated.discounts.reduce(
      (a, d) => a + (Number(d.percent) || 0),
      0
    );
    updated.amount = Math.max(0, ss - (ss * tp) / 100);

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
    setSummaryOrder(order);
    blurActive();
  };
  const closeSummary = () => setSummaryOrder(null);

  const { addItem: _add } = useCart();
  const addItemSafe = (p) => {
    if (typeof _add === "function") _add(p);
  };

  const restoreToCart = () => {
    if (!summaryOrder) return;

    clearCart();
    clearDiscounts();
    summaryOrder.items.forEach((it) => {
      for (let k = 0; k < (it.qty ?? 1); k++) {
        addItemSafe({
          id: it.id,
          name: it.name,
          price: it.price,
          image: it.image,
        });
      }
    });
    if (Array.isArray(summaryOrder.discounts)) {
      summaryOrder.discounts.forEach((d) =>
        applyDiscount(d.name ?? "Discount", d.percent ?? 0)
      );
    }

    const base = {};
    summaryOrder.items.forEach((it) => {
      const qty = it.qty ?? 1;
      base[it.id] = (base[it.id] || 0) + qty;
    });
    setLockedBaseQty(base);
    setReflecting(summaryOrder.id);
    setCurrentOrderId(summaryOrder.id);
    localStorage.setItem(LS_REFLECTING_KEY, summaryOrder.id);
    setSummaryOrder(null);
    setOpenOrdersDlg(false);
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
  }, [isReflectingExisting, currentOrderId, openOrders, items, discounts]);

  const handleConfirmSaveUpdated = () => {
    saveUpdatedTicket();

    clearCart();
    clearDiscounts();
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

  const confirmTitle = isReflectingExisting ? "Void Order" : "Clear Order";
  const confirmBody = isReflectingExisting
    ? "Mark this order as VOID and remove all items from the cart?"
    : "Remove all items and discounts from the cart?";

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
      }}
    >
      {/* 🔹 Open Shift modal (shown when user clicks primary with no shift) */}
      {shiftDialogOpen && (
        <FloatingShiftModal
          open={shiftDialogOpen}
          terminalId={terminalId}
          refreshLatestShift={refreshLatestShift}
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
                bgcolor: "#5e5047",
                color: "#fff",
                "& .MuiMenuItem-root": {
                  gap: 1,
                  py: 1,
                  "&:hover": { bgcolor: "#766459" },
                },
                "& .MuiListItemIcon-root, & .MuiSvgIcon-root, & .MuiTypography-root":
                  {
                    color: "#fff",
                  },
                border: `1px solid rgba(255,255,255,0.15)`,
              },
            }}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <MenuItem onClick={onClickClearOrVoid} sx={{ color: "#fff" }}>
              <ListItemIcon sx={{ color: "#fff", minWidth: 32 }}>
                <MenuIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={menuActionLabel}
                primaryTypographyProps={{
                  sx: { color: "#fff", fontWeight: 600 },
                }}
              />
            </MenuItem>
          </Menu>
        </Box>

        <Divider
          sx={{
            borderColor: alpha(sidebarContrast, 0.25),
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
            backgroundColor: alpha(sidebarContrast, 0.1),
            borderRadius: "20px",
            overflow: "hidden",
            mb: 2,
            "& .MuiToggleButton-root": {
              fontSize: "1rem",
              py: 1,
              color: "inherit",
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
          ? items.map((item) => (
              <Box
                key={item.id}
                sx={{
                  mb: 1.5,
                  backgroundColor: alpha(sidebarContrast, 0.1),
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
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      bgcolor: alpha(sidebarContrast, 0.2),
                      borderRadius: "20px",
                      overflow: "hidden",
                      ml: "auto",
                      mt: 1,
                    }}
                  >
                    {(() => {
                      const qty = item.quantity ?? 1;
                      const baseQty = lockedBaseQty[item.id] || 0;
                      const lockedForThisItem =
                        qty <= baseQty && baseQty > 0;

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
            ))
          : items.map((item) => (
              <Box
                key={item.id}
                sx={{
                  mb: 1.5,
                  backgroundColor: alpha(sidebarContrast, 0.1),
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
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                    mt: 1,
                  }}
                >
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      bgcolor: alpha(sidebarContrast, 0.2),
                      borderRadius: "20px",
                      overflow: "hidden",
                    }}
                  >
                    {(() => {
                      const qty = item.quantity ?? 1;
                      const baseQty = lockedBaseQty[item.id] || 0;
                      const lockedForThisItem =
                        qty <= baseQty && baseQty > 0;

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
            ))}
      </Box>

      {/* Summary */}
      <Box sx={{ bgcolor: alpha(sidebarContrast, 0.1), p: 1.5 }}>
        <Row label="Sub Total" value={PHP(subtotal)} />
        {/* Interactive Discount Card (no border, no icon) */}
        <Box
          onClick={openDiscountPicker}
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            py: 1,
            px: 1.5,
            mb: 1,
            backgroundColor: alpha(sidebarContrast, 0.08),
            borderRadius: 1,
            cursor:
              discountChoices.length && !discountLoadError
                ? "pointer"
                : "default",
            "&:hover":
              discountChoices.length && !discountLoadError
                ? {
                    backgroundColor: alpha(sidebarContrast, 0.15),
                    transform: "translateY(-1px)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  }
                : {},
            transition: "all 0.2s ease",
            opacity:
              discountChoices.length && !discountLoadError ? 1 : 0.6,
          }}
        >
          <Typography sx={{ fontWeight: 600, color: sidebarContrast }}>
            Discounts{" "}
            {discountSuffix && (
              <Typography
                component="span"
                sx={{
                  ml: 0.5,
                  fontSize: "0.85em",
                  color: sidebarContrast,
                  fontWeight: 600,
                }}
              >
                {discountSuffix}
              </Typography>
            )}
          </Typography>

          <Typography sx={{ fontWeight: 700 }}>
            -{PHP(discountAmount)}
          </Typography>
        </Box>

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
                    {discountChoices.map((opt) => (
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
                    {`Table #${o.table} – ${new Date(
                      o.time
                    ).toLocaleTimeString([], {
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

      {/* Quick Discount Picker (from summary label) */}
      <Dialog
        open={pickerOpen}
        onClose={closeDiscountPicker}
        PaperProps={{ sx: { minWidth: 340 } }}
      >
        <DialogTitle>Choose Discount</DialogTitle>
        <DialogContent dividers sx={{ pt: 1.5 }}>
          {loadingDiscounts && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Loading discounts…
            </Typography>
          )}

          {discountLoadError && (
            <Typography
              variant="body2"
              color="error"
              sx={{ mb: 1 }}
            >
              {discountLoadError}
            </Typography>
          )}

          {!loadingDiscounts && !discountLoadError && (
            <FormControl fullWidth size="small">
              <Select
                value={pickerKey}
                onChange={(e) => setPickerKey(e.target.value)}
                displayEmpty
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
                {discountChoices.map((opt) => (
                  <MenuItem
                    key={opt.id ?? opt.code}
                    value={opt.code || String(opt.id)}
                  >
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
            disabled={!pickerKey}
          >
            Apply
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
              <Row
                label="Customer"
                value={summaryOrder.customer}
              />
              <Row
                label="Table"
                value={summaryOrder.table}
              />
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
          <Button variant="contained" onClick={restoreToCart}>
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

      {/* Approval PIN Dialog */}
      <Dialog
        open={pinDialogOpen}
        onClose={() => {
          setPinDialogOpen(false);
          setPinDigits(Array(6).fill(""));
          setPinError("");
          setPinVisible(false);
        }}
        PaperProps={{ sx: { minWidth: 360 } }}
      >
        <DialogTitle>
          <Typography variant="h6" component="span">
            Approval Required
          </Typography>
          <Typography
            variant="body2"
            sx={{ opacity: 0.7 }}
          >
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
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
            >
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
                    value={
                      pinVisible ? digit : digit ? "•" : ""
                    }
                    onChange={(e) => {
                      const raw =
                        e.target.value.replace(/\D/g, "");
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
                      "aria-label": `PIN digit ${
                        idx + 1
                      }`,
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
                onClick={() =>
                  setPinVisible((prev) => !prev)
                }
              >
                {pinVisible ? (
                  <VisibilityOutlinedIcon />
                ) : (
                  <VisibilityOffOutlinedIcon />
                )}
              </IconButton>
            </Stack>

            <Typography
              variant="caption"
              sx={{ opacity: 0.7 }}
            >
              Use a 6-digit numeric PIN.
            </Typography>

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
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            disabled={
              pinDigits.some((d) => !d) || isPinChecking
            }
            onClick={async () => {
              const pin = pinDigits.join("");
              if (pin.length !== 6) return;

              setIsPinChecking(true);
              setPinError("");

              try {
                const base = API_BASE || "";
                const url = base
                  ? `${base}/menu/cart/verify-pin`
                  : "/api/menu/cart/verify-pin";

                const res = await fetch(url, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  credentials: "include",
                  body: JSON.stringify({ pin }),
                });

                const data = await res.json();

                if (!data.ok) {
                  setPinError(data.error || "Invalid PIN");
                  setIsPinChecking(false);
                  return;
                }

                // SUCCESS → open normal confirm dialog
                setIsPinChecking(false);
                setPinDialogOpen(false);
                setPinDigits(Array(6).fill(""));
                setPinVisible(false);
                openSafely(setConfirmOpen);
              } catch (err) {
                setIsPinChecking(false);
                setPinError("Server error");
              }
            }}
          >
            {isPinChecking ? "Checking…" : "Confirm"}
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