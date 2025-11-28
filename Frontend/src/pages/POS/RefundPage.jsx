import { useEffect, useState, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Divider,
  TextField,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { alpha } from "@mui/material/styles";
import { useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "@/utils/apiBase";

const ordersApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;
  // Backoffice POS orders route
  if (!base) return `/api/pos/orders${clean}`;
  if (base.endsWith("/api")) return `${base}/pos/orders${clean}`;
  return `${base}/api/pos/orders${clean}`;
};

// helpers for PHP formatting
const lineTotal = (item) =>
  item ? `₱ ${(Number(item.qty || 0) * Number(item.price || 0)).toFixed(2)}` : "-";

const listTotal = (items) =>
  items && items.length
    ? `₱ ${items
        .reduce(
          (sum, it) => sum + Number(it.qty || 0) * Number(it.price || 0),
          0
        )
        .toFixed(2)}`
    : "-";

export default function RefundPage() {
  const navigate = useNavigate();
  const { state } = useLocation(); // { orderId, order }

  const [order, setOrder] = useState(state?.order || null);
  const orderId = state?.orderId || state?.order?.id || null;

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // 🔹 NEW: handle ALL refundable items, not just first
  const [refundItems, setRefundItems] = useState([]); // left card list
  const [cancelItem, setCancelItem] = useState(null); // right card (single line)

  const [refundReason, setRefundReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalQty, setModalQty] = useState(1);
  const [modalTargetIndex, setModalTargetIndex] = useState(null); // which item in refundItems

  // 🔐 PIN dialog state
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDigits, setPinDigits] = useState(Array(6).fill(""));
  const [pinError, setPinError] = useState("");
  const [isPinChecking, setIsPinChecking] = useState(false);
  const pinRefs = useRef([]);
  const [pinVisible, setPinVisible] = useState(false);

  // Load order detail if not fully provided
  useEffect(() => {
    if (!orderId) return;
    if (order && order.items && order.items.length) {
      // already have detail from OrdersPage/history
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await fetch(ordersApi(`/${encodeURIComponent(orderId)}`), {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `Failed to load order (${res.status})`);
        }
        if (!cancelled) {
          setOrder(data.order);
        }
      } catch (err) {
        console.error("[Refund] load order failed", err);
        if (!cancelled) setLoadError(err.message || "Failed to load order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [orderId, order]);

  // 🔹 When order is available, initialize refundItems from ALL lines
  useEffect(() => {
    if (!order || !order.items || !order.items.length) return;

    const available = order.items
      .map((it) => {
        const qty = Number(it.remainingQty ?? it.qty ?? it.quantity ?? 1);
        const price = Number(it.price ?? it.item_price ?? 0);
        return {
          name: it.name,
          qty,
          price,
        };
      })
      .filter((it) => it.qty > 0);

    setRefundItems(available);
    setCancelItem(null);
  }, [order]);

  const handleSave = () => {
    if (modalTargetIndex == null) return;
    const source = refundItems[modalTargetIndex];
    if (!source) return;

    const qtyToMove = modalQty;
    if (qtyToMove <= 0) {
      setModalOpen(false);
      setModalTargetIndex(null);
      return;
    }

    const remainingQty = source.qty - qtyToMove;
    if (remainingQty < 0) {
      // clamp
      setModalOpen(false);
      setModalTargetIndex(null);
      return;
    }

    const moved = {
      ...source,
      qty: qtyToMove,
    };

    // update left list
    setRefundItems((prev) => {
      const next = [...prev];
      if (remainingQty > 0) {
        next[modalTargetIndex] = { ...source, qty: remainingQty };
      } else {
        next.splice(modalTargetIndex, 1);
      }
      return next;
    });

    // merge into right card if same item
    setCancelItem((prev) => {
      if (prev && prev.name === moved.name && prev.price === moved.price) {
        return {
          ...prev,
          qty: prev.qty + moved.qty,
        };
      }
      return moved;
    });

    setModalOpen(false);
    setModalTargetIndex(null);
  };

  const handleRefundBack = () => {
    if (!cancelItem) return;

    setRefundItems((prev) => {
      const idx = prev.findIndex(
        (it) => it.name === cancelItem.name && it.price === cancelItem.price
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          qty: next[idx].qty + cancelItem.qty,
        };
        return next;
      }
      return [...prev, cancelItem];
    });

    setCancelItem(null);
  };

  const handleRefundSuccess = () => {
    navigate("/pos/orders");
  };

  const handleOpenPinDialog = () => {
    if (!cancelItem || !orderId) return;
    setPinError("");
    setPinDigits(Array(6).fill(""));
    setPinVisible(false);
    setPinDialogOpen(true);
  };

  const handleClosePinDialog = () => {
    setPinDialogOpen(false);
    setPinDigits(Array(6).fill(""));
    setPinError("");
    setPinVisible(false);
  };

  const handleConfirmPin = async () => {
    const pin = pinDigits.join("");
    if (pin.length !== 6) return;

    setIsPinChecking(true);
    setPinError("");

    try {
      // 1) Verify PIN (Backoffice POS refund)
      const base = API_BASE || "";
      const url = base
        ? `${base}/pos/orders/verify-refund-pin`
        : "/api/pos/orders/verify-refund-pin";

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        setPinError(data.error || "Invalid PIN");
        setIsPinChecking(false);
        return;
      }

      // 2) After PIN OK → call refund endpoint
      if (!cancelItem || !orderId) {
        setPinError("Nothing to refund.");
        setIsPinChecking(false);
        return;
      }

      const amount =
        Number(cancelItem.qty || 0) * Number(cancelItem.price || 0);
      if (!amount || amount <= 0) {
        setPinError("Invalid refund amount.");
        setIsPinChecking(false);
        return;
      }

      // use main payment method of the order (first payment) if available
      const mainMethod =
        order && Array.isArray(order.payments) && order.payments.length
          ? order.payments[0].methodName
          : "Cash";

      const refundRes = await fetch(
        ordersApi(`/${encodeURIComponent(orderId)}/refund`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            amount,
            methodName: mainMethod,
            qty: cancelItem.qty,
            itemName: cancelItem.name,
            reason: cancelReason || refundReason || "",
          }),
        }
      );

      const refundData = await refundRes.json().catch(() => ({}));

      if (!refundRes.ok || refundData.ok === false) {
        setPinError(refundData.error || `Refund failed (${refundRes.status})`);
        setIsPinChecking(false);
        return;
      }

      // 3) Success → close dialog + go back to Orders list
      setIsPinChecking(false);
      handleClosePinDialog();
      handleRefundSuccess();
    } catch (err) {
      console.error("[Refund] error:", err);
      setIsPinChecking(false);
      setPinError("Server error");
    }
  };

  const receiptNo = order
    ? `#${order.shiftId}_${
        String(order.orderType || "").toLowerCase() === "take-out"
          ? "TO"
          : "DI"
      }-${order.id}`
    : "—";

  return (
    <Box sx={{ p: 4, display: "flex", gap: 4, justifyContent: "center" }}>
      {/* Refund Panel (left) */}
      <Paper
        sx={(t) => ({
          p: 3,
          width: 400,
          boxShadow: "none",
          bgcolor: alpha(t.palette.primary.main, 0.08),
          color: t.palette.text.primary,
          border: `1px solid ${alpha(t.palette.primary.main, 0.15)}`,
          borderRadius: 2,
        })}
      >
        <Typography variant="h6" fontWeight="bold" mb={2}>
          Tap item to Refund
        </Typography>

        {loading && <Typography>Loading order…</Typography>}
        {loadError && (
          <Typography color="error" sx={{ mb: 2 }}>
            {loadError}
          </Typography>
        )}

        <Box>
          <Typography fontWeight="bold">Receipt {receiptNo}</Typography>
          <Divider
            sx={(t) => ({
              my: 1,
              borderColor: alpha(t.palette.primary.main, 0.3),
            })}
          />

          {refundItems.length ? (
            refundItems.map((it, idx) => (
              <Box
                key={`${it.name}-${idx}`}
                onClick={() => {
                  setModalTargetIndex(idx);
                  setModalQty(1);
                  setModalOpen(true);
                }}
                sx={(t) => ({
                  display: "flex",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  p: 1,
                  borderRadius: 1,
                  "&:hover": {
                    bgcolor: alpha(t.palette.primary.main, 0.15),
                  },
                })}
              >
                <span>
                  {it.name} x {it.qty}
                </span>
                <span>{lineTotal(it)}</span>
              </Box>
            ))
          ) : (
            <Typography color="text.secondary">No items</Typography>
          )}

          <Divider
            sx={(t) => ({
              my: 1,
              borderColor: alpha(t.palette.primary.main, 0.3),
            })}
          />
          <Typography mt={1}>Reason:</Typography>
          <TextField
            variant="standard"
            fullWidth
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          />

          <Divider
            sx={(t) => ({
              my: 1,
              borderColor: alpha(t.palette.primary.main, 0.3),
            })}
          />

          <Box display="flex" justifyContent="space-between" fontWeight="bold">
            <span>Total</span>
            <span>{listTotal(refundItems)}</span>
          </Box>
        </Box>
      </Paper>

      {/* Arrow */}
      <Typography
        fontSize="2rem"
        fontWeight="bold"
        sx={(t) => ({ color: t.palette.primary.main, mt: 8 })}
      >
        &gt;
      </Typography>

      {/* Cancel Panel (right) */}
      <Paper
        sx={(t) => ({
          p: 3,
          width: 400,
          boxShadow: "none",
          bgcolor: alpha(t.palette.primary.main, 0.08),
          color: t.palette.text.primary,
          border: `1px solid ${alpha(t.palette.primary.main, 0.15)}`,
          borderRadius: 2,
        })}
      >
        <Typography variant="h6" fontWeight="bold" mb={2}>
          Tap item to Cancel
        </Typography>
        <Box>
          <Typography fontWeight="bold">Refund Receipt</Typography>
          <Divider
            sx={(t) => ({
              my: 1,
              borderColor: alpha(t.palette.primary.main, 0.3),
            })}
          />

          {cancelItem ? (
            <Box
              onClick={handleRefundBack}
              sx={(t) => ({
                display: "flex",
                justifyContent: "space-between",
                cursor: "pointer",
                p: 1,
                borderRadius: 1,
                "&:hover": {
                  bgcolor: alpha(t.palette.primary.main, 0.15),
                },
              })}
            >
              <span>
                {cancelItem.name} x {cancelItem.qty}
              </span>
              <span>{lineTotal(cancelItem)}</span>
            </Box>
          ) : (
            <Box display="flex" justifyContent="center" gap={4} my={2}>
              <span>-</span>
              <span>-</span>
              <span>-</span>
            </Box>
          )}

          <Divider
            sx={(t) => ({
              my: 1,
              borderColor: alpha(t.palette.primary.main, 0.3),
            })}
          />
          <Typography mt={1}>Reason:</Typography>
          <TextField
            variant="standard"
            fullWidth
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />

          <Divider
            sx={(t) => ({
              my: 1,
              borderColor: alpha(t.palette.primary.main, 0.3),
            })}
          />

          <Box display="flex" justifyContent="space-between" fontWeight="bold">
            <span>Total</span>
            <span>{lineTotal(cancelItem)}</span>
          </Box>

          <Box mt={2} display="flex" justifyContent="flex-end">
            <Button
              variant="contained"
              color="primary"
              disabled={!cancelItem || !orderId}
              onClick={handleOpenPinDialog}
            >
              Refund
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Qty Modal */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        PaperProps={{
          sx: (t) => ({
            minWidth: 360,
            bgcolor: "#f9d7a5",
            borderRadius: 2,
          }),
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#8b4a10",
            borderBottom: `1px solid ${alpha("#8b4a10", 0.3)}`,
          }}
        >
          <span>
            {modalTargetIndex != null && refundItems[modalTargetIndex]
              ? refundItems[modalTargetIndex].name
              : "Refund Item"}
          </span>
          <IconButton
            size="small"
            onClick={() => setModalOpen(false)}
            sx={{ color: "#8b4a10" }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent
          sx={{
            pt: 3,
            pb: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              width: "100%",
              justifyContent: "center",
            }}
          >
            <IconButton
              onClick={() => setModalQty((q) => Math.max(1, q - 1))}
            >
              <RemoveIcon />
            </IconButton>

            <Typography
              sx={{
                minWidth: 40,
                textAlign: "center",
                borderBottom: "1px solid rgba(0,0,0,0.3)",
                pb: 0.5,
              }}
            >
              {modalQty}
            </Typography>

            <IconButton
              onClick={() =>
                setModalQty((q) => {
                  const src =
                    modalTargetIndex != null
                      ? refundItems[modalTargetIndex]
                      : null;
                  const maxQty = src ? src.qty : q + 1;
                  return Math.min(maxQty, q + 1);
                })
              }
            >
              <AddIcon />
            </IconButton>
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            pb: 3,
            justifyContent: "flex-end",
          }}
        >
          <Button
            variant="contained"
            onClick={handleSave}
            sx={{
              px: 4,
              fontWeight: "bold",
              textTransform: "none",
            }}
          >
            Proceed
          </Button>
        </DialogActions>
      </Dialog>

      {/* Approval PIN Dialog */}
      <Dialog
        open={pinDialogOpen}
        onClose={handleClosePinDialog}
        PaperProps={{ sx: { minWidth: 360 } }}
      >
        <DialogTitle>
          <Typography variant="h6" component="span">
            Refund Approval Required
          </Typography>
          <Typography
            variant="body2"
            component="span"
            sx={{ opacity: 0.7, display: "block" }}
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
          <Button onClick={handleClosePinDialog}>Cancel</Button>

          <Button
            variant="contained"
            disabled={pinDigits.some((d) => !d) || isPinChecking}
            onClick={handleConfirmPin}
          >
            {isPinChecking ? "Checking…" : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}