// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/ShiftManagementPage.jsx
import { useState } from "react";
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

const PHP = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function ShiftManagementPage() {
  const [activeTab, setActiveTab] = useState("cash"); // "cash" | "end"

  // 🔹 End-shift dialog state
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [declaredCash, setDeclaredCash] = useState("");
  const [note, setNote] = useState("");
  const [ending, setEnding] = useState(false);

  // For now this is static; later you can wire this to your shift summary API
  const shift = {
    number: 61,
    openedBy: "202500002",
    openedAt: "11/29/2025, 12:40:18 AM",
    startingCash: 7000,
    cashPayments: 0,
    gcashPayments: 0,
    cashRefunds: 0,
    cashIn: 0,
    cashOut: 0,
    expectedCash: 7000,
    grossSales: 0,
    refunds: 0,
    discounts: 0,
  };

  const isCashTab = activeTab === "cash";

  const handleOpenEndDialog = () => {
    // prefill with expected cash like your reference screenshot
    setDeclaredCash(String(shift.expectedCash ?? ""));
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

      window.alert("Shift ended successfully.");
      setEndDialogOpen(false);
      // TODO: refresh data or redirect if you want
    } catch (err) {
      console.error("[ShiftManagementPage] end shift failed:", err);
      window.alert(err.message || "Failed to end shift");
    } finally {
      setEnding(false);
    }
  };

  const expectedCash = Number(shift.expectedCash || 0);
  const declaredNum =
    declaredCash === "" ? expectedCash : Number(declaredCash || 0);
  const diff = declaredNum - expectedCash;
  const diffDisplay = PHP(Math.abs(diff));

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
            bgcolor: "#fdf1df", // soft beige like your screenshot
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
          }}
        >
          {/* Top toggle buttons */}
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
              onClick={() => setActiveTab("cash")}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 999,
                py: 1.2,
                bgcolor: isCashTab ? "#8b5a2b" : "#c7a17a",
                color: "common.white",
                "&:hover": {
                  bgcolor: isCashTab ? "#754821" : "#b18d65",
                },
              }}
            >
              Cash In/Out
            </Button>
            <Button
              fullWidth
              onClick={() => setActiveTab("end")}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 999,
                py: 1.2,
                bgcolor: !isCashTab ? "#8b5a2b" : "#c7a17a",
                color: "common.white",
                "&:hover": {
                  bgcolor: !isCashTab ? "#754821" : "#b18d65",
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
                Shift Number {shift.number}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Shift Opened By {shift.openedBy}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {shift.openedAt}
            </Typography>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {/* CONTENT */}
          {isCashTab ? (
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

              <Row
                label="Net Sales"
                value={PHP(
                  shift.grossSales - shift.refunds - shift.discounts
                )}
                bold
              />
            </>
          ) : (
            <>
              {/* End Shift tab content: just button now */}
              <Box sx={{ mt: 3, textAlign: "right" }}>
                <Button
                  variant="contained"
                  onClick={handleOpenEndDialog}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    borderRadius: 999,
                    px: 4,
                    py: 1.1,
                    bgcolor: "#8b5a2b",
                    "&:hover": { bgcolor: "#754821" },
                  }}
                >
                  End Shift
                </Button>
              </Box>
            </>
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
          Close Shift
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
      <Typography
        variant="body2"
        sx={{ fontWeight: bold ? 600 : 400 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: bold ? 600 : 400 }}
      >
        {value}
      </Typography>
    </Stack>
  );
}