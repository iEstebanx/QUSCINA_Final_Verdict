// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/CashManagementPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Divider,
  Button,
  TextField,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Stack,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useShift } from "@/context/ShiftContext";

const PHP = (n) => `₱${Number(n || 0).toFixed(2)}`;

const CASH_DENOMS = [
  { label: "₱1.00", value: 1 },
  { label: "₱5.00", value: 5 },
  { label: "₱10.00", value: 10 },
  { label: "₱20.00", value: 20 },
  { label: "₱50.00", value: 50 },
  { label: "₱100.00", value: 100 },
  { label: "₱200.00", value: 200 },
  { label: "₱500.00", value: 500 },
  { label: "₱1000.00", value: 1000 },
];

const quantityOptions = [
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
];

function mapMovesToEntries(items = []) {
  return items.map((m) => ({
    time: m.created_at
      ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "",
    amount: Number(m.amount || 0),
    comment: m.reason || "",
    type: m.type,
    denominations: m.denominations || [],
  }));
}

/* ----------------------------------------------------------- */
/* CashModal (Cash IN / Cash OUT)                               */
/* ----------------------------------------------------------- */
function CashModal({ open, onClose, type, onSubmit }) {
  const [quantities, setQuantities] = useState({});
  const [comment, setComment] = useState("");
  const [entryMode, setEntryMode] = useState("quick"); // quick | manual

  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // dirty tracking
  const initialRef = useRef({ quantities: {}, comment: "" });
  const touchedRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuantities({});
    setComment("");
    setSubmitError("");
    setEntryMode("quick");
    setSubmitting(false); 
    touchedRef.current = false;
    initialRef.current = { quantities: {}, comment: "" };
    setConfirmOpen(false);
    setDiscardOpen(false);
  }, [open]);

  const coins = CASH_DENOMS.filter((d) => d.value <= 20);
  const bills = CASH_DENOMS.filter((d) => d.value > 20);

  const total = useMemo(() => {
    return CASH_DENOMS.reduce((sum, { value }) => {
      const qty = Number(quantities[value] || 0);
      return sum + value * qty;
    }, 0);
  }, [quantities]);

  const handleDropdownChange = (denomValue, v) => {
    touchedRef.current = true;
    setQuantities((prev) => {
      const next = { ...prev };
      if (v === 0) delete next[denomValue];
      else next[denomValue] = Number(v);
      return next;
    });
  };

  const handleManualChange = (denomValue, raw) => {
    touchedRef.current = true;
    const cleaned = String(raw || "").replace(/[^\d]/g, "");
    setQuantities((prev) => {
      const next = { ...prev };
      if (cleaned === "") {
        delete next[denomValue];
        return next;
      }
      const num = Number(cleaned);
      next[denomValue] = Number.isFinite(num) && num >= 0 ? num : 0;
      return next;
    });
  };

  const handleCommentChange = (e) => {
    touchedRef.current = true;
    setComment(e.target.value);
  };

  const renderInputField = (denom) => {
    const { label, value } = denom;
    const curRaw = quantities[value];
    const curNum = Number(curRaw);
    const hasNumber = Number.isFinite(curNum);

    const quickValue = hasNumber ? curNum : 0;
    const manualValue = hasNumber ? curNum : "";

    if (entryMode === "manual") {
      return (
        <TextField
          key={value}
          fullWidth
          label={label}
          size="small"
          type="text"
          value={manualValue}
          onChange={(e) => handleManualChange(value, e.target.value)}
          inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
          onKeyDown={(e) => {
            if ([".", ",", "-", "+", "e", "E"].includes(e.key)) e.preventDefault();
          }}
        />
      );
    }

    const hasPreset = quantityOptions.some((opt) => opt.value === quickValue);
    const options =
      !hasPreset && quickValue !== 0
        ? [{ value: quickValue, label: `Custom (${quickValue})` }, ...quantityOptions]
        : quantityOptions;

    return (
      <TextField
        key={value}
        select
        fullWidth
        label={label}
        size="small"
        value={quickValue}
        onChange={(e) => handleDropdownChange(value, Number(e.target.value))}
      >
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>
    );
  };

  const snapshotNow = () => {
    const normalized = {};
    CASH_DENOMS.forEach(({ value }) => (normalized[value] = Number(quantities[value] || 0)));
    return { quantities: normalized, comment: comment.trim() };
  };

  const isDirty = () => {
    if (!touchedRef.current) return false;
    try {
      return JSON.stringify(snapshotNow()) !== JSON.stringify(initialRef.current);
    } catch {
      return true;
    }
  };

  const hardClose = () => {
    setDiscardOpen(false);
    touchedRef.current = false;
    onClose();
  };

  const handleCloseAttempt = () => {
    if (submitting) return;
    if (isDirty()) setDiscardOpen(true);
    else hardClose();
  };

  const handlePrimaryClick = () => {
    if (total <= 0 || submitting) return;
    setSubmitError("");
    setConfirmOpen(true);
  };

  const performSubmit = async () => {
    const denoms = CASH_DENOMS.map((d) => ({
      denom_value: d.value,
      qty: Number(quantities[d.value] || 0),
    })).filter((d) => d.qty > 0);

    const totalAmount = denoms.reduce((sum, d) => sum + d.denom_value * d.qty, 0);
    if (totalAmount <= 0) {
      setConfirmOpen(false);
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await onSubmit({
        amount: Number(totalAmount.toFixed(2)),
        comment: comment.trim(),
        type,
        denominations: denoms,
      });

      if (!result?.ok) {
        setSubmitError(result?.message || "Unable to record cash move.");
        setConfirmOpen(false); // return to main modal
        return;
      }

      touchedRef.current = false;
      setConfirmOpen(false);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={handleCloseAttempt} fullWidth maxWidth="md"
        PaperProps={{ sx: { width: "95%", maxWidth: 600, mx: "auto" } }}
      >
        <DialogTitle
          sx={{
            bgcolor: "#5a3b2a",
            color: "#fff",
            fontWeight: 900,
            py: 2,
          }}
        >
          {type === "cash_in" ? "Cash IN" : "Cash OUT"}
        </DialogTitle>

        <DialogContent dividers sx={{ bgcolor: "#fdf1df", px: 3, py: 3 }}>
          <Typography sx={{ mb: 2, textAlign: "center", color: "text.secondary" }}>
            Select quantity for each denomination using presets or enter manually.
          </Typography>

          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
            <ToggleButtonGroup
              color="primary"
              size="small"
              exclusive
              value={entryMode}
              onChange={(_e, v) => v && setEntryMode(v)}
              sx={{ bgcolor: "rgba(255,255,255,0.6)", borderRadius: 999 }}
            >
              <ToggleButton value="quick" sx={{ fontWeight: 800, textTransform: "none" }}>
                Quick Select
              </ToggleButton>
              <ToggleButton value="manual" sx={{ fontWeight: 800, textTransform: "none" }}>
                Manual Entry
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box
            sx={{
              mt: 1,
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
            }}
          >
            <Paper variant="outlined" sx={{ p: 2, bgcolor: "#fff7ea", borderRadius: 2 }}>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
                Coins
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1.5}>{coins.map(renderInputField)}</Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, bgcolor: "#fff7ea", borderRadius: 2 }}>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
                Bills
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1.5}>{bills.map(renderInputField)}</Stack>
            </Paper>
          </Box>

          <Box mt={3} textAlign="center">
            <Typography fontWeight={900} sx={{ fontSize: "1.1rem" }}>
              Total{" "}
              <Box
                component="span"
                sx={(t) => ({
                  color: type === "cash_in" ? t.palette.success.main : t.palette.error.main,
                  fontSize: "1.5rem",
                })}
              >
                ₱{total.toFixed(2)}
              </Box>
            </Typography>
          </Box>

          {submitError && (
            <Box mt={2}>
              <Typography variant="body2" color="error" textAlign="center">
                {submitError}
              </Typography>
            </Box>
          )}

          <Box mt={3}>
            <TextField
              label="Comment"
              fullWidth
              variant="standard"
              value={comment}
              onChange={handleCommentChange}
              sx={(t) => ({
                "& .MuiInputLabel-root": { color: alpha(t.palette.text.primary, 0.8) },
              })}
            />
          </Box>
        </DialogContent>

            <DialogActions sx={{ bgcolor: "#fdf1df", p: 2 }}>
                <Button onClick={handleCloseAttempt} disabled={submitting} sx={{ fontWeight: 800 }}>
                    Cancel
                </Button>

                <Button
                onClick={handlePrimaryClick}
                variant="contained"
                disabled={total <= 0 || submitting}
                sx={{
                    fontWeight: 900,
                    minWidth: 140,

                    bgcolor: "#8b5a2b",
                    color: "#fff",
                    "&:hover": { bgcolor: "#754821" },

                    "&.Mui-disabled": {
                    bgcolor: "rgba(0,0,0,0.12)",
                    color: "rgba(0,0,0,0.26)",
                    },
                }}
                >
                {submitting ? "Submitting…" : "Submit"}
                </Button>
            </DialogActions>
      </Dialog>

      <Dialog open={discardOpen} onClose={() => setDiscardOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Discard changes?</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to discard unsaved changes? This cannot be undone.</Typography>
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
        onClose={() => !submitting && setConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{type === "cash_in" ? "Confirm Cash In" : "Confirm Cash Out"}</DialogTitle>
        <DialogContent>
          <Typography>
            {type === "cash_in"
              ? `Record a Cash In of ₱${total.toFixed(2)}?`
              : `Record a Cash Out of ₱${total.toFixed(2)}?`}
          </Typography>
          {comment.trim() && (
            <Typography mt={1} variant="body2" color="text.secondary">
              Note: {comment.trim()}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={type === "cash_out" ? "error" : "primary"}
            onClick={performSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ----------------------------------------------------------- */
/* Page                                                         */
/* ----------------------------------------------------------- */
export default function CashManagementPage() {
  const { isOpen, shiftId, listCashMoves, getSummary, cashMove } = useShift();

  const [openCashIn, setOpenCashIn] = useState(false);
  const [openCashOut, setOpenCashOut] = useState(false);

  const [entries, setEntries] = useState([]);
  const [drawerTotal, setDrawerTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const canTransact = Boolean(isOpen && shiftId);

  const loadData = async () => {
    if (!shiftId) {
      setEntries([]);
      setDrawerTotal(0);
      return;
    }

    setLoading(true);
    try {
      const [movesRes, summaryRes] = await Promise.all([
        listCashMoves(shiftId),
        getSummary(shiftId),
      ]);

      setEntries(mapMovesToEntries(movesRes?.items || []));
      setDrawerTotal(Number(summaryRes?.cash_drawer?.expected_cash || 0));
    } catch (e) {
      console.error("[CashManagement] load failed:", e);
      setEntries([]);
      setDrawerTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId]);

  const handleAddEntry = async (entry) => {
    if (!canTransact) {
      return { ok: false, message: "No active shift. Please open a shift first." };
    }

    try {
      await cashMove({
        shift_id: shiftId,
        type: entry.type,
        amount: entry.amount,
        reason: entry.comment || undefined,
        denominations: entry.denominations || [],
      });

      await loadData();
      return { ok: true };
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Unable to record cash move.";
      return { ok: false, message: msg };
    }
  };

  if (!isOpen || !shiftId) {
    return (
      <Box p={4}>
        <Paper sx={{ maxWidth: 560, mx: "auto", p: 3, borderRadius: 3 }}>
          <Typography fontWeight={900}>No open shift</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Open a shift first to use Cash In / Out.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box p={4} minHeight="100vh" bgcolor="transparent">
      <Paper
        elevation={2}
        sx={(t) => ({
          bgcolor: t.palette.background.paper,
          color: t.palette.text.primary,
          maxWidth: 560,
          mx: "auto",
          p: 3,
          borderRadius: 3,
        })}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography fontWeight={900} fontSize="1.25rem">
            Cash In/Out
          </Typography>
          <Button size="small" variant="outlined" onClick={loadData} disabled={loading}>
            Refresh
          </Button>
        </Box>

        <Box mb={2}>
          <Typography fontSize="0.85rem" color="text.secondary">
            Amount
          </Typography>
          <Typography fontWeight={900} fontSize="1.4rem">
            {PHP(drawerTotal)}
          </Typography>
          <Divider sx={(t) => ({ bgcolor: t.palette.divider, mt: 1 })} />
        </Box>

        <Box display="flex" gap={2} mb={3} mt={1}>
          <Button
            fullWidth
            variant="contained"
            onClick={() => setOpenCashIn(true)}
            sx={{ fontWeight: 900, bgcolor: "#8b5a2b", "&:hover": { bgcolor: "#754821" } }}
            disabled={!canTransact}
          >
            Cash IN
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={() => setOpenCashOut(true)}
            sx={{ fontWeight: 900, bgcolor: "#8b5a2b", "&:hover": { bgcolor: "#754821" } }}
            disabled={!canTransact}
          >
            Cash OUT
          </Button>
        </Box>

        <Typography fontWeight={900} color="success.main" fontSize="1.1rem" mb={1}>
          Cash In / Cash Out Transactions
        </Typography>

        {loading ? (
          <Box py={4} display="flex" justifyContent="center">
            <CircularProgress size={28} />
          </Box>
        ) : entries.length === 0 ? (
          <Typography color="text.secondary" fontStyle="italic" fontSize="0.95rem">
            No transactions yet.
          </Typography>
        ) : (
          entries.map((entry, idx) => (
            <Box key={idx} py={1}>
              <Box display="flex" alignItems="center" fontSize="0.95rem" fontFamily="monospace">
                <Box width="90px">
                  <Typography>{entry.time}</Typography>
                </Box>
                <Box width="110px">
                  <Typography>{entry.type === "cash_in" ? "Cash In" : "Cash Out"}</Typography>
                </Box>
                <Box flex={1} textAlign="right">
                  <Typography
                    fontWeight={900}
                    color={entry.type === "cash_in" ? "success.main" : "error.main"}
                  >
                    {entry.type === "cash_in" ? "+" : "-"}
                    {PHP(entry.amount)}
                  </Typography>
                </Box>
              </Box>

              {entry.denominations?.length > 0 && (
                <Box ml={2} mt={0.5}>
                  {entry.denominations.map((d, i) => (
                    <Typography key={i} variant="body2" color="text.secondary">
                      ₱{d.denom_value} × {d.qty} = ₱{(d.denom_value * d.qty).toFixed(2)}
                    </Typography>
                  ))}
                </Box>
              )}

              <Divider sx={(t) => ({ borderColor: t.palette.divider, mt: 1 })} />
            </Box>
          ))
        )}
      </Paper>

      <CashModal
        open={openCashIn}
        onClose={() => setOpenCashIn(false)}
        type="cash_in"
        onSubmit={handleAddEntry}
      />
      <CashModal
        open={openCashOut}
        onClose={() => setOpenCashOut(false)}
        type="cash_out"
        onSubmit={handleAddEntry}
      />
    </Box>
  );
}