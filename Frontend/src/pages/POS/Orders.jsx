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
      // use 2-decimal comparison to avoid float weirdness
      if (Number(candidateAmount.toFixed(2)) === Number(target.toFixed(2))) {
        candidates.push({ name: it.name, qty: q });
      }
    }
  });

  // Only use it if we have exactly one clear match
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

  // 🔹 NEW: get current open shift from ShiftContext
  const { hasShift, shiftId: currentShiftId } = useShift() || {};
  const shiftId = hasShift && currentShiftId ? Number(currentShiftId) : 0;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // 🔹 If no open shift -> clear and stop
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
        const query = `/history?shiftId=${encodeURIComponent(shiftId)}`;
        const url = ordersApi(query);
        const res = await fetch(url, { credentials: "include" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.ok === false) {
          throw new Error(
            data.error || `Failed to load orders (${res.status})`
          );
        }

        const mapped = (data.orders || []).map((o) => {
          const dt = o.closedAt ? new Date(o.closedAt) : new Date();
          const orderTypeCode =
            String(o.orderType || "").toLowerCase() === "take-out" ? "TO" : "DI";

          const receiptId = `#${o.shiftId}_${orderTypeCode}-${o.id}`;

          // 🔍 Try to infer refunded item from items + refund amount
          const inferred = inferRefundItem(o.items || [], o.refundAmount || 0);
          const refundItemName = inferred?.name || "";
          const refundQty = inferred?.qty || 0;

          return {
            id: o.id,
            shiftId: o.shiftId,
            status: o.status,
            receiptId,
            amount: o.netAmount,
            refundAmount: o.refundAmount || 0,
            refundItemName,
            refundQty,
            timeLabel: dt.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            }),
            recipient: o.customerName || "Walk-in",
            employee: o.employee || "",
            items: o.items || [],
            payment: o.paymentSummary || "Unknown",
            datetimeLabel: dt.toLocaleString(),
            raw: o,
          };
        });

        if (!cancelled) {
          setReceipts(mapped);

          // pick previously-selected order from URL if present
          const urlOrderId = params.get("orderId");
          const byUrl =
            urlOrderId &&
            mapped.find((r) => String(r.id) === String(urlOrderId));

          const nextSelected = byUrl || mapped[0] || null;

          setSelectedReceipt(nextSelected);

          // keep URL in sync (keep shiftId for clarity)
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
  }, [hasShift, shiftId, params, setParams]);

  const handleSelectReceipt = (receipt) => {
    setSelectedReceipt(receipt);
    const next = new URLSearchParams(params);
    next.set("orderId", receipt.id);
    if (shiftId) next.set("shiftId", String(shiftId));
    setParams(next, { replace: true });
  };

  const handleRefundSelected = () => {
    if (!selectedReceipt || !hasShift || !shiftId) return; // 🔹 guard
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

  const statusLabel = (status, refundAmount = 0) => {
    if (!status) return "—";
    const s = String(status).toLowerCase();

    if (s === "refunded") return "Refunded";

    if (s === "paid" && refundAmount > 0) {
      // still "paid" but with a refund
      return "Paid (Refunded)";
    }

    if (s === "paid") return "Paid";
    if (s === "voided") return "Voided";
    return status;
  };

  const orderTypeLabel = (selectedReceipt?.raw?.orderType || "Order")
    .replace(/_/g, " ");

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
        {/* No open shift message */}
        {!hasShift || !shiftId ? (
          <Typography sx={{ px: 2, py: 3, opacity: 0.9 }}>
            No open shift detected. Open a shift to view paid orders.
          </Typography>
        ) : (
          <>
            {loading && !receipts.length && (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <CircularProgress
                  size={24}
                  sx={{ color: t.palette.primary.main }}
                />
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
                  receipt.status === "refunded" || receipt.refundAmount > 0;

                return (
                  <Box key={receipt.id}>
                    <ListItemButton
                      onClick={() => handleSelectReceipt(receipt)}
                      selected={isSelected}
                      sx={{
                        alignItems: "start",
                        color: sidebarText,
                        "&:hover": {
                          bgcolor: sidebarHover,
                        },
                        "&.Mui-selected": {
                          bgcolor: sidebarSelectedBg,
                          color: sidebarSelectedText,
                          "&:hover": {
                            bgcolor: sidebarSelectedBg,
                          },
                        },
                      }}
                    >
                      <Box width="100%">
                        {/* Row 1: amount + receipt id */}
                        <Box
                          display="flex"
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <Typography component="span">
                            {PHP(receipt.amount)}
                          </Typography>
                          <Typography component="span" fontWeight="bold">
                            {receipt.receiptId}
                          </Typography>
                        </Box>

                        {/* Row 2: time + refunded tag */}
                        <Box
                          display="flex"
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{ mt: 0.25 }}
                        >
                          <Typography fontSize="0.875rem">
                            {receipt.timeLabel}
                          </Typography>

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
                                  : alpha(t.palette.success.main, 0.12),
                              }}
                            >
                              Refunded
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </ListItemButton>

                    <Divider
                      sx={{ borderColor: alpha(t.palette.grey[800], 0.12) }}
                    />
                  </Box>
                );
              })}
            </List>
          </>
        )}
      </Box>

      {/* Receipt area (Cashier-style card) */}
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
              bgcolor: alpha(t.palette.primary.light, 0.08),
              boxShadow: "none",
            }}
          >
            <Stack spacing={2}>
              {/* Top total */}
              <Box textAlign="center">
                <Typography
                  variant="h4"
                  fontWeight="bold"
                  sx={{ mb: 0.5 }}
                >
                  {PHP(selectedReceipt.amount)}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ textTransform: "uppercase", letterSpacing: 1 }}
                >
                  TOTAL
                </Typography>
              </Box>

              <Divider />

              {/* Basic info */}
              <Stack spacing={0.75}>
                <Detail
                  label="Recipient:"
                  value={selectedReceipt.recipient || "Walk-in"}
                />
                <Detail
                  label="Time:"
                  value={selectedReceipt.timeLabel || ""}
                />
                <Detail
                  label="Employee:"
                  value={selectedReceipt.employee || "—"}
                />
                <Detail
                  label="Status:"
                  value={statusLabel(
                    selectedReceipt.status,
                    selectedReceipt.refundAmount
                  )}
                />
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              {/* Order type + items */}
              <Typography
                fontWeight="bold"
                sx={{ textTransform: "capitalize" }}
              >
                {orderTypeLabel}
              </Typography>

              <Stack spacing={1}>
                {selectedReceipt.items.map((it, idx) => {
                  const qty = Number(it.qty || 1);
                  const price = Number(it.price || 0);
                  const lineTotal = qty * price;
                  return (
                    <Box key={`${it.id || idx}-${idx}`} sx={{ mt: 0.5 }}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography>{it.name}</Typography>
                        <Typography>{PHP(lineTotal)}</Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        sx={{ opacity: 0.7, ml: 0.5 }}
                      >
                        {qty} × {PHP(price)}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              {/* Totals + payment */}
              <Stack spacing={0.75}>
                <Detail
                  label="Total"
                  value={PHP(selectedReceipt.amount)}
                />

                {selectedReceipt.refundAmount > 0 &&
                  selectedReceipt.refundItemName && (
                    <Detail
                      label="Item refunded:"
                      value={`${selectedReceipt.refundItemName}${
                        selectedReceipt.refundQty
                          ? ` x${selectedReceipt.refundQty}`
                          : ""
                      }`}
                      color={t.palette.error.main}
                    />
                  )}

                {selectedReceipt.refundAmount > 0 && (
                  <Detail
                    label="Refunded:"
                    value={`- ${PHP(selectedReceipt.refundAmount)}`}
                    color={t.palette.error.main}
                  />
                )}

                <Detail
                  label="Payment:"
                  value={selectedReceipt.payment || "—"}
                />
              </Stack>

              {/* Footer date + receipt id */}
              <Box
                sx={{
                  mt: 2,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.875rem",
                }}
              >
                <Typography>{selectedReceipt.datetimeLabel}</Typography>
                <Typography fontWeight="bold">
                  {selectedReceipt.receiptId}
                </Typography>
              </Box>
            </Stack>
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