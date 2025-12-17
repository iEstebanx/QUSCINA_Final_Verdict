// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/ShiftManagementPage.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
} from "@mui/material";

import { useShift } from "@/context/ShiftContext";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";

const PHP = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function ShiftManagementPage() {
  const navigate = useNavigate();
  // 🔹 dialogs & form state
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [declaredCash, setDeclaredCash] = useState("");
  const [note, setNote] = useState("");
  const [ending, setEnding] = useState(false);

  const [pendingWarnOpen, setPendingWarnOpen] = useState(false);
  const [pendingWarnMsg, setPendingWarnMsg] = useState("");

  // 🔹 from ShiftContext (raw row from pos_shifts)
  const {
    isOpen,
    data: rawShift,
    shiftId,
    shiftNo,
    loading: shiftLoading,
    error: shiftError,
    getSummary,
    remitShift,
    refreshCurrentOpen,
    clearShift,
  } = useShift();
  
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      if (!isOpen || !shiftId) {
        setSummary(null);
        setSummaryError("");
        setSummaryLoading(false);
        return;
      }

      setSummaryLoading(true);
      setSummaryError("");
      try {
        const data = await getSummary(shiftId);
        if (!cancelled) setSummary(data);
      } catch (e) {
        if (!cancelled) setSummaryError(e.message || "Failed to load shift summary");
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    };

    loadSummary();
    return () => {
      cancelled = true;
    };
  }, [isOpen, shiftId, getSummary]);

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const shift = useMemo(() => {
    if (!rawShift) return null;

    // summary = whole API response
    const cd = summary?.cash_drawer || {};
    const ss = summary?.sales_summary || {};

    // Cash Drawer (from cash_drawer)
    const startingCash  = num(cd.opening_float ?? rawShift.opening_float);
    const cashPayments  = num(cd.cash_payments);
    const gcashPayments = num(ss.online);        // <-- from sales_summary.online
    const cashRefunds   = num(cd.cash_refunds);  // already includes refund_cash_moves in your backend calc
    const cashIn        = num(cd.cash_in);
    const cashOut       = num(cd.cash_out);
    const expectedCash  = num(cd.expected_cash) || (startingCash + cashPayments + cashIn - cashRefunds - cashOut);

    // Sales Summary (from sales_summary)
    const grossSales = num(ss.gross_sales);
    const refunds    = num(ss.refunds);
    const discounts  = num(ss.discounts);

    const shiftLabel =
      (rawShift.shift_code
        ? String(rawShift.shift_code).toUpperCase().replace("SHIFT_", "S")
        : "") ||
      shiftNo ||
      (rawShift.shift_id ? `S${rawShift.shift_id}` : "S?");

    return {
      numberLabel: shiftLabel,
      openedBy: rawShift.employee_id,
      openedAt: rawShift.opened_at
        ? new Date(rawShift.opened_at).toLocaleString("en-PH", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",

      startingCash,
      cashPayments,
      gcashPayments,
      cashRefunds,
      cashIn,
      cashOut,
      expectedCash,

      grossSales,
      refunds,
      discounts,
    };
  }, [rawShift, summary, shiftNo]);

  const hasShift = !!shift;

  const handleCashInOut = () => {
    // completely ignore clicks if no open shift
    if (!hasShift) return;

    navigate("/pos/cash-management");
  };

  const handleOpenEndDialog = async () => {
    if (!shiftId || !hasShift) return;

    try {
      const url = `/api/pos/orders/open?shiftId=${encodeURIComponent(shiftId)}`;
      const res = await fetch(url, { credentials: "include" });

      // ✅ if the check failed, DO NOT allow closing
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[EndShift] pending check failed:", res.status, text);
        setPendingWarnMsg("Pending check failed. Cannot end shift right now.");
        setPendingWarnOpen(true);
        return;
      }

      const data = await res.json().catch(() => ({}));

      // ✅ support different response shapes
      const orders =
        data?.orders ||
        data?.items ||
        data?.rows ||
        data?.data ||
        [];

      const hasPending = (orders || []).some((o) => {
        const s = String(o?.status || o?.order_status || "").toLowerCase();
        return s === "pending" || s === "open";
      });

      if (hasPending) {
        setPendingWarnMsg(
          "You still have pending orders. Please settle them before ending the shift."
        );
        setPendingWarnOpen(true);
        return;
      }

      setDeclaredCash(
        shift.expectedCash != null && !Number.isNaN(shift.expectedCash)
          ? String(shift.expectedCash)
          : ""
      );
      setEndDialogOpen(true);
    } catch (e) {
      console.error(e);
      setPendingWarnMsg("Unable to check pending orders. Please try again.");
      setPendingWarnOpen(true);
    }
  };

  const handleCloseEndDialog = () => {
    if (ending) return;
    setEndDialogOpen(false);
  };

  const handleConfirmEndShift = async () => {
    if (!shiftId) return;

    try {
      setEnding(true);

      const declared =
        declaredCash === "" ? shift?.expectedCash : Number(declaredCash || 0);

      const updatedShift = await remitShift({
        shift_id: shiftId,
        declared_cash: declared,
        closing_note: note || undefined,
      });

      if (!updatedShift) throw new Error("Failed to end shift");

      clearShift?.();
      localStorage.removeItem("openOrders");
      localStorage.removeItem("currentOrderId");

      await refreshCurrentOpen?.();

      setEndDialogOpen(false);
      setSuccessDialogOpen(true);
    } catch (err) {
      console.error("[ShiftManagementPage] end shift failed:", err);
      window.alert(err.message || "Failed to end shift");
    } finally {
      setEnding(false);
    }
  };

  const expectedCash = Number(shift?.expectedCash || 0);
  const declaredNum =
    declaredCash === "" ? expectedCash : Number(declaredCash || 0);
  const diff = declaredNum - expectedCash;
  const diffDisplay = PHP(Math.abs(diff));

  const netSales = shift
    ? shift.grossSales - shift.refunds - shift.discounts
    : 0;

  return (
    <>
      <Box
        sx={{
          p: { xs: 2, sm: 3 },
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        <Paper
          elevation={3}
          sx={{
            width: "100%",
            maxWidth: 720,
            borderRadius: 4,
            p: 3,
            bgcolor: "#fdf1df",
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
          }}
        >
          {/* Top action buttons (no tabs, just actions) */}
          <Stack
            direction="row"
            spacing={2}
            sx={{
              mb: 3,
              justifyContent: "center",
            }}
          >
            {/* Cash In/Out button */}
            <Button
              fullWidth
              variant="contained"
              startIcon={<PaidOutlinedIcon />}
              onClick={handleCashInOut}
              disabled={!hasShift}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 999,
                py: 1.3,
                boxShadow: hasShift ? "0 4px 12px rgba(0,0,0,0.18)" : "none",
                // 🔹 SAME COLORS AS END SHIFT
                bgcolor: hasShift ? "#8b5a2b" : "grey.400",
                color: "common.white",
                border: "2px solid rgba(0,0,0,0.06)",
                "&:hover": {
                  bgcolor: hasShift ? "#754821" : "grey.500",
                },
                "&.Mui-disabled": {
                  bgcolor: "grey.400",
                  color: "rgba(255,255,255,0.7)",
                  boxShadow: "none",
                },
              }}
            >
              Cash In / Out
            </Button>

            {/* End Shift button */}
            <Button
              fullWidth
              variant="contained"
              startIcon={<LogoutOutlinedIcon />}
              onClick={handleOpenEndDialog}
              disabled={!hasShift}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 999,
                py: 1.3,
                boxShadow: hasShift ? "0 4px 12px rgba(0,0,0,0.18)" : "none",
                bgcolor: hasShift ? "#8b5a2b" : "grey.400",
                color: "common.white",
                border: "2px solid rgba(0,0,0,0.06)",
                "&:hover": {
                  bgcolor: hasShift ? "#754821" : "grey.500",
                },
                "&.Mui-disabled": {
                  bgcolor: "grey.400",
                  color: "rgba(255,255,255,0.7)",
                  boxShadow: "none",
                },
              }}
            >
              End Shift
            </Button>
          </Stack>

          {/* Header row: shift number + opened by + date */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={2}
            sx={{ mb: 2 }}
          >
            <Box>
              <Typography variant="body1" fontWeight={600}>
                {hasShift
                  ? `Shift Number ${shift.numberLabel}`
                  : "No open shift detected"}
              </Typography>
              {hasShift && (
                <Typography variant="body2" color="text.secondary">
                  Shift Opened By {shift.openedBy}
                </Typography>
              )}
            </Box>
            {hasShift && (
              <Typography variant="body2" color="text.secondary">
                {shift.openedAt}
              </Typography>
            )}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {(shiftLoading || summaryLoading) && (
            <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
              Loading shift data…
            </Typography>
          )}

          {(shiftError || summaryError) && (
            <Typography variant="body2" color="error" sx={{ mb: 2 }}>
              {shiftError || summaryError}
            </Typography>
          )}

          {hasShift ? (
            <>
              {/* Cash Drawer section */}
              <Typography
                variant="subtitle1"
                fontWeight={700}
                sx={{ color: "#2e7d32", mb: 1 }}
              >
                Cash Drawer
              </Typography>

              <Stack spacing={0.5} sx={{ mb: 2 }}>
                <Row label="Starting Cash" value={PHP(shift.startingCash)} />
                <Row label="Cash Payments" value={PHP(shift.cashPayments)} />
                <Row label="Gcash Payments" value={PHP(shift.gcashPayments)} />
                <Row label="Cash Refunds" value={PHP(shift.cashRefunds)} />
                <Row label="Cash in" value={PHP(shift.cashIn)} />
                <Row label="Cash out" value={PHP(shift.cashOut)} />
                <Row
                  label="Expected cash amount"
                  value={PHP(shift.expectedCash)}
                  bold
                />
              </Stack>

              {/* Sales Summary section */}
              <Typography
                variant="subtitle1"
                fontWeight={700}
                sx={{ color: "#2e7d32", mb: 1 }}
              >
                Sales Summary
              </Typography>

              <Stack spacing={0.5}>
                <Row label="Gross Sales" value={PHP(shift.grossSales)} />
                <Row label="Refunds" value={PHP(shift.refunds)} />
                <Row label="Discounts" value={PHP(shift.discounts)} />
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Row label="Net Sales" value={PHP(netSales)} bold />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              There is currently no open shift for this terminal.
            </Typography>
          )}
        </Paper>
      </Box>

      {/* 🔹 Close / End Shift Dialog */}
      <Dialog open={endDialogOpen} onClose={handleCloseEndDialog} fullWidth>
        <DialogTitle
          sx={{
            bgcolor: "#8b5a2b",
            color: "common.white",
            fontWeight: 700,
          }}
        >
          End Shift
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            bgcolor: "#fdf1df",
          }}
        >
          {/* Expected cash amount (display only) */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <Typography variant="body2">Expected cash amount</Typography>
            <Typography variant="body2" fontWeight={600}>
              {PHP(expectedCash)}
            </Typography>
          </Stack>

          {/* Actual cash amount (input) */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 2 }}
            spacing={2}
          >
            <Typography variant="body2">Actual cash amount</Typography>
            <TextField
              type="number"
              variant="standard"
              value={declaredCash}
              onChange={(e) => setDeclaredCash(e.target.value)}
              sx={{
                maxWidth: 140,
                "& input": { textAlign: "right" },
              }}
            />
          </Stack>

          {/* Difference */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 3 }}
          >
            <Typography variant="body2">Difference</Typography>
            <Typography variant="body2" fontWeight={600}>
              {diffDisplay}
            </Typography>
          </Stack>

          {/* Note */}
          <TextField
            label="Closing note (optional)"
            fullWidth
            multiline
            minRows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions
          sx={{
            bgcolor: "#fdf1df",
            px: 3,
            py: 2,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Button onClick={handleCloseEndDialog} disabled={ending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmEndShift}
            disabled={ending}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: 999,
              px: 4,
              bgcolor: "#8b5a2b",
              "&:hover": { bgcolor: "#754821" },
            }}
          >
            {ending ? (
              <CircularProgress size={20} sx={{ color: "common.white" }} />
            ) : (
              "End Shift"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 🔹 Nice success dialog (replaces window.alert) */}
      <Dialog
        open={successDialogOpen}
        onClose={() => setSuccessDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle
          sx={{
            bgcolor: "#2e7d32",
            color: "common.white",
            fontWeight: 700,
          }}
        >
          Shift Ended
        </DialogTitle>
        <DialogContent
          sx={{ bgcolor: "#fdf1df", py: 3 }}
        >
          <Typography variant="body1" sx={{ mb: 1 }}>
            Shift has been successfully remitted.
          </Typography>
          {shift && (
            <Typography variant="body2" color="text.secondary">
              (This summary reflects the values at the time of closing.)
            </Typography>
          )}
        </DialogContent>
        <DialogActions
          sx={{ bgcolor: "#fdf1df", px: 3, py: 2, justifyContent: "flex-end" }}
        >
          <Button
            variant="contained"
            onClick={() => setSuccessDialogOpen(false)}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 999,
              px: 3,
              bgcolor: "#2e7d32",
              "&:hover": { bgcolor: "#255d27" },
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cannot end shift while still have pending orders. */}
      <Dialog
        open={pendingWarnOpen}
        onClose={() => setPendingWarnOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle
          sx={{
            bgcolor: "#8b5a2b",
            color: "common.white",
            fontWeight: 700,
          }}
        >
          Cannot End Shift
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: "#fdf1df" }}>
          <Typography>{pendingWarnMsg}</Typography>
        </DialogContent>
        <DialogActions sx={{ bgcolor: "#fdf1df" }}>
          <Button variant="contained" onClick={() => setPendingWarnOpen(false)}>
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Simple row component: label left, value right */
function Row({ label, value, bold = false }) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      spacing={2}
    >
      <Typography variant="body2" sx={{ fontWeight: bold ? 600 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: bold ? 600 : 400 }}>
        {value}
      </Typography>
    </Stack>
  );
}