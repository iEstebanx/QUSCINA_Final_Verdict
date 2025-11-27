// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/ShiftManagementPage.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import CloseIcon from "@mui/icons-material/Close";
import { useShift } from "@/context/ShiftContext";

import {
  Box,
  Typography,
  Button,
  Divider,
  Stack,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
} from "@mui/material";

const peso = (value) => `₱${Number(value || 0).toFixed(2)}`;

// 🔹 This page is for Backoffice POS Shift Management of TERMINAL-2
const TERMINAL_ID = "TERMINAL-2";

/* ------------------------------------------------------------------ */
/* Inlined FloatingCloseShiftModal (uses useShift → /api/pos/shift)   */
/* ------------------------------------------------------------------ */
const FloatingCloseShiftModal = ({ onClose }) => {
  const { getSummary, remitShift } = useShift();
  const [loading, setLoading] = useState(true);
  const [expectedAmount, setExpectedAmount] = useState(0);
  const [declared, setDeclared] = useState("");
  const [note, setNote] = useState("");

  const initialRef = useRef({ declared: "", note: "" });
  const touchedRef = useRef(false);

  const [discardOpen, setDiscardOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        const sum = await getSummary().catch(() => null);
        if (!on || !sum) return;

        const exp = Number(sum?.cash_drawer?.expected_cash || 0);
        setExpectedAmount(exp);

        const prefill = String(exp.toFixed(2));
        setDeclared(prefill);
        setNote("");

        initialRef.current = { declared: prefill, note: "" };
        touchedRef.current = false;
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [getSummary]);

  const declaredNum = useMemo(() => Number(declared || 0), [declared]);
  const difference = useMemo(
    () => Number((declaredNum - expectedAmount).toFixed(2)),
    [declaredNum, expectedAmount]
  );

  const handleDeclaredChange = (e) => {
    touchedRef.current = true;
    setDeclared(e.target.value);
  };

  const handleNoteChange = (e) => {
    touchedRef.current = true;
    setNote(e.target.value);
  };

  const snapshotNow = () => ({
    declared: String(declared ?? "").trim(),
    note: String(note ?? "").trim(),
  });

  const deepEqual = (a, b) => {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  };

  const isDirty = () => {
    if (!touchedRef.current) return false;
    return !deepEqual(snapshotNow(), initialRef.current);
  };

  const hardClose = () => {
    setDiscardOpen(false);
    touchedRef.current = false;
    onClose();
  };

  const handleCloseAttempt = () => {
    if (isDirty()) {
      setDiscardOpen(true);
    } else {
      hardClose();
    }
  };

  const handleConfirmClick = () => {
    setConfirmOpen(true);
  };

  const handleConfirmProceed = async () => {
    setLoading(true);
    try {
      await remitShift({ declared_cash: declaredNum, closing_note: note });
      touchedRef.current = false;
      setConfirmOpen(false);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCancel = () => {
    setConfirmOpen(false);
  };

  return (
    <>
      <Dialog open onClose={handleCloseAttempt} maxWidth="xs" fullWidth>
        <DialogTitle
          sx={(t) => ({
            bgcolor: t.palette.secondary.main,
            color:
              t.palette.secondary.contrastText ??
              t.palette.getContrastText(t.palette.secondary.main),
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          })}
        >
          <Typography fontWeight="bold" sx={{ color: "inherit" }}>
            Close Shift
          </Typography>
          <IconButton onClick={handleCloseAttempt} sx={{ color: "inherit" }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography>Expected cash amount</Typography>
            <Typography fontWeight="medium">{peso(expectedAmount)}</Typography>
          </Box>

          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={1}
          >
            <Typography>Actual cash amount</Typography>
            <TextField
              type="number"
              size="small"
              variant="standard"
              value={declared}
              onChange={handleDeclaredChange}
              slotProps={{
                input: {
                  style: { textAlign: "right" },
                  step: "0.01",
                },
              }}
              sx={{
                maxWidth: 140,
                "& .MuiInputBase-input": {
                  textAlign: "right",
                },
              }}
            />
          </Box>

          <Box display="flex" justifyContent="space-between" mb={2}>
            <Typography>Difference</Typography>
            <Typography fontWeight="medium">{peso(difference)}</Typography>
          </Box>

          <TextField
            label="Closing note (optional)"
            fullWidth
            multiline
            minRows={2}
            value={note}
            onChange={handleNoteChange}
          />
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={handleCloseAttempt} disabled={loading} sx={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            disabled={loading}
            onClick={handleConfirmClick}
            sx={{ flex: 1, fontWeight: "bold" }}
          >
            {loading ? "Closing…" : "Close & Remit"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Discard changes?</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to discard unsaved changes?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={hardClose}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onClose={handleConfirmCancel}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {difference !== 0 ? "Cash Difference Detected" : "Confirm Close Shift"}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {difference !== 0
              ? `There is a discrepancy of ${peso(
                  difference
                )}. Proceed with closing?`
              : "Are you sure you want to close and remit this shift?"}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirmProceed}
            disabled={loading}
          >
            {loading ? "Closing…" : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Shift Management Page – TERMINAL-2                                 */
/* ------------------------------------------------------------------ */
const ShiftManagementPage = () => {
  const navigate = useNavigate();
  const { shift, getSummary } = useShift();

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        const s = await getSummary().catch(() => null);
        if (on) setSummary(s);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [getSummary]);

  const renderRow = (label, value, bold = false, key) => (
    <Box
      key={key}
      display="flex"
      justifyContent="space-between"
      py={0.5}
      fontWeight={bold ? "bold" : "normal"}
    >
      <Typography>{label}</Typography>
      <Typography>{value}</Typography>
    </Box>
  );

  const effectiveShift = summary?.shift || shift || null;

  const shiftNo = effectiveShift?.shift_id ?? "—";
  const openedAt = effectiveShift?.opened_at || "";
  const openedDisplay = openedAt ? new Date(openedAt).toLocaleString() : "—";
  const cashier = effectiveShift?.employee_id || "—";
  const terminalLabel = effectiveShift?.terminal_id || TERMINAL_ID;

  const paymentSummary = summary?.payment_summary || [];

  const isOpen =
    effectiveShift &&
    String(effectiveShift.status || "").toLowerCase() === "open";

  return (
    <Box p={4}>
      <Paper
        elevation={2}
        sx={(t) => ({
          bgcolor: t.palette.background.paper,
          p: 3,
          maxWidth: 700,
          mx: "auto",
          borderRadius: 3,
        })}
      >
        <Stack direction="row" spacing={2} mb={3}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => navigate("/shift/management/cash")}
          >
            Cash Management
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={() => setShowCloseModal(true)}
            disabled={!isOpen}
          >
            End Shift
          </Button>
        </Stack>

        {/* Header info – includes TERMINAL-2 */}
        <Box display="flex" justifyContent="space-between" mb={2}>
          <Box>
            <Typography fontWeight={500}>
              Shift Number{" "}
              <Typography component="span" fontWeight={600}>
                {shiftNo}
              </Typography>
            </Typography>

            <Typography fontWeight={500}>
              Shift Opened By{" "}
              <Typography component="span" fontWeight={600}>
                {cashier}
              </Typography>
            </Typography>

            <Typography fontWeight={500}>
              Terminal{" "}
              <Typography component="span" fontWeight={600}>
                {terminalLabel}
              </Typography>
            </Typography>
          </Box>

          <Typography fontWeight={600}>{openedDisplay}</Typography>
        </Box>

        <Divider sx={{ my: 1 }} />

        <Typography fontWeight="bold" color="success.main" mt={2} mb={1}>
          Cash Drawer
        </Typography>

        {renderRow(
          "Starting Cash",
          peso(summary?.cash_drawer?.opening_float || 0),
          false,
          "starting-cash"
        )}

        {paymentSummary.map((p, idx) =>
          renderRow(
            `${p.method_name} Payments`,
            peso(p.net_amount ?? p.total_sales ?? 0),
            false,
            `${p.method_name}-${idx}`
          )
        )}

        {renderRow(
          "Cash Refunds",
          peso(summary?.cash_drawer?.cash_refunds || 0),
          false,
          "cash-refunds"
        )}
        {renderRow(
          "Cash in",
          peso(summary?.cash_drawer?.cash_in || 0),
          false,
          "cash-in"
        )}
        {renderRow(
          "Cash out",
          peso(summary?.cash_drawer?.cash_out || 0),
          false,
          "cash-out"
        )}

        {renderRow(
          "Expected cash amount",
          peso(summary?.cash_drawer?.expected_cash || 0),
          true,
          "expected-cash"
        )}

        <Typography fontWeight="bold" color="success.main" mt={3} mb={1}>
          Sales Summary
        </Typography>

        {renderRow(
          "Gross Sales",
          peso(summary?.sales_summary?.gross_sales || 0),
          true,
          "gross-sales"
        )}
        {renderRow(
          "Refunds",
          peso(summary?.sales_summary?.refunds || 0),
          false,
          "refunds"
        )}
        {renderRow(
          "Discounts",
          peso(summary?.sales_summary?.discounts || 0),
          false,
          "discounts"
        )}

        <Divider sx={{ my: 1 }} />

        {renderRow(
          "Net Sales",
          peso(summary?.sales_summary?.net_sales || 0),
          true,
          "net-sales"
        )}
      </Paper>

      {showCloseModal && (
        <FloatingCloseShiftModal onClose={() => setShowCloseModal(false)} />
      )}
    </Box>
  );
};

export default ShiftManagementPage;