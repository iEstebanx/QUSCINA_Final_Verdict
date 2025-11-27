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
import { useSearchParams } from "react-router-dom";
import { API_BASE } from "@/utils/apiBase";

const PHP = (n) => `₱${Number(n || 0).toFixed(2)}`;

const ordersApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;

  // Local dev: Backoffice is usually proxied to /api
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
  // Optional: allow shiftId to come from URL (?shiftId=123)
  const shiftId = Number(params.get("shiftId") || 0);

  const sidebarContrast =
    t.palette.secondary.contrastText ??
    t.palette.getContrastText(t.palette.secondary.main);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const query = shiftId
          ? `/history?shiftId=${encodeURIComponent(shiftId)}`
          : "/history";

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

          return {
            id: o.id,
            shiftId: o.shiftId,
            status: o.status,
            receiptId,
            amount: o.netAmount,
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

          // keep URL in sync (preserve shiftId if present)
          if (nextSelected) {
            const nextParams = new URLSearchParams(params);
            nextParams.set("orderId", nextSelected.id);
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
  }, [shiftId, params, setParams]);

  // When user clicks a receipt, also update ?orderId=...
  const handleSelectReceipt = (receipt) => {
    setSelectedReceipt(receipt);
    const next = new URLSearchParams(params);
    next.set("orderId", receipt.id);
    setParams(next, { replace: true });
  };

  const handleRefundSelected = () => {
    if (!selectedReceipt) return;

    // Pass full order + items via navigation state
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

  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        height: "100%",               // fill the POSLayout main area
        bgcolor: theme.palette.background.default,
      })}
    >
      {/* Sidebar */}
      <Box
        sx={{
          width: 300,
          bgcolor: t.palette.secondary.main,
          color: sidebarContrast,
          borderRight: `1px solid ${alpha(sidebarContrast, 0.18)}`,
          overflowY: "auto",
          py: 2,
          height: "calc(100vh - 64px)", // Fixed height: viewport height minus header
          position: "sticky",
          top: 64, // Stick below the header
        }}
      >
        {loading && !receipts.length && (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <CircularProgress size={24} sx={{ color: sidebarContrast }} />
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
            No paid orders found.
          </Typography>
        )}

        <List>
          {receipts.map((receipt) => {
            const isSelected = selectedReceipt?.id === receipt.id;
            return (
              <Box key={receipt.id}>
                <ListItemButton
                  onClick={() => handleSelectReceipt(receipt)}
                  selected={isSelected}
                  sx={{
                    alignItems: "start",
                    color: "inherit",
                    "&:hover": {
                      bgcolor: alpha(sidebarContrast, 0.12),
                    },
                    "&.Mui-selected": {
                      bgcolor: t.palette.primary.main,
                      color: t.palette.getContrastText(
                        t.palette.primary.main
                      ),
                      "&:hover": {
                        bgcolor: t.palette.primary.main,
                      },
                    },
                  }}
                >
                  <Box width="100%">
                    <Box display="flex" justifyContent="space-between">
                      <Typography component="span">
                        {PHP(receipt.amount)}
                      </Typography>

                      <Box component="span" sx={{ textAlign: "right" }}>
                        <Typography component="span" fontWeight="bold">
                          {receipt.receiptId}
                        </Typography>
                        {receipt.status === "refunded" && (
                          <Typography
                            component="div"
                            fontSize="0.7rem"
                            fontWeight="bold"
                            sx={{ mt: 0.25 }}
                          >
                            (REFUNDED)
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Typography fontSize="0.875rem">
                      {receipt.timeLabel}
                    </Typography>
                  </Box>
                </ListItemButton>
                <Divider sx={{ borderColor: alpha(sidebarContrast, 0.2) }} />
              </Box>
            );
          })}
        </List>
      </Box>

      {/* Receipt */}
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
              bgcolor: t.palette.background.paper,
              px: 4,
              py: 3,
              width: "100%",
              maxWidth: 500,
              color: t.palette.text.primary,
              boxShadow: "none",
            }}
          >
            <Typography variant="h4" fontWeight="bold" align="center">
              {PHP(selectedReceipt.amount)}
            </Typography>

            {selectedReceipt.status === "refunded" ? (
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

            <Stack spacing={1}>
              <Detail
                label="Recipient:"
                value={selectedReceipt.recipient}
              />
              <Detail
                label="Time:"
                value={selectedReceipt.timeLabel}
              />
              <Detail
                label="Employee:"
                value={selectedReceipt.employee}
              />
              <Detail
                label="Status:"
                value={
                  selectedReceipt.status === "refunded"
                    ? "Refunded"
                    : "Paid"
                }
              />
            </Stack>

            <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

            <Typography fontWeight="bold" mb={1}>
              {selectedReceipt.raw.orderType || "Dine-in"}
            </Typography>

            <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

            {selectedReceipt.items.map((item, index) => (
              <Box key={index} mb={1}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography>{item.name}</Typography>
                  <Typography fontWeight="bold">
                    {PHP((item.qty || 1) * (item.price || 0))}
                  </Typography>
                </Stack>
                <Typography fontSize="0.875rem">
                  {item.qty} x {PHP(item.price || 0)}
                </Typography>
              </Box>
            ))}

            <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

            <Stack direction="row" justifyContent="space-between">
              <Typography fontWeight="bold">Total</Typography>
              <Typography fontWeight="bold">
                {PHP(selectedReceipt.amount)}
              </Typography>
            </Stack>

            <Stack direction="row" justifyContent="space-between">
              <Typography>Payment:</Typography>
              <Typography>{selectedReceipt.payment}</Typography>
            </Stack>

            <Divider sx={{ borderColor: t.palette.divider, my: 2 }} />

            <Stack
              direction="row"
              justifyContent="space-between"
              fontSize="0.9rem"
            >
              <Typography>{selectedReceipt.datetimeLabel}</Typography>
              <Typography fontWeight="bold">
                {selectedReceipt.receiptId}
              </Typography>
            </Stack>
          </Paper>
        ) : (
          <Typography sx={{ mt: 8, opacity: 0.7 }}>
            Select a receipt on the left.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

const Detail = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between">
    <Typography>{label}</Typography>
    <Typography fontWeight="bold">{value}</Typography>
  </Stack>
);