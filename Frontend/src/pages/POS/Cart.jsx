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
import FloatingShiftModal, { openSafely } from "@/components/POS/FloatingShiftModal";

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

  const [invErrOpen, setInvErrOpen] = useState(false);
  const [invErr, setInvErr] = useState({
    title: "Stock limit reached",
    message: "",
    itemName: "",
  });

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

  // Helper: blur whatever is currently focused
  // (prevents focus staying on search/input when opening summary dialog)
  const blurActive = () => {
    try {
      const el = document.activeElement;
      if (el && typeof el.blur === "function") el.blur();

      if (typeof document.querySelectorAll === "function") {
        document
          .querySelectorAll(
            "input:focus, textarea:focus, [contenteditable]:focus"
          )
          .forEach((n) => n.blur?.());
      }
    } catch {
      // ignore safely
    }
  };

  // Cart uses same light paper background as the rest of the app
  const sidebarBg = t.palette.background.paper;
  const sidebarContrast = t.palette.text.primary;
  const sidebarBorder = alpha(t.palette.grey[800], 0.14);
  const softAccent = alpha(t.palette.grey[800], 0.06);
  const softAccentStrong = alpha(t.palette.grey[800], 0.12);

  const handleQtyChange = async (id, delta) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const qty = item.quantity ?? 1;
    const maxQty = Number(item.maxQty);
    const baseQty = lockedBaseQty[id] || 0;

    // 🔼 Increase → inventory-checked
    if (delta > 0) {
      // Build the NEXT cart state (what it would look like after +1)
      const nextCartItems = items.map((it) => ({
        id: it.id,
        qty:
          it.id === id
            ? (Number(it.quantity ?? 1) || 1) + 1
            : Number(it.quantity ?? 1) || 1,
      }));

      try {
        const res = await fetch(ordersApi("/check-inventory"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ items: nextCartItems }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.ok === false) {
          throw data;
        }

        // ✅ Inventory OK → commit locally
        incrementItem(id);
      } catch (e) {
        // ❌ Inventory blocked
        if (e?.code === "INSUFFICIENT_INVENTORY") {
          const itemName = item?.name || "this item";

          setInvErr({
            title: "Stock limit reached",
            itemName,
            message: `We can’t add more of "${itemName}" because the available inventory is not enough.\n\nTry reducing the quantity or update the inventory stocks in Backoffice.`,
          });

          setInvErrOpen(true);
          return;
        }

        console.error("[Cart] inventory check failed", e);
        window.alert("Failed to check inventory. Please try again.");
      }

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
    
    blurActive();
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
    blurActive();
    openSafely(setNewOrderConfirmOpen);
  };
  const cancelNewOrder = () => setNewOrderConfirmOpen(false);
  const confirmNewOrder = () => {
    clearDiscounts();
    clearItemDiscounts();
    clearCart();

    setChargeCustName("");
    try { localStorage.removeItem("draft_charge_customer"); } catch {}

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

    setChargeCustName("");
    try { localStorage.removeItem("draft_charge_customer"); } catch {}

    setReflecting(null);
    setLockedBaseQty({});
    setConfirmOpen(false);
  };

  const confirmTitle = "Clear Order";
  const confirmBody = "Remove all items and discounts from the cart?";

  // ✅ Instant charge customer name (for NEW cart -> Charge)
  const [chargeNameOpen, setChargeNameOpen] = useState(false);
  const [chargeCustName, setChargeCustName] = useState(() => {
    try {
      return localStorage.getItem("draft_charge_customer") || "";
    } catch {
      return "";
    }
  });
  const [chargeNameTouched, setChargeNameTouched] = useState(false);

  // ✅ Instant Charge Summary (step 2)
  const [chargeSummaryOpen, setChargeSummaryOpen] = useState(false);

  // ✅ Reset helper (same idea as Cashier POS)
  const resetInstantCharge = () => {
    setChargeCustName("");
    setChargeNameTouched(false);
    setChargeNameOpen(false);
    setChargeSummaryOpen(false);
    try { localStorage.removeItem("draft_charge_customer"); } catch {}
  };

  // ✅ Close handlers (do NOT reset, just close)
  const closeChargeNameDialog = () => {
    setChargeNameOpen(false);
    setChargeNameTouched(false);
  };

  const closeChargeSummaryDialog = () => {
    setChargeSummaryOpen(false);
  };

  // ✅ Cancel handler (this one DOES reset)
  const cancelInstantCharge = () => {
    resetInstantCharge();
  };

  const chargeNameError = (() => {
    const nm = chargeCustName.trim();
    if (!nm) return "Customer name is required";
    if (nm.length < 3) return "Minimum 3 characters";
    if (/\d/.test(nm)) return "Digits are not allowed";
    return "";
  })();

  const commitDraftChargeName = (val) => {
    setChargeCustName(val);
    try { localStorage.setItem("draft_charge_customer", val); } catch {}
  };

  // --- Pending order dialog -----------------------------------------------
  const [pendingOpen, setPendingOpen] = useState(false);
  const [custName, setCustName] = useState("");
  const [tableNo, setTableNo] = useState("");

  const [nameTouched, setNameTouched] = useState(false);
  const [tableTouched, setTableTouched] = useState(false);

  const [showAllTables, setShowAllTables] = useState(false);

  const TABLE_COUNT = 20;

  const getTableCount = () => {
    const n = Number(TABLE_COUNT);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const occupiedTables = useMemo(() => {
    const occ = new Set();

    (openOrders || []).forEach((o) => {
      const st = String(o?.status || "").toLowerCase();
      const tb = String(o?.table ?? o?.tableNo ?? "").trim();
      if (!tb) return;
      if (st === "pending" || st === "open") occ.add(tb);
    });

    // numeric sort "1,2,10" correctly
    return Array.from(occ).sort((a, b) => Number(a) - Number(b));
  }, [openOrders]);

  const availableTableNumbers = useMemo(() => {
    const count = getTableCount();
    const occ = new Set(occupiedTables);

    return Array.from({ length: count }, (_, i) => String(i + 1)).filter((n) => !occ.has(n));
  }, [occupiedTables]);

  // ✅ For "Occupied (latest)" preview (tableNo + customer + time)
  const occupiedLatest = useMemo(() => {
    const rows = (openOrders || [])
      .map((o) => {
        const st = String(o?.status || "").toLowerCase();
        if (st !== "pending" && st !== "open") return null;

        const tbRaw = o?.table ?? o?.tableNo ?? o?.table_no ?? "";
        const tb = String(tbRaw).trim();
        if (!tb) return null;

        const cust = String(o?.customer ?? o?.customerName ?? "—").trim() || "—";

        const dt = o?.time ? new Date(o.time) : null;
        const timeLabel =
          dt && !Number.isNaN(dt.getTime())
            ? dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : "";

        return {
          tableNo: tb,
          customer: cust,
          time: timeLabel,
          ts: dt ? dt.getTime() : 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.ts - a.ts); // latest first

    return rows;
  }, [openOrders]);


  const openPendingDialog = () => {
    blurActive();
    setCustName("");
    setTableNo("");
    setShowAllTables(false);
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
    if (String(orderType).toLowerCase() !== "dine-in") return "";

    const tb = String(tableNo || "").trim();
    if (!tb) return "Please select a table";

    if (occupiedTables.includes(tb)) return "Selected table is occupied";

    const hasPendingSameTable = openOrders.some(
      (o) =>
        String(o?.status ?? "pending").toLowerCase() === "pending" &&
        String(o?.table || "") === tb
    );
    if (hasPendingSameTable) return "This table already has a pending order";

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

    setChargeCustName("");
    try { localStorage.removeItem("draft_charge_customer"); } catch {}

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
    requestAnimationFrame(blurActive);
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

  // 🔹 NO SHIFT → always Open Shift
  if (!shiftId) {
    primaryLabel = "Open Shift";
  } else if (isReflectingExisting) {
    primaryLabel = isModified ? "Save" : "Open Orders";
  } else {
    primaryLabel = items.length === 0 ? "Open Orders" : "Save Order";
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

  const proceedToCharge = (finalName) => {
    navigate("/pos/charge", {
      state: {
        orderType,
        orderId: currentOrderId || null,
        customerName: finalName || currentOrder?.customer || "",
        tableNo: currentOrder?.table || "",
      },
    });
  };

  const goCharge = () => {
    if (currentOrderId) {
      return proceedToCharge(currentOrder?.customer || "");
    }

    // ✅ NEW cart -> always start fresh
    resetInstantCharge();
    openSafely(setChargeNameOpen);
  };

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
            Order
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

      {/* ✅ Instant Charge -> Customer Name*/}
      <Dialog
        open={chargeNameOpen}
        onClose={closeChargeNameDialog}
        PaperProps={{ sx: { minWidth: 400 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
          <Typography variant="h6" component="span" sx={{ flex: 1 }}>
            Customer Name
          </Typography>
          <Typography variant="subtitle2" component="span" sx={{ opacity: 0.8 }}>
            {nowLabel()}
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ pt: 1.5 }}>
          <TextField
            fullWidth
            placeholder="e.g. Juan D."
            value={chargeCustName}
            onChange={(e) => {
              const raw = e.target.value;
              const cleaned = raw.replace(/[^A-Za-z .-]/g, "");
              const limited = cleaned.slice(0, 30);
              commitDraftChargeName(limited);
            }}
            onBlur={() => setChargeNameTouched(true)}
            error={chargeNameTouched && Boolean(chargeNameError)}
            helperText={chargeNameError || " "}
            InputProps={{
              sx: { bgcolor: alpha(t.palette.common.white, 0.7), borderRadius: 1 },
              inputProps: { maxLength: 30 },
            }}
          />
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2 }}>
        <Button onClick={cancelInstantCharge} variant="outlined">
          Cancel
        </Button>

          <Button
            variant="contained"
            disabled={Boolean(chargeNameError)}
            onClick={() => {
              const finalName = chargeCustName.trim();
              if (!finalName) {
                setChargeNameTouched(true);
                return;
              }

              setChargeNameOpen(false);
              setChargeNameTouched(false);

              // ✅ Step 2: show summary dialog
              openSafely(setChargeSummaryOpen);
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* ✅ Instant Charge Summary (Step 2) */}
      <Dialog
        open={chargeSummaryOpen}
        onClose={closeChargeSummaryDialog}
        PaperProps={{ sx: { minWidth: 420 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
          <Typography variant="h6" component="span" sx={{ flex: 1 }}>
            Instant Charge Summary
          </Typography>
          <Typography variant="subtitle2" component="span" sx={{ opacity: 0.8 }}>
            {nowLabel()}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1}>
            <Row label="Customer" value={chargeCustName.trim() || "—"} />
            <Row label="Order Type" value={orderType} />
            <Divider />

            {(items || []).map((it, idx) => (
              <Row
                key={idx}
                label={`${it.name} (${it.quantity ?? 1}×${PHP(it.price || 0)})`}
                value={PHP((it.quantity ?? 1) * (it.price || 0))}
              />
            ))}

            <Divider />
            <Row label="Total" value={PHP(total)} bold />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={cancelInstantCharge} variant="outlined">
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={() => {
              const finalName = chargeCustName.trim();
              if (!finalName) {
                // If someone closed name dialog oddly, guard here.
                cancelInstantCharge();
                return;
              }

              setChargeSummaryOpen(false);
              proceedToCharge(finalName);
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Pending → Save Order */}
      <Dialog
        open={pendingOpen}
        onClose={closePendingDialog}
        PaperProps={{
          sx: {
            minWidth: 420,
            maxWidth: 520,
            width: "92vw",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
       <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
          <Typography variant="h6" component="span" sx={{ flex: 1, fontWeight: 900 }}>
            Save Order
          </Typography>
          <Typography variant="subtitle2" component="span" sx={{ opacity: 0.8 }}>
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

          {/* TABLE AVAILABILITY (Cashier-style) */}
          {String(orderType).toLowerCase() === "dine-in" && (
            <Box sx={{ mb: 1.25 }}>
              {(() => {
                const MAX_TABLE_CHIPS = 20;
                const AVAILABLE_MAX_HEIGHT = 170;

                const shownAvail = showAllTables
                  ? availableTableNumbers
                  : availableTableNumbers.slice(0, MAX_TABLE_CHIPS);

                const hasMore = availableTableNumbers.length > MAX_TABLE_CHIPS;

                return (
                  <>
                    {/* Header row: "Table Availability | Selected [Chip]" */}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                        Table Availability
                      </Typography>

                      <Typography variant="subtitle2" sx={{ opacity: 0.55 }}>
                        |
                      </Typography>

                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        Selected
                      </Typography>

                      <Chip
                        size="small"
                        label={tableNo ? `Table ${tableNo}` : "—"}
                        sx={{
                          fontWeight: 900,
                          bgcolor: tableNo
                            ? alpha(t.palette.primary.main, 0.18)
                            : alpha(t.palette.text.primary, 0.06),
                          border: `1px solid ${alpha(t.palette.text.primary, 0.18)}`,
                        }}
                      />

                      {/* keep controls subtle (optional, but won’t change the look much) */}
                      <Box sx={{ flex: 1 }} />
                      {hasMore && (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setShowAllTables((v) => !v)}
                          sx={{ textTransform: "none", fontWeight: 900, opacity: 0.8 }}
                        >
                          {showAllTables ? "Less" : "More"}
                        </Button>
                      )}
                    </Box>

                    <Typography variant="caption" sx={{ display: "block", mb: 1, opacity: 0.7 }}>
                      Tap an available table to auto-fill
                    </Typography>

                    {/* Available tables grid (numbers only) */}
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1,
                        borderRadius: 2,
                        bgcolor: alpha(t.palette.text.primary, 0.03),
                        borderColor: alpha(t.palette.text.primary, 0.12),
                        maxHeight: AVAILABLE_MAX_HEIGHT,
                        overflow: "auto",
                      }}
                    >
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
                          gap: 1,
                        }}
                      >
                        {shownAvail.map((no) => {
                          const isSelected = String(tableNo) === String(no);
                          return (
                            <Chip
                              key={no}
                              size="small"
                              clickable
                              onClick={() => {
                                setTableNo(String(no));
                                setTableTouched(true);
                              }}
                              label={String(no)} // ✅ numbers only (matches screenshot)
                              sx={{
                                width: "100%",
                                fontWeight: 900,
                                justifyContent: "center",
                                borderRadius: 999,
                                bgcolor: isSelected
                                  ? alpha(t.palette.primary.main, 0.25)
                                  : alpha(t.palette.success.main, 0.20), // ✅ “available green-ish” feel
                                border: `1px solid ${
                                  isSelected
                                    ? alpha(t.palette.primary.main, 0.50)
                                    : alpha(t.palette.success.main, 0.28)
                                }`,
                              }}
                            />
                          );
                        })}
                      </Box>
                    </Paper>

                    {/* Occupied (latest) — row style like screenshot */}
                    {occupiedLatest?.length > 0 && (
                      <Paper
                        variant="outlined"
                        sx={{
                          mt: 1.2,
                          p: 1,
                          borderRadius: 2,
                          bgcolor: alpha(t.palette.text.primary, 0.02),
                          borderColor: alpha(t.palette.text.primary, 0.10),
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 900, opacity: 0.8 }}>
                          Occupied (latest)
                        </Typography>

                        {occupiedLatest.slice(0, 1).map((x) => (
                          <Box
                            key={`${x.tableNo}-${x.time}`}
                            sx={{
                              mt: 1,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 1,
                              p: 1,
                              borderRadius: 1.5,
                              bgcolor: alpha(t.palette.text.primary, 0.03),
                            }}
                          >
                            <Typography sx={{ fontWeight: 700 }}>
                              Table #{x.tableNo}{" "}
                              <Box component="span" sx={{ fontWeight: 700, opacity: 0.8, ml: 0.5 }}>
                                {x.customer}
                              </Box>
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700, opacity: 2 }}>
                              {x.time}
                            </Typography>
                          </Box>
                        ))}
                      </Paper>
                    )}

                    {/* Keep your validation message (but don’t make it a huge red block) */}
                    {tableTouched && tableError && (
                      <Typography variant="caption" sx={{ display: "block", mt: 0.75, color: t.palette.error.main }}>
                        {tableError}
                      </Typography>
                    )}
                  </>
                );
              })()}
            </Box>
          )}

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

      {/* Inventory error dialog */}
      <Dialog
        open={invErrOpen}
        onClose={() => setInvErrOpen(false)}
        PaperProps={{ sx: { minWidth: 360 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {invErr.title}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.25}>
            {/* Main message */}
            <Typography
              sx={{
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.5,
                color: "text.primary",
              }}
            >
              We can’t add more of{" "}
              <Box component="span" sx={{ fontWeight: 800 }}>
                “{invErr.itemName}”
              </Box>{" "}
              because the available inventory is not enough.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => setInvErrOpen(false)}>
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