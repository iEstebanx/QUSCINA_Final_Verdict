// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/Orders.jsx
import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  List,
  ListItemButton,
  Divider,
  Paper,
  Stack,
  CircularProgress,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useSearchParams, useNavigate } from "react-router-dom";
import { API_BASE } from "@/utils/apiBase";
import { useShift } from "@/context/ShiftContext";

const PHP = (n) => `₱${Number(n || 0).toFixed(2)}`;

// fallback helper (if backend only sends refundAmount)
const inferRefundItem = (items = [], refundAmount = 0) => {
  const target = Number(refundAmount || 0);
  if (!target || !items.length) return null;

  const candidates = [];
  items.forEach((it) => {
    const price = Number(it.price || 0);
    const qty = Number(it.qty || 0);
    if (!price || !qty) return;

    for (let q = 1; q <= qty; q++) {
      const candidateAmount = price * q;
      if (Number(candidateAmount.toFixed(2)) === Number(target.toFixed(2))) {
        candidates.push({ name: it.name, qty: q });
      }
    }
  });

  if (candidates.length === 1) return candidates[0];
  return null;
};

const ordersApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;
  if (!base) return `/api/pos/orders${clean}`;
  if (base.endsWith("/api")) return `${base}/pos/orders${clean}`;
  return `${base}/api/pos/orders${clean}`;
};

const sumOrderPercent = (list) =>
  (Array.isArray(list) ? list : []).reduce((sum, d) => {
    // tolerate different backend shapes
    const pct =
      Number(d?.percent) ||
      Number(d?.value) || // some schemas use value for percent discounts
      Number(d?.discountPercent) ||
      Number(d?.discount_percent) ||
      0;
    return sum + Math.max(0, pct);
  }, 0);

export default function POSOrdersPage() {
  const [receipts, setReceipts] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const t = useTheme();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const sidebarBg = t.palette.background.paper;
  const sidebarText = t.palette.text.primary;
  const sidebarBorder = alpha(t.palette.grey[800], 0.14);
  const sidebarHover = alpha(t.palette.grey[800], 0.08);
  const sidebarSelectedBg = t.palette.primary.main;
  const sidebarSelectedText = t.palette.getContrastText(sidebarSelectedBg);

  // current open shift from ShiftContext
  const { hasShift, shiftId: currentShiftId, shiftNo: currentShiftNo } =
    useShift() || {};
  const shiftId = hasShift && currentShiftId ? Number(currentShiftId) : 0;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!hasShift || !shiftId) {
        setReceipts([]);
        setSelectedReceipt(null);
        setLoadError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");
      try {
        const url = ordersApi(`/history?shiftId=${encodeURIComponent(shiftId)}`);
        const res = await fetch(url, { credentials: "include" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `Failed to load orders (${res.status})`);
        }

        const mapped = (data.orders || []).map((o) => {
          const dt = o.closedAt ? new Date(o.closedAt) : new Date();

          const orderTypeCode =
            String(o.orderType || "").toLowerCase() === "take-out" ? "TO" : "DI";

          // tolerate different backend key names
          const shiftCodeRaw = o.shiftCode || o.shift_code || "";
          const shiftLabel =
            (shiftCodeRaw
              ? String(shiftCodeRaw).toUpperCase().replace("SHIFT_", "S")
              : "") ||
            currentShiftNo ||
            `S${o.shiftId || ""}` ||
            "S?";

          const orderNo = o.orderNo ?? o.order_no ?? o.id;
          const receiptId = `#${shiftLabel}_${orderTypeCode}-${orderNo}`;

          const items = o.items || [];

          // ---- Cashier-style totals ----
          const grossAmount = items.reduce((sum, it) => {
            const qty = Number(it.qty) || 1;
            const price = Number(it.price) || 0;
            return sum + price * qty;
          }, 0);

          // per-item discount total (supports multiple backend shapes)
          const itemDiscTotal = items.reduce((sum, it) => {
            const qty = Number(it.qty) || 1;
            const price = Number(it.price) || 0;
            const lineGross = price * qty;

            const amt =
              Number(it.discountAmount) ||
              Number(it.itemDiscountAmount) ||
              Number(it.discount_amount) ||
              Number(it.item_discount_amount) ||
              0;

            const pct =
              Number(it.discountPercent) ||
              Number(it.itemDiscountPercent) ||
              Number(it.discount_percent) ||
              Number(it.item_discount_percent) ||
              0;

            const computed = amt > 0 ? amt : (lineGross * Math.max(0, pct)) / 100;
            return sum + computed;
          }, 0);

          // order-level discounts (percent list) ✅ AFTER item discounts (matches backend)
          const orderDiscounts = o.discounts || o.appliedDiscounts || [];
          const orderPct = sumOrderPercent(orderDiscounts);

          const afterItem = Math.max(0, grossAmount - itemDiscTotal);
          const orderDiscTotal = (afterItem * Math.max(0, orderPct)) / 100;

          // total discount: prefer header net relation (source of truth)
          const net = Number(o.netAmount ?? o.net_amount ?? 0) || 0;
          const totalDiscFromHeader = Math.max(0, grossAmount - net);

          // If header is missing/zero, fall back to computed breakdown
          const totalDisc =
            net > 0 ? totalDiscFromHeader : Math.max(0, itemDiscTotal + orderDiscTotal);

          // ---- Refund breakdown ----
          const refundedItems = Array.isArray(o.refundedItems)
            ? o.refundedItems
            : Array.isArray(o.refunded_items)
            ? o.refunded_items
            : [];

          let refundedTotal =
            Number(o.refundedTotal ?? o.refunded_total ?? 0) ||
            Number(o.refundAmount ?? o.refund_amount ?? 0) ||
            0;

          if (refundedTotal > 0 && refundedItems.length === 0) {
            const inferred = inferRefundItem(items, refundedTotal);
            if (inferred) {
              const price =
                Number(items?.find((x) => x.name === inferred.name)?.price || 0) ||
                0;
              refundedItems.push({
                name: inferred.name,
                qty: inferred.qty,
                amount: Number((price * inferred.qty).toFixed(2)),
              });
            }
          }

          return {
            id: o.id,
            orderNo,
            shiftId: o.shiftId,
            status: o.status,
            receiptId,

            // amount shown as net
            amount: o.netAmount ?? o.net_amount ?? 0,

            timeLabel: dt.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            }),
            recipient: o.customerName || "Walk-in",
            employee: o.employee || "",
            items,
            payment: o.paymentSummary || "Unknown",
            datetimeLabel: dt.toLocaleString(),

            // cashier-style totals
            grossAmount,
            itemDiscTotal,
            orderDiscTotal,
            totalDisc,
            orderDiscounts,

            refundedItems,
            refundedTotal,

            raw: o,
          };
        });

        if (!cancelled) {
          setReceipts(mapped);

          const urlOrderId = params.get("orderId");
          const byUrl =
            urlOrderId && mapped.find((r) => String(r.id) === String(urlOrderId));

          const nextSelected = byUrl || mapped[0] || null;
          setSelectedReceipt(nextSelected);

          if (nextSelected) {
            const nextParams = new URLSearchParams(params);
            nextParams.set("orderId", nextSelected.id);
            nextParams.set("shiftId", String(shiftId));
            setParams(nextParams, { replace: true });
          }
        }
      } catch (err) {
        console.error("[POSOrdersPage] load history failed", err);
        if (!cancelled) setLoadError(err.message || "Failed to load orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [hasShift, shiftId, params, setParams, currentShiftNo]);

  const handleSelectReceipt = (receipt) => {
    setSelectedReceipt(receipt);
    const next = new URLSearchParams(params);
    next.set("orderId", receipt.id);
    if (shiftId) next.set("shiftId", String(shiftId));
    setParams(next, { replace: true });
  };

  const handleRefundSelected = () => {
    if (!selectedReceipt || !hasShift || !shiftId) return;
    navigate("/pos/refund", {
      state: {
        orderId: selectedReceipt.id,
        order: {
          ...selectedReceipt.raw,
          id: selectedReceipt.id,
          shiftId: selectedReceipt.shiftId,
          orderType: selectedReceipt.raw.orderType,
          items: selectedReceipt.items,
          paymentSummary: selectedReceipt.payment,
        },
      },
    });
  };

  const statusLabel = (status, refundedTotal = 0) => {
    const s = String(status || "").toLowerCase();
    if (s === "refunded") return "Refunded";
    if (refundedTotal > 0) return "Paid (Partially Refunded)";
    if (s === "paid") return "Paid";
    if (s === "voided") return "Voided";
    return status || "—";
  };

  const orderTypeLabel = (selectedReceipt?.raw?.orderType || "Order").replace(
    /_/g,
    " "
  );

  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        height: "100%",
        bgcolor: theme.palette.background.default,
      })}
    >
      {/* Sidebar */}
      <Box
        sx={{
          width: 300,
          bgcolor: sidebarBg,
          color: sidebarText,
          borderRight: `1px solid ${sidebarBorder}`,
          overflowY: "auto",
          py: 2,
          height: "calc(100vh - 64px)",
          position: "sticky",
          top: 64,
        }}
      >
        {!hasShift || !shiftId ? (
          <Typography sx={{ px: 2, py: 3, opacity: 0.9 }}>
            No open shift detected. Open a shift to view paid orders.
          </Typography>
        ) : (
          <>
            {loading && !receipts.length && (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <CircularProgress size={24} sx={{ color: t.palette.primary.main }} />
                <Typography sx={{ mt: 1 }}>Loading orders…</Typography>
              </Box>
            )}

            {loadError && !receipts.length && (
              <Typography sx={{ px: 2, py: 3, opacity: 0.9 }}>
                {loadError}
              </Typography>
            )}

            {!loading && receipts.length === 0 && !loadError && (
              <Typography sx={{ px: 2, py: 3, opacity: 0.8 }}>
                No paid orders found for this shift.
              </Typography>
            )}

            <List>
              {receipts.map((receipt) => {
                const isSelected = selectedReceipt?.id === receipt.id;
                const isRefunded =
                  String(receipt.status || "").toLowerCase() === "refunded" ||
                  receipt.refundedTotal > 0;

                return (
                  <Box key={receipt.id}>
                    <ListItemButton
                      onClick={() => handleSelectReceipt(receipt)}
                      selected={isSelected}
                      sx={{
                        alignItems: "start",
                        color: sidebarText,
                        "&:hover": { bgcolor: sidebarHover },
                        "&.Mui-selected": {
                          bgcolor: sidebarSelectedBg,
                          color: sidebarSelectedText,
                          "&:hover": { bgcolor: sidebarSelectedBg },
                        },
                      }}
                    >
                      <Box width="100%">
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography component="span">{PHP(receipt.amount)}</Typography>
                          <Typography component="span" fontWeight="bold">
                            {receipt.receiptId}
                          </Typography>
                        </Box>

                        <Box
                          display="flex"
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{ mt: 0.25 }}
                        >
                          <Typography fontSize="0.875rem">{receipt.timeLabel}</Typography>

                          {receipt.refundedTotal > 0 && (
                            <Typography
                              fontSize="0.75rem"
                              sx={{ color: t.palette.error.main }}
                            >
                              Refund {PHP(receipt.refundedTotal)}
                            </Typography>
                          )}

                          {isRefunded && (
                            <Typography
                              component="div"
                              fontSize="0.7rem"
                              sx={{
                                px: 0.75,
                                py: 0.15,
                                borderRadius: 999,
                                fontWeight: "bold",
                                bgcolor: isSelected
                                  ? alpha(sidebarSelectedText, 0.16)
                                  : alpha(t.palette.error.main, 0.12),
                                color: isSelected ? "inherit" : t.palette.error.main,
                              }}
                            >
                              REFUNDED
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </ListItemButton>

                    <Divider sx={{ borderColor: alpha(t.palette.grey[800], 0.12) }} />
                  </Box>
                );
              })}
            </List>
          </>
        )}
      </Box>

      {/* Receipt area */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          bgcolor: t.palette.background.default,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          py: 4,
        }}
      >
        {selectedReceipt ? (
          <Paper
            elevation={3}
            sx={{
              width: "100%",
              maxWidth: 520,
              px: 4,
              py: 3,
              borderRadius: 4,
              bgcolor: t.palette.background.paper,
              boxShadow: "none",
            }}
          >
            {/* Top total */}
            <Typography variant="h4" fontWeight="bold" align="center">
              {PHP(selectedReceipt.amount)}
            </Typography>

            {String(selectedReceipt.status || "").toLowerCase() === "refunded" ? (
              <Typography
                align="center"
                fontWeight="bold"
                sx={{ mt: 1 }}
                color="error"
              >
                REFUNDED
              </Typography>
            ) : (
              <Typography align="center" fontWeight="bold" mt={1}>
                TOTAL
              </Typography>
            )}

            <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

            {/* Basic info */}
            <Stack spacing={1}>
              <Detail label="Recipient:" value={selectedReceipt.recipient} />
              <Detail label="Time:" value={selectedReceipt.timeLabel} />
              <Detail label="Employee:" value={selectedReceipt.employee || "—"} />
              <Detail
                label="Status:"
                value={statusLabel(selectedReceipt.status, selectedReceipt.refundedTotal)}
              />
            </Stack>

            <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

            <Typography fontWeight="bold" mb={1} sx={{ textTransform: "capitalize" }}>
              {orderTypeLabel || "Dine-in"}
            </Typography>

            <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

            {/* Items (Cashier-style with per-item discount display) */}
            {selectedReceipt.items.map((item, index) => {
              const qty = Number(item.qty) || 1;
              const price = Number(item.price) || 0;
              const lineGross = qty * price;

              const pct =
                Number(item.discountPercent) ||
                Number(item.itemDiscountPercent) ||
                Number(item.discount_percent) ||
                Number(item.item_discount_percent) ||
                0;

              const rawAmt =
                Number(item.discountAmount) ||
                Number(item.itemDiscountAmount) ||
                Number(item.discount_amount) ||
                Number(item.item_discount_amount) ||
                (lineGross * Math.max(0, pct)) / 100;

              const amt = Math.min(lineGross, Math.max(0, rawAmt));
              const hasDisc = pct > 0 || amt > 0;

              const dName =
                item.discountName ||
                item.itemDiscountName ||
                item.discount_name ||
                item.item_discount_name ||
                "Item Discount";

              return (
                <Box key={item.id || index} mb={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography>{item.name}</Typography>

                    <Stack alignItems="flex-end" spacing={0} sx={{ lineHeight: 1.1 }}>
                      {hasDisc ? (
                        <>
                          <Typography fontWeight="bold">
                            {PHP(Math.max(0, lineGross - amt))}
                          </Typography>
                          <Typography
                            fontSize="0.75rem"
                            sx={{ opacity: 0.65, textDecoration: "line-through" }}
                          >
                            {PHP(lineGross)}
                          </Typography>
                        </>
                      ) : (
                        <Typography fontWeight="bold">{PHP(lineGross)}</Typography>
                      )}
                    </Stack>
                  </Stack>

                  <Typography fontSize="0.875rem">
                    {qty} x {PHP(price)}
                  </Typography>

                  {hasDisc && (
                    <Typography fontSize="0.8rem" sx={{ opacity: 0.85 }}>
                      {dName}
                      {pct ? ` (${pct}%)` : ""} — -{PHP(amt)}
                    </Typography>
                  )}
                </Box>
              );
            })}

            {/* Refund breakdown */}
            {selectedReceipt.refundedTotal > 0 && (
              <>
                <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

                <Typography fontWeight="bold" color="error" mb={1}>
                  Refunds
                </Typography>

                {(selectedReceipt.refundedItems || []).map((rItem, idx) => (
                  <Box key={idx} mb={0.5}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography color="error">
                        {rItem.name} x {rItem.qty}
                      </Typography>
                      <Typography fontWeight="bold" color="error">
                        {PHP(rItem.amount || 0)}
                      </Typography>
                    </Stack>
                  </Box>
                ))}

                <Stack direction="row" justifyContent="space-between" mt={1}>
                  <Typography fontWeight="bold" color="error">
                    Total Refunded
                  </Typography>
                  <Typography fontWeight="bold" color="error">
                    {PHP(selectedReceipt.refundedTotal)}
                  </Typography>
                </Stack>
              </>
            )}

            <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

            {/* Totals (Cashier-style) */}
            <Stack direction="row" justifyContent="space-between">
              <Typography>Sub Total</Typography>
              <Typography>{PHP(selectedReceipt.grossAmount)}</Typography>
            </Stack>

            {selectedReceipt.totalDisc > 0 && (
              <Stack direction="row" justifyContent="space-between">
                <Typography>Discounts</Typography>
                <Typography>-{PHP(selectedReceipt.totalDisc)}</Typography>
              </Stack>
            )}

            <Stack direction="row" justifyContent="space-between">
              <Typography fontWeight="bold">Total</Typography>
              <Typography fontWeight="bold">{PHP(selectedReceipt.amount)}</Typography>
            </Stack>

            <Stack direction="row" justifyContent="space-between">
              <Typography>Payment:</Typography>
              <Typography>{selectedReceipt.payment}</Typography>
            </Stack>

            <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

            <Stack direction="row" justifyContent="space-between" fontSize="0.9rem">
              <Typography>{selectedReceipt.datetimeLabel}</Typography>
              <Typography fontWeight="bold">{selectedReceipt.receiptId}</Typography>
            </Stack>

            {/* (kept) Refund navigation hook — you can wire a button elsewhere if needed */}
            {/* handleRefundSelected(); */}
          </Paper>
        ) : (
          <Typography sx={{ mt: 8, opacity: 0.7 }}>
            {hasShift && shiftId
              ? "Select a receipt on the left."
              : "Open a shift to view receipts."}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

const Detail = ({ label, value, color, boldValue = true }) => (
  <Stack direction="row" justifyContent="space-between">
    <Typography sx={color ? { color } : undefined}>{label}</Typography>
    <Typography
      fontWeight={boldValue ? "bold" : "normal"}
      sx={color ? { color } : undefined}
    >
      {value}
    </Typography>
  </Stack>
);