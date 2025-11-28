// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/ShiftManagementPage.jsx
import { useState, useMemo } from "react";
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

const PHP = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function ShiftManagementPage() {
  // 🔹 dialogs & form state
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [declaredCash, setDeclaredCash] = useState("");
  const [note, setNote] = useState("");
  const [ending, setEnding] = useState(false);

  // 🔹 from ShiftContext (raw row from pos_shifts)
  const { shift: rawShift, clearShift, refreshLatestShift } = useShift();

  // 🔹 Map DB row → UI fields
  const shift = useMemo(() => {
    if (!rawShift) return null;

    return {
      number: rawShift.shift_id,
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

      // Cash drawer
      startingCash: Number(rawShift.opening_float || 0),
      cashPayments: Number(rawShift.total_cash_payments || 0),
      gcashPayments: Number(rawShift.total_online_payments || 0), // treat online as GCash
      cashRefunds: Number(rawShift.total_refunds || 0), // or split later if you add separate column
      cashIn: Number(rawShift.total_cash_in || 0),
      cashOut: Number(rawShift.total_cash_out || 0),
      expectedCash: Number(rawShift.expected_cash || 0),

      // Sales summary
      grossSales: Number(rawShift.total_gross_sales || 0),
      refunds: Number(rawShift.total_refunds || 0),
      discounts: Number(rawShift.total_discounts || 0),
    };
  }, [rawShift]);

  const hasShift = !!shift;

  const handleCashInOut = () => {
    // completely ignore clicks if no open shift
    if (!hasShift) return;

    // TODO: wire to your Cash In/Out / Cash Management page or dialog
    // e.g. navigate("/pos/cash-management");
  };

  const handleOpenEndDialog = () => {
    if (!shift) return;
    // prefill with expected cash (from DB)
    setDeclaredCash(
      shift.expectedCash != null && !Number.isNaN(shift.expectedCash)
        ? String(shift.expectedCash)
        : ""
    );
    setEndDialogOpen(true);
  };

  const handleCloseEndDialog = () => {
    if (ending) return;
    setEndDialogOpen(false);
  };

  const handleConfirmEndShift = async () => {
    try {
      setEnding(true);

      const payload = {
        declared_cash: declaredCash ? Number(declaredCash) : undefined,
        note: note || undefined,
      };

      const resp = await fetch("/api/pos/shift/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.ok) {
        throw new Error(data.error || "Failed to end shift");
      }

      // 🔹 Clear frontend shift + cart state (no more spammed shiftId in Cart)
      try {
        if (typeof clearShift === "function") {
          clearShift();
        }

        // Clear POS-related localStorage so Cart starts clean
        localStorage.removeItem("openOrders");
        localStorage.removeItem("currentOrderId");
        // If you also want to reset type:
        // localStorage.removeItem("orderType");
      } catch (e) {
        console.warn("[ShiftManagementPage] local cleanup failed", e);
      }

      // 🔹 Sync with backend (now there should be no open shift)
      if (typeof refreshLatestShift === "function") {
        await refreshLatestShift();
      }

      setEndDialogOpen(false);
      setSuccessDialogOpen(true); // 🔹 nice success dialog instead of ugly alert
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
            <Button
              fullWidth
              onClick={handleCashInOut}
              disabled={!hasShift}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 999,
                py: 1.2,
                bgcolor: hasShift ? "#c7a17a" : "grey.500",
                color: "common.white",
                "&:hover": {
                  bgcolor: hasShift ? "#b18d65" : "grey.600",
                },
              }}
            >
              Cash In/Out
            </Button>
            <Button
              fullWidth
              onClick={handleOpenEndDialog}
              disabled={!hasShift}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 999,
                py: 1.2,
                bgcolor: hasShift ? "#8b5a2b" : "grey.500",
                color: "common.white",
                "&:hover": {
                  bgcolor: hasShift ? "#754821" : "grey.600",
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
                  ? `Shift Number ${shift.number}`
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
              There is currently no open shift for this terminal / user.
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