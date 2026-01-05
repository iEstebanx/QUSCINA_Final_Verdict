// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/Charge.jsx
import { useMemo, useState, useEffect } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { alpha, useTheme } from "@mui/material/styles";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useCart } from "@/context/CartContext";
import { useShift } from "@/context/ShiftContext";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/utils/apiBase";

const PHP = (n) => `₱${Number(n).toFixed(2)}`;

const fmtQty = (n) => {
  const x = Math.round((Number(n) || 0) * 100) / 100; // keep up to 2 decimals
  const s = x.toFixed(2);
  return s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1"); // 8.00->8, 8.50->8.5
};

// 🔹 Helper for Backoffice POS /pos/orders API
const posOrdersApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;

  // Local dev proxied at /api
  if (!base) return `/api/pos/orders${clean}`;
  if (base.endsWith("/api")) return `${base}/pos/orders${clean}`;
  return `${base}/api/pos/orders${clean}`;
};

// 🔹 Helper for Backoffice POS payment types API
const posPaymentTypesApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;
  if (!base) return `/api/pos/payment-types${clean}`;
  if (base.endsWith("/api")) return `${base}/pos/payment-types${clean}`;
  return `${base}/api/pos/payment-types${clean}`;
};

function LeftSummary({ orderType, customerName }) {
  const t = useTheme();
  const cart = useCart() || {};
  const items = cart.items || [];
  const discounts = cart.discounts || [];

  // ✅ use what CartContext already computes
  const itemDisc = Number(cart.itemDiscountAmount || 0);

  const subtotal = items.reduce(
    (s, i) => s + (Number(i.price) || 0) * (i.quantity ?? 1),
    0
  );

  // ✅ order-level percent (same logic style you used elsewhere)
  const orderPct = discounts.reduce((a, d) => a + (Number(d?.percent) || 0), 0);

  const afterItem = Math.max(0, subtotal - itemDisc);
  const orderDisc = (afterItem * Math.max(0, orderPct)) / 100;

  const total = Math.max(0, subtotal - itemDisc - orderDisc);

  return (
    <Box
      sx={{
        width: 320,
        bgcolor: t.palette.secondary.main,
        color: t.palette.getContrastText(t.palette.secondary.main),
        height: "100%",
        minHeight: 0,
        p: 2,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Chip
        label={orderType}
        sx={{
          alignSelf: "flex-start",
          px: 2,
          borderRadius: 999,
          bgcolor: alpha("#fff", 0.15),
          color: "inherit",
          fontWeight: 700,
        }}
      />

      <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, opacity: 0.9 }}>
        Recipient:
      </Typography>
      <Typography variant="h6" sx={{ mb: 1 }}>
        {customerName || "Walk-in"}
      </Typography>

      <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
        Date:
      </Typography>
      <Typography sx={{ mb: 1, fontWeight: 700 }}>
        {new Date().toLocaleDateString()}
      </Typography>

      <Divider sx={{ my: 1, borderColor: alpha("#fff", 0.25) }} />

      <Stack spacing={1} sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
        {items.map((i) => {
          const qty = i.quantity ?? 1;
          const price = Number(i.price) || 0;
          const lineGross = price * qty;

          const disc = cart.itemDiscounts?.[String(i.id)];
          const pct = disc ? Math.max(0, Number(disc.percent) || 0) : 0;
          const discAmt = (lineGross * pct) / 100;

          return (
            <Box key={i.id}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 1,
                }}
              >
                <Typography sx={{ fontWeight: 600 }}>
                  {i.name}
                  <Typography component="span" sx={{ opacity: 0.85, ml: 0.5 }}>
                    x {qty}
                  </Typography>
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>{PHP(lineGross)}</Typography>
              </Box>

              {disc && pct > 0 && (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    pl: 2,
                    mt: 0.25,
                  }}
                >
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>
                    − {disc.name} ({pct}%)
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    − {PHP(discAmt)}
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}

        {discounts.length > 0 && (
          <>
            <Divider
              sx={{
                my: 0.5,
                borderStyle: "dashed",
                borderColor: alpha("#fff", 0.35),
              }}
            />
            {discounts.map((d, idx) => (
              <Box key={idx} sx={{ display: "grid", gridTemplateColumns: "1fr auto" }}>
                <Typography sx={{ fontWeight: 600 }}>{d.name}</Typography>
                <Typography sx={{ fontWeight: 700 }}>
                  - {PHP((subtotal * (Number(d?.percent) || 0)) / 100)}
                </Typography>
              </Box>
            ))}
          </>
        )}
      </Stack>

      <Divider sx={{ my: 1, borderColor: alpha("#fff", 0.25) }} />

      <Stack spacing={0.5}>
        <Row label="Order Discounts" value={`-${PHP(orderDisc)}`} />
        <Row label="Item Discounts" value={`-${PHP(itemDisc)}`} />
        <Row label="Total" value={PHP(total)} bold />
      </Stack>
    </Box>
  );
}

function Row({ label, value, bold }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <Typography sx={{ fontWeight: bold ? 700 : 600 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: bold ? 800 : 700 }}>
        {value}
      </Typography>
    </Box>
  );
}

const LS_ORDER_TYPE = "orderType";
const LS_CHARGE_CUSTOMER = "bo_draft_charge_customer";

export default function Charge() {
  const t = useTheme();
  const nav = useNavigate();
  const { state } = useLocation(); // { orderType, orderId, customerName, tableNo }
  const [params, setParams] = useSearchParams();

  const cart = useCart() || {};
  const items = cart.items || [];
  const discounts = cart.discounts || [];

  const itemDiscounts = cart.itemDiscounts || {};
  const itemDiscountAmount = cart.itemDiscountAmount || 0;

  const clearCart = cart.clearCart || (() => {});
  const clearDiscounts = cart.clearDiscounts || (() => {});
  const clearItemDiscounts = cart.clearItemDiscounts || (() => {});

  const { shift } = useShift();
  const { user } = useAuth();

  const orderType =
    state?.orderType ||
    localStorage.getItem(LS_ORDER_TYPE) ||
    "Dine-in";

  // 🔹 Shift/terminal/employee context for Backoffice POS
  const rawShift = shift?.shift || shift?.data || shift || null;

  const shiftId = Number(
    rawShift?.shift_id ||
      localStorage.getItem("last_shift_id") ||
      0
  );

  const terminalId =
    rawShift?.terminal_id ||
    localStorage.getItem("terminal_id") ||
    "BACKOFFICE-POS";

  const employeeId =
    user?.employeeId ||
    user?.employee_id ||
    user?.id ||
    localStorage.getItem("employee_id") ||
    "UNKNOWN";

  const orderIdFromState = state?.orderId || null;

  const [custOpen, setCustOpen] = useState(false);
  const [custErr, setCustErr] = useState("");
  const [invWarnOpen, setInvWarnOpen] = useState(false);
  const [invWarn, setInvWarn] = useState({
    problems: [],
  });

  const [chargeCustName, setChargeCustName] = useState(() => {
    // priority: navigation state → saved draft → empty (force ask)
    const fromState = String(state?.customerName || "").trim();
    if (fromState) return fromState;

    try {
      const fromLS = String(localStorage.getItem(LS_CHARGE_CUSTOMER) || "").trim();
      return fromLS || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    // if state brings a name, persist it as draft
    const fromState = String(state?.customerName || "").trim();
    if (!fromState) return;

    setChargeCustName(fromState);
    try {
      localStorage.setItem(LS_CHARGE_CUSTOMER, fromState);
    } catch {}
  }, [state?.customerName]);

  const customerName = String(chargeCustName || "").trim() || "Walk-in";

  const tableNo = state?.tableNo || "-";
  const [activeOrderId, setActiveOrderId] = useState(orderIdFromState);

  const [gcashRefOpen, setGcashRefOpen] = useState(false);
  const [gcashRef, setGcashRef] = useState("");
  const [gcashRefErr, setGcashRefErr] = useState("");

  const [changeWarnOpen, setChangeWarnOpen] = useState(false);
  const [changeWarn, setChangeWarn] = useState({
    required: 0,
    drawerCashBefore: 0,
    cashReceivedThis: 0,
    available: 0,
  });

  const totalDue = useMemo(() => {
    const sub = items.reduce(
      (s, i) => s + (Number(i.price) || 0) * (i.quantity ?? 1),
      0
    );

    const itemDisc = Number(itemDiscountAmount) || 0;

    const pct = discounts.reduce((a, d) => a + (Number(d?.percent) || 0), 0);

    const afterItem = Math.max(0, sub - itemDisc);
    const orderDisc = (afterItem * Math.max(0, pct)) / 100;

    return Math.max(0, sub - itemDisc - orderDisc);
  }, [items, discounts, itemDiscountAmount]);

  // Split mode via query param (?split=1) – same idea as Cashier
  const [splitReceipt, setSplitReceipt] = useState(null);
  const splitOn = params.get("split") === "1";
  const [mode, setMode] = useState(splitOn ? "split" : "single");
  useEffect(() => {
    setMode(splitOn ? "split" : "single");
  }, [splitOn]);

  // Flow state & amounts
  const [step, setStep] = useState("charge"); // "charge" | "paid" | "paid_split_1" | "paid_split_2"
  const [method1, setMethod1] = useState("");
  const [amount1, setAmount1] = useState("");
  const [method2, setMethod2] = useState("");
  const [amount2, setAmount2] = useState("");

  // 🔹 Payment methods from Backoffice POS /pos/payment-types
  const [methods, setMethods] = useState([]);
  const [loadingMethods, setLoadingMethods] = useState(true);

  useEffect(() => {
    const loadPaymentMethods = async () => {
      try {
        const res = await fetch(posPaymentTypesApi(""), {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json().catch(() => null);

        // Backend returns an array: [{ id, name, sort_order }, ...]
        const rows = Array.isArray(data)
          ? data
          : Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data?.[0])
          ? data[0]
          : [];

        const list = rows.map((r) => r.name).filter(Boolean);

        // Prefer Cash first, then GCash, then others
        const weight = (name) => {
          const n = String(name).toLowerCase();
          if (n === "cash") return 0;
          if (n === "gcash") return 1;
          return 2;
        };

        const sorted = [...list].sort((a, b) => {
          const wa = weight(a);
          const wb = weight(b);
          if (wa !== wb) return wa - wb;
          return a.localeCompare(b);
        });

        setMethods(sorted);

        const cashMethod = sorted.find(
          (m) => m.toLowerCase() === "cash"
        );
        const gcashMethod = sorted.find(
          (m) => m.toLowerCase() === "gcash"
        );

        // Default methods if nothing selected yet
        setMethod1((prev) =>
          prev || cashMethod || gcashMethod || sorted[0] || ""
        );
        setMethod2((prev) =>
          prev ||
          gcashMethod ||
          cashMethod ||
          sorted[1] ||
          sorted[0] ||
          ""
        );
      } catch (err) {
        console.error("[POS Charge] Failed to load payment methods", err);
        setMethods([]);
      } finally {
        setLoadingMethods(false);
      }
    };

    loadPaymentMethods();
  }, [setMethod1, setMethod2]);

  const [singleReceipt, setSingleReceipt] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSlot, setConfirmSlot] = useState(1);
  const [pendingSlot, setPendingSlot] = useState(1);

  const [gcashConfirmOpen, setGcashConfirmOpen] = useState(false);
  const [slot1Charged, setSlot1Charged] = useState(false);
  const [slot2Charged, setSlot2Charged] = useState(false);

  const [isPosting, setIsPosting] = useState(false);

  // Back button lock flag (AppHeader reads this)
  const lockBack = useMemo(() => {
    // single: lock after successful sale (paid screen)
    if (mode === "single" && step === "paid") return true;

    // split: lock after first payment is paid
    if (mode === "split" && slot1Charged) return true;

    return false;
  }, [mode, step, slot1Charged]);

  useEffect(() => {
    const next = new URLSearchParams(params);

    if (lockBack) next.set("backlock", "1");
    else next.delete("backlock");

    if (next.toString() !== params.toString()) {
      setParams(next, { replace: true });
    }
  }, [lockBack, params, setParams]);

  // Reset slot states when switching modes
  useEffect(() => {
    if (mode === "split") {
      setSlot1Charged(false);
      setSlot2Charged(false);
    } else {
      setStep("charge");
    }
  }, [mode]);

  const paid1 = Number(amount1) || 0;
  const paid2 = Number(amount2) || 0;

  const singleShort = mode === "single" && paid1 > 0 && paid1 < totalDue;

  const [paidSoFar, setPaidSoFar] = useState(0);

  const remainingDue = Math.max(0, totalDue - paidSoFar);

  // due before confirming each slot (split)
  const remainingBefore1 = remainingDue;
  const remainingBefore2 = remainingDue; // because paidSoFar updates after slot1 success

  const remainingSplit = remainingDue;

  const fullyPaid = paidSoFar >= totalDue;
  const saleLocked = mode === "split" && fullyPaid;

  const confirmPaid = confirmSlot === 1 ? paid1 : paid2;

  const confirmDue =
    mode === "single"
      ? totalDue
      : Math.max(0, totalDue - paidSoFar);

  const confirmChange = Math.max(0, confirmPaid - confirmDue);

  // minimum required amounts
  const minFor1 = 0;
  const minFor2 = slot1Charged ? remainingDue : 0;

  // cents helpers (avoid float issues)
  const toCents = (n) => Math.round((Number(n) || 0) * 100);
  const centsToPHP = (c) => (Number(c || 0) / 100);

  // in split mode, slot 1 must leave at least ₱0.01 for slot 2
  const MIN_REMAINING_AFTER_SLOT1_CENTS = 100;

  const remainingC = toCents(remainingDue);
  const paid1C = toCents(paid1);
  const paid2C = toCents(paid2);

  // max allowed for slot 1 (so slot 2 is never useless)
  const maxSlot1C = Math.max(0, remainingC - MIN_REMAINING_AFTER_SLOT1_CENTS);
  const maxSlot1 = centsToPHP(maxSlot1C);

  // slot1 invalid if it would fully settle remaining
  const slot1OverMax =
    mode === "split" && !slot1Charged && !saleLocked && paid1 > 0 && paid1C > maxSlot1C;

  const slot1Short = minFor1 > 0 && paid1 > 0 && paid1 < minFor1;
  const slot2Short = minFor2 > 0 && paid2 > 0 && paid2 < minFor2;

  const topBarRight =
    step === "charge" && mode === "split" ? `Remaining ${PHP(remainingSplit)}` : "";

  const resetToMenu = () => {
      try {
        localStorage.removeItem("currentOrderId");
      } catch {}

      // ✅ clear customer draft on NEW SALE
      setChargeCustName("");
      try { localStorage.removeItem(LS_CHARGE_CUSTOMER); } catch {}

      // unlock back when starting a new sale
      try {
        const next = new URLSearchParams(params);
        next.delete("backlock");
        setParams(next, { replace: true });
      } catch {}

      nav("/pos/menu", { replace: true });
      setTimeout(() => {
        clearDiscounts();
        clearItemDiscounts();
        clearCart();
      }, 0);
  };

  const ensureCustomerName = (slot) => {
    setPendingSlot(slot);
    const name = String(chargeCustName || "").trim();
    if (name) return true;
    setCustErr("Customer name is required.");
    setCustOpen(true);
    return false;
  };

  const saveCustomerDraft = () => {
    const name = String(chargeCustName || "").trim();
    if (!name) {
      setCustErr("Customer name is required.");
      return false;
    }
    setCustErr("");
    try {
      localStorage.setItem(LS_CHARGE_CUSTOMER, name);
    } catch {}
    setCustOpen(false);
    return true;
  };

  const handleCharge = (slot = 1) => {
    if (mode === "single") {
      if (paid1 < totalDue) return;
      setSingleReceipt({
        paid: Math.min(paid1, totalDue),
        change: Math.max(0, paid1 - totalDue),
      });
      setStep("paid");
      return;
    }

    if (slot === 1 && slot1Short) return;
    if (slot === 2 && slot2Short) return;

    setStep(`paid_split_${slot}`);
  };

  // Auto-ensure method2 differs from method1 when in split mode
  useEffect(() => {
    if (mode !== "split") return;
    if (slot2Charged || saleLocked) return;
    if (!methods.length) return;

    const primary = method1 || methods[0];
    const alternative =
      methods.find((m) => m !== primary) || primary;

    setMethod2((prev) => {
      if (!prev || prev === primary) {
        return alternative;
      }
      return prev;
    });
  }, [mode, methods, method1, slot2Charged, saleLocked]);

  // 🔹 Backend settle (Backoffice /pos/orders/charge)
  const settleSale = async (slot, extra = {}) => {
    if (isPosting) return;
    if (!shiftId) {
      window.alert(
        "No open shift. Please open a POS shift before charging."
      );
      return;
    }

    const isSlot1 = slot === 1;
    const paidThis = isSlot1 ? paid1 : paid2;
    const method = isSlot1 ? method1 : method2;

    if (mode === "split" && slot === 1) {
      const remainingBefore = Math.max(0, totalDue - paidSoFar);
      // leave at least ₱0.01 for slot 2
      const remainingBeforeC = toCents(remainingBefore);
      const paidThisC = toCents(paidThis);

      if (paidThisC > remainingBeforeC - MIN_REMAINING_AFTER_SLOT1_CENTS) {
        window.alert(
          `Split payment: the first payment must be partial. Please leave at least ${PHP(
            centsToPHP(MIN_REMAINING_AFTER_SLOT1_CENTS)
          )} for the second payment.`
        );
        return;
      }
    }

    if (paidThis <= 0) return;

    setIsPosting(true);
    try {
      const paidBeforeThis = paidSoFar;
      const willBeFullyPaid = paidBeforeThis + paidThis >= totalDue;
      const totalPaidSoFar = paidBeforeThis;

      const payments = [
        {
          slot,
          methodName: method,
          amount: paidThis,
          gcashLast4:
            method.toLowerCase() === "gcash"
              ? extra.gcashLast4 || null
              : null,
        },
      ];

      const payload = {
        shiftId,
        terminalId,
        employeeId,
        orderId: activeOrderId,
        orderType,
        customerName,
        tableNo,
        items: items.map((i) => {
          const qty = i.quantity ?? 1;
          const price = Number(i.price) || 0;
          const lineGross = price * qty;

          const disc = itemDiscounts?.[String(i.id)];
          const pct = disc ? Math.max(0, Number(disc.percent) || 0) : 0;
          const dAmt = (lineGross * pct) / 100;

          return {
            id: i.id,
            name: i.name,
            price,
            qty,
            discountName: disc?.name || null,
            discountPercent: pct,
            discountAmount: dAmt,
          };
        }),
        discounts: discounts.map((d) => ({
          name: d.name,
          percent: Number(d.percent) || 0,
        })),
        mode, // "single" | "split"
        totalDue,
        payments,
        isFinalPayment: willBeFullyPaid,
        totalPaidSoFar,
      };

      const res = await fetch(posOrdersApi("/charge"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        // ✅ existing change handling
        if (res.status === 409 && data?.code === "INSUFFICIENT_CHANGE") {
          setChangeWarn({
            required: Number(data.requiredChange) || 0,
            drawerCashBefore: Number(data.drawerCashBefore) || 0,
            cashReceivedThis: Number(data.cashReceivedThis) || 0,
            available: Number(data.availableCashForChange) || 0,
          });
          setChangeWarnOpen(true);
          return;
        }

        // ✅ NEW: inventory handling
        if (res.status === 409 && data?.code === "INSUFFICIENT_INVENTORY") {
          setInvWarn({
            problems: Array.isArray(data?.problems) ? data.problems : [],
          });
          setInvWarnOpen(true);
          return;
        }

        throw new Error(data?.error || `Checkout failed (${res.status})`);
      }

      const dueBefore = Math.max(0, totalDue - paidBeforeThis);
      const change = Math.max(0, paidThis - dueBefore);

      setSplitReceipt({
        slot,
        dueBefore,
        paid: paidThis,
        change,
      });

      setPaidSoFar(paidBeforeThis + paidThis);

      if (data.orderId) {
        setActiveOrderId(data.orderId);
      }

      if (willBeFullyPaid && data.orderId) {
        window.open(
          `/pos/print/${data.orderId}`,
          "_blank",
          "width=420,height=600"
        );
      }

      // Original flow
      handleCharge(slot);

      if (mode === "split") {
        if (isSlot1) setSlot1Charged(true);
        else setSlot2Charged(true);
      }
    } catch (err) {
      console.error("[Backoffice POS] settleSale error", err);
      window.alert(err.message || "Failed to checkout order");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      <LeftSummary orderType={orderType} customerName={customerName} />

      {/* Right workspace */}
      <Box
        sx={{
          flex: 1,
          p: 2,
          height: "100%",
          minHeight: 0,
          overflow: "auto",
        }}
      >
        {/* Top bar */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            mb: 1.5,
          }}
        >
          <span />
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, textAlign: "center" }}
          >
            Orders
          </Typography>
          <Typography sx={{ fontWeight: 700 }}>
            {topBarRight}
          </Typography>
        </Box>

        {/* SINGLE: CHARGE screen */}
        {mode === "single" && step === "charge" && (
          <Box sx={{ maxWidth: 560, mx: "auto", mt: 6 }}>
            <Typography
              variant="h3"
              sx={{ fontWeight: 800, textAlign: "center" }}
            >
              {PHP(totalDue)}
            </Typography>
            <Typography
              sx={{ textAlign: "center", opacity: 0.8, mb: 4 }}
            >
              Total amount due
            </Typography>

            <GridRow>
              <Field label="Payment Method">
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={method1}
                    onChange={(e) => setMethod1(e.target.value)}
                    disabled={loadingMethods}
                  >
                    {methods.map((m) => (
                      <MenuItem key={m} value={m}>
                        {m}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Field>

              <Field label="Cash received">
                <TextField
                  value={amount1}
                  onChange={(e) =>
                    setAmount1(
                      e.target.value.replace(/[^\d.]/g, "")
                    )
                  }
                  error={singleShort}
                  helperText={
                    singleShort
                      ? `Must be at least ${PHP(totalDue)}`
                      : " "
                  }
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        ₱
                      </InputAdornment>
                    ),
                  }}
                />
              </Field>

              <Button
                variant="contained"
                onClick={() => {
                  if (!ensureCustomerName(1)) return;
                  setConfirmSlot(1);
                  setConfirmOpen(true);
                }}
                disabled={paid1 < totalDue}
                sx={{ minWidth: 120, fontWeight: 800 }}
              >
                CHARGE
              </Button>
            </GridRow>
          </Box>
        )}

        {/* SINGLE: PAID */}
        {mode === "single" && step === "paid" && (
          <PaidScreen
            leftLabel="Total Paid"
            leftValue={PHP(singleReceipt?.paid ?? Math.min(paid1, totalDue))}
            rightLabel="Change"
            rightValue={PHP(singleReceipt?.change ?? Math.max(0, paid1 - totalDue))}
            cta="NEW SALE"
            onCta={resetToMenu}
          />
        )}

        {/* SPLIT: dashboard */}
        {mode === "split" && step === "charge" && (
          <Box sx={{ maxWidth: 720, mx: "auto", mt: 6 }}>
            <Typography
              variant="h3"
              sx={{ fontWeight: 800, textAlign: "center" }}
            >
              {PHP(remainingSplit || totalDue)}
            </Typography>
            <Typography
              sx={{ textAlign: "center", opacity: 0.8, mb: 4 }}
            >
              {remainingSplit > 0
                ? "Remaining amount"
                : "Fully paid"}
            </Typography>

            {/* SLOT 1 */}
            <GridRow>
              <Field label="Payment Method">
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={method1}
                    onChange={(e) => setMethod1(e.target.value)}
                    disabled={
                      loadingMethods || slot1Charged || saleLocked
                    }
                  >
                    {methods.map((m) => (
                      <MenuItem key={m} value={m}>
                        {m}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Field>
              <Field label="Cash received">
                <TextField
                  value={amount1}
                  onChange={(e) =>
                    setAmount1(
                      e.target.value.replace(/[^\d.]/g, "")
                    )
                  }
                  disabled={slot1Charged || saleLocked || (mode === "split" && remainingC <= MIN_REMAINING_AFTER_SLOT1_CENTS)}
                  error={slot1Short || slot1OverMax}
                  helperText={
                    slot1Charged || saleLocked
                      ? "This payment is already marked as PAID."
                      : slot1OverMax
                      ? `Split payment: Payment 1 must be less than the total.`
                      : slot1Short
                      ? `Must be at least ${PHP(minFor1)}`
                      : minFor1 > 0
                      ? `Final slot must pay ≥ ${PHP(minFor1)}`
                      : " "
                  }
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        ₱
                      </InputAdornment>
                    ),
                  }}
                />
              </Field>

              {!slot1Charged ? (
                <Button
                  variant="contained"
                  onClick={() => {
                    if (!ensureCustomerName(1)) return;
                    setConfirmSlot(1);
                    setConfirmOpen(true);
                  }}
                  disabled={!paid1 || slot1Short || slot1OverMax}
                >
                  CHARGE
                </Button>
              ) : (
                <PaidBadge />
              )}
            </GridRow>

            {/* SLOT 2 */}
            <GridRow sx={{ mt: 2 }}>
              <Field label="Payment Method">
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={method2}
                    onChange={(e) => setMethod2(e.target.value)}
                    disabled // always locked; auto-set
                  >
                    {methods.map((m) => (
                      <MenuItem key={m} value={m}>
                        {m}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Field>

              <Field label="Cash received">
                <TextField
                  value={amount2}
                  onChange={(e) =>
                    setAmount2(
                      e.target.value.replace(/[^\d.]/g, "")
                    )
                  }
                  disabled={
                    !slot1Charged || slot2Charged || saleLocked
                  }
                  error={slot2Short}
                  helperText={
                    !slot1Charged
                      ? "Charge the first payment before adding the second."
                      : slot2Charged || saleLocked
                      ? "This payment is already marked as PAID."
                      : slot2Short
                      ? `Must be at least ${PHP(minFor2)}`
                      : minFor2 > 0
                      ? `Final slot must pay ≥ ${PHP(minFor2)}`
                      : " "
                  }
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        ₱
                      </InputAdornment>
                    ),
                  }}
                />
              </Field>

              {!slot2Charged ? (
                <Button
                  variant="contained"
                  onClick={() => {
                    if (!ensureCustomerName(2)) return;
                    setConfirmSlot(2);
                    setConfirmOpen(true);
                  }}
                  disabled={!slot1Charged || !paid2 || slot2Short}
                >
                  CHARGE
                </Button>
              ) : (
                <PaidBadge />
              )}
            </GridRow>

            {fullyPaid && (
              <Button
                variant="contained"
                fullWidth
                sx={{
                  mt: 4,
                  maxWidth: 420,
                  mx: "auto",
                  fontWeight: 800,
                }}
                onClick={resetToMenu}
              >
                NEW SALE
              </Button>
            )}
          </Box>
        )}

        {/* SPLIT: Slot PAID screens */}
        {mode === "split" &&
          (step === "paid_split_1" ||
            step === "paid_split_2") && (
            <PaidScreen
              leftLabel="Paid"
              leftValue={PHP(splitReceipt?.paid ?? (step.endsWith("_1") ? paid1 : paid2))}
              rightLabel="Change"
              rightValue={PHP(splitReceipt?.change ?? 0)}
              cta="CONTINUE"
              onCta={() => {
                setStep("charge");
              }}
            />
          )}
      </Box>

      {/* Confirm Payment Dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 2,
            minWidth: 400,
          },
        }}
      >
        <DialogTitle
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            pb: 2,
            textAlign: "center",
            fontWeight: 700,
            fontSize: "1.25rem",
          }}
        >
          Confirm Payment
        </DialogTitle>

        <DialogContent sx={{ py: 3 }}>
          <Stack spacing={2.5}>
            <Box sx={{ textAlign: "center", py: 1 }}>
              <Typography variant="subtitle2">
                {mode === "split" ? "Remaining Amount" : "Total Amount Due"}
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  color: "primary.main",
                  fontSize: "1.5rem",
                }}
              >
                {PHP(confirmDue)}
              </Typography>
            </Box>

            <Divider sx={{ my: 1 }} />

            <Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 1,
                }}
              >
                <Typography
                  variant="body1"
                  sx={{ fontWeight: 600 }}
                >
                  Cash Received
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: 700 }}
                >
                  {PHP(confirmPaid)}
                </Typography>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 1,
                  backgroundColor:
                    confirmChange > 0
                      ? "success.50"
                      : "transparent",
                  borderRadius: 1,
                  px: 1,
                }}
              >
                <Typography
                  variant="body1"
                  sx={{ fontWeight: 600 }}
                >
                  Change
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 800,
                    color:
                      confirmChange > 0
                        ? "success.main"
                        : "text.primary",
                  }}
                >
                  {PHP(confirmChange)}
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                backgroundColor: "grey.50",
                borderRadius: 1,
                p: 2,
                mt: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block",
                }}
              >
                Payment Method
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600 }}
              >
                {confirmSlot === 1 ? method1 : method2}
              </Typography>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            pb: 3,
            gap: 2,
            borderTop: 1,
            borderColor: "divider",
            pt: 2,
          }}
        >
          <Button
            onClick={() => setConfirmOpen(false)}
            variant="outlined"
            sx={{
              minWidth: 100,
              fontWeight: 600,
            }}
            disabled={isPosting}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const method =
                confirmSlot === 1 ? method1 : method2;
              if (method.toLowerCase() === "gcash") {
                setConfirmOpen(false);
                setGcashRef("");
                setGcashRefErr("");
                setGcashRefOpen(true);
              } else {
                setConfirmOpen(false);
                settleSale(confirmSlot);
              }
            }}
            sx={{
              minWidth: 100,
              fontWeight: 700,
            }}
            disabled={isPosting}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* GCash Reference Dialog */}
      <Dialog
        open={gcashRefOpen}
        onClose={() => setGcashRefOpen(false)}
        PaperProps={{ sx: { minWidth: 380, borderRadius: 2 } }}
      >
        <DialogTitle
          sx={{
            pb: 1.5,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          Enter Last 4 Digits
        </DialogTitle>

        <DialogContent dividers sx={{ py: 2 }}>
          <Typography
            variant="body2"
            sx={{ mb: 1.5, textAlign: "center" }}
          >
            Please input the <strong>last 4 digits</strong> of the
            GCash reference number from the sender’s payment
            screen.
          </Typography>

          <TextField
            fullWidth
            placeholder="e.g. 4821"
            value={gcashRef}
            onChange={(e) => {
              const v = e.target.value
                .replace(/\D/g, "")
                .slice(0, 4);
              setGcashRef(v);
              setGcashRefErr("");
            }}
            error={Boolean(gcashRefErr)}
            helperText={gcashRefErr || " "}
            inputProps={{
              maxLength: 4,
              inputMode: "numeric",
              pattern: "[0-9]*",
              style: {
                letterSpacing: "4px",
                textAlign: "center",
                fontWeight: 700,
                fontSize: "1.25rem",
              },
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 2, gap: 1.5 }}>
          <Button
            variant="outlined"
            onClick={() => setGcashRefOpen(false)}
            sx={{ minWidth: 110 }}
            disabled={isPosting}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            sx={{ minWidth: 140, fontWeight: 700 }}
            onClick={() => {
              if (gcashRef.length !== 4) {
                setGcashRefErr("Please enter exactly 4 digits.");
                return;
              }
              setGcashRefOpen(false);
              setGcashConfirmOpen(true);
            }}
            disabled={isPosting}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* GCash final confirmation */}
      <Dialog
        open={gcashConfirmOpen}
        onClose={() => setGcashConfirmOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 2,
            minWidth: 420,
          },
        }}
      >
        <DialogTitle
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            pb: 1.5,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          GCash Payment Received?
        </DialogTitle>

        <DialogContent sx={{ py: 2.5 }}>
          <Typography
            variant="body2"
            sx={{ mb: 1.5, textAlign: "center" }}
          >
            Please confirm that the{" "}
            <strong>GCash payment has been fully received</strong>{" "}
            on your device or merchant account.
          </Typography>

          <Typography
            variant="body2"
            sx={{ textAlign: "center", opacity: 0.8 }}
          >
            Once you continue, this order will be marked as{" "}
            <strong>PAID via GCash</strong>.
          </Typography>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            pb: 2.5,
            pt: 1.5,
            gap: 1.5,
          }}
        >
          <Button
            variant="outlined"
            onClick={() => setGcashConfirmOpen(false)}
            sx={{ minWidth: 110, fontWeight: 600 }}
            disabled={isPosting}
          >
            Not Yet
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              setGcashConfirmOpen(false);
              await settleSale(confirmSlot, {
                gcashLast4: gcashRef,
              });
            }}
            sx={{ minWidth: 140, fontWeight: 700 }}
            disabled={isPosting}
          >
            Yes, Payment Received
          </Button>
        </DialogActions>
      </Dialog>

      {/* NEW: Insufficient Inventory Dialog */}
      <Dialog
        open={invWarnOpen}
        onClose={() => setInvWarnOpen(false)}
        PaperProps={{ sx: { minWidth: 520, borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, textAlign: "center" }}>
          Not Enough Stock
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography sx={{ textAlign: "center", opacity: 0.9 }}>
              You can’t charge this order because some items exceed the available inventory.
            </Typography>

            {(!invWarn.problems || invWarn.problems.length === 0) ? (
              <Typography variant="body2" sx={{ textAlign: "center", opacity: 0.8 }}>
                Please review your cart quantities and try again.
              </Typography>
            ) : (
              <Box sx={{ mt: 1 }}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 120px",
                    gap: 1,
                    px: 1,
                    py: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography sx={{ fontWeight: 800 }}>Inventory</Typography>
                  <Typography sx={{ fontWeight: 800, textAlign: "right" }}>
                    Needed
                  </Typography>
                  <Typography sx={{ fontWeight: 800, textAlign: "right" }}>
                    In Stock
                  </Typography>
                </Box>

                {invWarn.problems.map((p, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 120px",
                      gap: 1,
                      px: 1,
                      py: 0.75,
                      borderBottom: 1,
                      borderColor: "divider",
                    }}
                  >
                    <Typography sx={{ fontWeight: 700 }}>
                      {p.invName || p.name || `#${p.invId}`}
                    </Typography>
                    <Typography sx={{ textAlign: "right", fontWeight: 700 }}>
                      {fmtQty(p.required)}
                    </Typography>
                    <Typography sx={{ textAlign: "right", fontWeight: 800 }}>
                      {fmtQty(p.currentStock)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            <Typography variant="body2" sx={{ opacity: 0.8, textAlign: "center" }}>
              Adjust the cart quantity (or restock) then try charging again.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 2.5, py: 2, gap: 1 }}>
          <Button
            variant="contained"
            onClick={() => setInvWarnOpen(false)}
            sx={{ fontWeight: 800 }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* NEW: Insufficient Change Dialog */}
      <Dialog
        open={changeWarnOpen}
        onClose={() => setChangeWarnOpen(false)}
        PaperProps={{ sx: { minWidth: 420, borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, textAlign: "center" }}>
          Insufficient Cash for Change
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography sx={{ textAlign: "center", opacity: 0.9 }}>
              You don’t have enough cash in the drawer to give change for this cash payment.
            </Typography>

              <Box sx={{ mt: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>Required change</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{PHP(changeWarn.required)}</Typography>
                </Box>

                <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>Cash in drawer (before)</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{PHP(changeWarn.drawerCashBefore)}</Typography>
                </Box>

                <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>Cash received (this payment)</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{PHP(changeWarn.cashReceivedThis)}</Typography>
                </Box>

                {/* optional */}
                <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>Total available for change</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{PHP(changeWarn.available)}</Typography>
                </Box>
              </Box>

            <Typography variant="body2" sx={{ opacity: 0.8, textAlign: "center" }}>
              Do a <strong>Cash In</strong> (or use another payment method) then try again.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 2.5, py: 2 }}>
          <Button
            variant="contained"
            onClick={() => setChangeWarnOpen(false)}
            sx={{ fontWeight: 800 }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={custOpen}
        onClose={() => setCustOpen(false)}
        PaperProps={{ sx: { minWidth: 420, borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, textAlign: "center" }}>
          Customer Name
        </DialogTitle>

        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1.5, textAlign: "center", opacity: 0.85 }}>
            Enter the customer name for this receipt.
          </Typography>

          <TextField
            autoFocus
            fullWidth
            value={chargeCustName}
            onChange={(e) => {
              setChargeCustName(e.target.value);
              setCustErr("");
            }}
            placeholder="e.g. Juan Dela Cruz"
            error={Boolean(custErr)}
            helperText={custErr || " "}
          />
        </DialogContent>

        <DialogActions sx={{ px: 2.5, py: 2, gap: 1.5 }}>
          <Button variant="outlined" onClick={() => setCustOpen(false)} disabled={isPosting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!saveCustomerDraft()) return;
              // after saving name, continue the flow:
              setConfirmSlot(pendingSlot);
              setConfirmOpen(true);
            }}
            sx={{ fontWeight: 800 }}
            disabled={isPosting}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

/* ---------- helpers ---------- */
function GridRow({ children, sx }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr auto auto",
        alignItems: "center",
        gap: 2,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
function Field({ label, children }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}
function PaidBadge() {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography sx={{ fontWeight: 800 }}>PAID</Typography>
      <CheckCircleOutlineIcon color="success" />
    </Stack>
  );
}
function PaidScreen({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  cta,
  onCta,
}) {
  return (
    <Box sx={{ maxWidth: 720, mx: "auto", mt: 10 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr",
          alignItems: "center",
          textAlign: "center",
          gap: 3,
        }}
      >
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            {leftValue}
          </Typography>
          <Typography sx={{ mt: 0.5, opacity: 0.85 }}>
            {leftLabel}
          </Typography>
        </Box>
        <Divider orientation="vertical" flexItem />
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            {rightValue}
          </Typography>
          <Typography sx={{ mt: 0.5, opacity: 0.85 }}>
            {rightLabel}
          </Typography>
        </Box>
      </Box>

      <Button
        variant="contained"
        onClick={onCta}
        sx={{
          display: "block",
          mx: "auto",
          mt: 6,
          px: 8,
          fontWeight: 800,
        }}
      >
        {cta}
      </Button>
    </Box>
  );
}