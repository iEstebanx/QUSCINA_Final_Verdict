// QUSCINA_BACKOFFICE/Frontend/src/components/POS/FloatingShiftModal.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

/** ---- Focus helpers to avoid "Blocked aria-hidden..." warning ---- */
export function blurActive() {
  const el = document.activeElement;
  if (el && typeof el.blur === "function") {
    try { el.blur(); } catch {}
  }
}

export function openSafely(setter) {
  blurActive();
  Promise.resolve().then(() => setter(true));
}

// ------------------------- Shift suggestion helpers -------------------------
const EARLY_OPEN_WINDOW_MINUTES = 60;

const SHIFT_TEMPLATES = [
  { code: "SHIFT_1", name: "First Shift", start: "08:00", end: "15:00" },
  { code: "SHIFT_2", name: "Second Shift", start: "15:00", end: "22:00" },
];

function parseHHMMtoTodayDate(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}
function minutesDiff(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 60000);
}
function suggestShift(now = new Date()) {
  const windows = SHIFT_TEMPLATES.map((t) => ({
    ...t,
    startDate: parseHHMMtoTodayDate(t.start),
    endDate: parseHHMMtoTodayDate(t.end),
  }));

  const inside = windows.find((w) => now >= w.startDate && now < w.endDate);
  if (inside) return inside;

  const upcoming = windows.find((w) => now < w.startDate);
  return upcoming || windows[windows.length - 1];
}

// --- Terminal label helper (UI only) ---
const terminalLabel = (idOrText) => {
  const s = String(idOrText ?? "");
  // UI label only: TERMINAL-1 / TERMINAL-2 / etc -> TERMINAL
  return s.replace(/TERMINAL-\d+/gi, "TERMINAL");
};

// ------------------------- Denoms + validation -------------------------
const denominations = [
  { label: "₱1", value: 1 },
  { label: "₱5", value: 5 },
  { label: "₱10", value: 10 },
  { label: "₱20", value: 20 },
  { label: "₱50", value: 50 },
  { label: "₱100", value: 100 },
  { label: "₱200", value: 200 },
  { label: "₱500", value: 500 },
  { label: "₱1000", value: 1000 },
];

const MIN_OPENING_FLOAT = 1_000; // ₱1,000
const MAX_OPENING_FLOAT = 500_000; // ₱500,000

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

export default function FloatingShiftModal({
  open,
  onClose,
  onShiftOpened,
  terminalId,
  refreshLatestShift,
  openShift,
}) {
  const theme = useTheme();

  // ✅ Keep "now" fresh while the dialog is open (shift suggestion updates)
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    if (!open) return;
    setNowTick(new Date());
    const id = setInterval(() => setNowTick(new Date()), 30_000);
    return () => clearInterval(id);
  }, [open]);

  // ✅ Suggested shift based on current time
  const suggested = useMemo(() => suggestShift(nowTick), [nowTick]);

  // (optional) keep selectedShift in sync (even though dropdown is disabled)
  const [_selectedShift, setSelectedShift] = useState(() => suggestShift(new Date()));
  useEffect(() => {
    if (!open) return;
    setSelectedShift(suggested);
  }, [open, suggested]);

  const [earlyDialog, setEarlyDialog] = useState({
    open: false,
    message: "",
    earlyMinutes: 0,
  });
  const [earlyReason, setEarlyReason] = useState("");
  const [earlyNote, setEarlyNote] = useState("");
  const [pendingOpenPayload, setPendingOpenPayload] = useState(null);

  const [quantities, setQuantities] = useState({});
  const [entryMode, setEntryMode] = useState("quick");
  const [submitting, setSubmitting] = useState(false);

  const [conflict, setConflict] = useState(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  const showShiftConflict = (msg, tid) => {
    setConflict({
      terminalId: tid,
      employeeName: null,
      employeeId: null,
      message: terminalLabel(msg) || "A shift is already open. Please remit/close the current shift first.",
    });
    setConflictOpen(true);
  };

  const handleDropdownChange = (denom, value) => {
    setQuantities((prev) => ({
      ...prev,
      [denom]: value,
    }));
  };

  const handleManualChange = (denom, raw) => {
    const num = Number(raw);
    setQuantities((prev) => ({
      ...prev,
      [denom]: Number.isFinite(num) && num >= 0 ? num : 0,
    }));
  };

  const calculateTotal = () =>
    denominations.reduce((total, { value }) => {
      const qty = quantities[value] || 0;
      return total + value * qty;
    }, 0);

  const handleOpenShift = async () => {
    const total = calculateTotal();

    if (total < MIN_OPENING_FLOAT) {
      const formattedMin = MIN_OPENING_FLOAT.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedTotal = total.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      window.alert(
        `Opening float must be at least ₱${formattedMin}. You entered ₱${formattedTotal}.`
      );
      return;
    }

    if (total > MAX_OPENING_FLOAT) {
      const formattedMax = MAX_OPENING_FLOAT.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedTotal = total.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      window.alert(
        `Opening float cannot exceed ₱${formattedMax}. You entered ₱${formattedTotal}.`
      );
      return;
    }

    const denoms = denominations.map((d) => ({
      denom_value: d.value,
      qty: Number(quantities[d.value] || 0),
    }));
    const tid = terminalId || "TERMINAL-1";

    setSubmitting(true);
    try {
      const now = new Date();

      // ✅ MUST use suggested shift (not user-selectable)
      const shiftStart = parseHHMMtoTodayDate(suggested.start);

      const earlyMinutes = Math.max(0, minutesDiff(shiftStart, now));
      const isTooEarly = earlyMinutes > EARLY_OPEN_WINDOW_MINUTES;

      const payload = {
        terminal_id: tid,
        opening_float: total,
        denominations: denoms,
        note: "",

        shift_code: suggested.code,
        shift_name: suggested.name,
        scheduled_start: suggested.start,
        scheduled_end: suggested.end,

        opened_early: earlyMinutes > 0 ? 1 : 0,
        early_minutes: earlyMinutes,
        early_reason: earlyReason || null,
        early_note: earlyNote || null,
      };

      if (isTooEarly) {
        setPendingOpenPayload(payload);
        setEarlyDialog({
          open: true,
          earlyMinutes,
          message:
            `You are opening ${suggested.name} about ${earlyMinutes} minutes early.\n` +
            `This will be recorded in the shift log. Continue?`,
        });
        setSubmitting(false);
        return;
      }

      const shift = await openShift(payload);

      if (typeof refreshLatestShift === "function") {
        await refreshLatestShift();
      }

      if (typeof onShiftOpened === "function") {
        onShiftOpened(shift || null);
      }
    } catch (err) {
      console.error("[Backoffice POS] open shift failed", err);

      const msg = String(err?.message || "");
      const msgLower = msg.toLowerCase();

      // ✅ Catch "already open" even when openShift throws new Error("...") (no status/code)
      const looksLikeConflict =
        err?.status === 409 ||
        (err?.code && String(err.code).startsWith("SHIFT_")) ||
        msgLower.includes("already open") ||
        msgLower.includes("shift is already open");

      if (looksLikeConflict) {
        showShiftConflict(msg || "A shift is already open.", tid);
        return; // ✅ hard stop: no refresh, no onShiftOpened
      }

      // keep alerts for non-conflict errors
      window.alert(err?.message || "Failed to open shift");
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = calculateTotal();
  const coins = denominations.filter((d) => d.value <= 20);
  const bills = denominations.filter((d) => d.value > 20);

  const sidebarContrast =
    theme.palette.secondary.contrastText ??
    theme.palette.getContrastText(theme.palette.secondary.main);

  const renderInputField = (denom) => {
    const { label, value } = denom;
    const currentValue = quantities[value];
    const numericValue =
      typeof currentValue === "number" && Number.isFinite(currentValue)
        ? currentValue
        : 0;

    if (entryMode === "manual") {
      return (
        <TextField
          key={value}
          fullWidth
          label={label}
          sx={{ minWidth: 140 }}
          type="number"
          size="small"
          variant="outlined"
          value={numericValue}
          onChange={(e) => handleManualChange(value, e.target.value)}
          inputProps={{ min: 0 }}
        />
      );
    }

    const hasPreset = quantityOptions.some((opt) => opt.value === numericValue);
    const options =
      !hasPreset && numericValue !== 0
        ? [{ value: numericValue, label: `Custom (${numericValue})` }, ...quantityOptions]
        : quantityOptions;

    return (
      <TextField
        key={value}
        select
        fullWidth
        label={label}
        sx={{ minWidth: 140 }}
        value={numericValue}
        onChange={(e) => handleDropdownChange(value, Number(e.target.value))}
        size="small"
        variant="outlined"
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          width: "95%",
          maxWidth: 600,
          mx: "auto",
        },
      }}
    >
      <DialogTitle
        sx={{
          bgcolor: theme.palette.secondary.main,
          color: sidebarContrast,
          py: 2,
        }}
      >
        Open Shift
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          bgcolor: theme.palette.background.paper,
          px: 3,
          py: 3,
        }}
      >
        <Typography
          sx={{
            color: theme.palette.text.primary,
            mb: 2,
            fontSize: "1rem",
            textAlign: "center",
          }}
        >
          Select quantity for each denomination using presets or enter manually.
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Paper
            variant="outlined"
            sx={{
              px: 1.5,
              py: 1.1,
              borderRadius: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              bgcolor: alpha(theme.palette.text.primary, 0.03),
              borderColor: alpha(theme.palette.text.primary, 0.12),
            }}
          >
            <Box
              sx={{
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {suggested.name}
              </Typography>

              <Typography
                variant="body2"
                sx={{
                  opacity: 0.75,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                ({suggested.start}–{suggested.end})
              </Typography>
            </Box>

            <Chip
              size="small"
              label="Auto"
              variant="outlined"
              sx={{
                fontWeight: 700,
                bgcolor: alpha(theme.palette.success.main, 0.12),
                borderColor: alpha(theme.palette.success.main, 0.35),
              }}
            />
          </Paper>

          <Typography sx={{ mt: 0.75, fontSize: 12, opacity: 0.8 }}>
            Based on current time.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <ToggleButtonGroup
            color="primary"
            size="small"
            exclusive
            value={entryMode}
            onChange={(_e, mode) => {
              if (mode) setEntryMode(mode);
            }}
          >
            <ToggleButton value="quick">Quick Select</ToggleButton>
            <ToggleButton value="manual">Manual Entry</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box
          sx={{
            mt: 1,
            width: "100%",
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              bgcolor: theme.palette.background.default,
              borderRadius: 2,
            }}
          >
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
              Coins
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1.5} flexGrow={1}>
              {coins.map((denom) => renderInputField(denom))}
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              bgcolor: theme.palette.background.default,
              borderRadius: 2,
            }}
          >
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
              Bills
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1.5} flexGrow={1}>
              {bills.map((denom) => renderInputField(denom))}
            </Stack>
          </Paper>
        </Box>

        <Box mt={3} textAlign="center">
          <Typography fontWeight="bold" sx={{ fontSize: "1.1rem" }}>
            Total{" "}
            <Box
              component="span"
              sx={{ color: theme.palette.success.main, fontSize: "1.5rem" }}
            >
              ₱{totalAmount.toFixed(2)}
            </Box>
          </Typography>

          {totalAmount < MIN_OPENING_FLOAT && (
            <Typography sx={{ mt: 1, fontSize: "0.9rem", color: theme.palette.error.main }}>
              Minimum opening float is ₱
              {MIN_OPENING_FLOAT.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Typography>
          )}

          {totalAmount > MAX_OPENING_FLOAT && (
            <Typography sx={{ mt: 0.5, fontSize: "0.9rem", color: theme.palette.error.main }}>
              Maximum opening float is ₱
              {MAX_OPENING_FLOAT.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          bgcolor: theme.palette.background.paper,
          p: 2,
          gap: 2,
        }}
      >
        <Button onClick={onClose} sx={{ color: theme.palette.text.primary }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleOpenShift}
          color="primary"
          disabled={
            submitting ||
            totalAmount < MIN_OPENING_FLOAT ||
            totalAmount > MAX_OPENING_FLOAT
          }
        >
          {submitting ? "Opening…" : "Open Shift"}
        </Button>
      </DialogActions>

      {/* 🔴 Conflict dialog */}
      <Dialog
        open={conflictOpen}
        onClose={() => setConflictOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Cannot Open Shift</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {conflict?.message ||
              "A shift is already open. You can’t open another shift until the current one is remitted/closed."}
          </Typography>

          {conflict?.terminalId && (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Terminal: <strong>{terminalLabel(conflict.terminalId)}</strong>
              {conflict?.employeeName && (
                <>
                  {" "}
                  · Current holder: <strong>{conflict.employeeName}</strong>
                  {conflict.employeeId ? ` (ID: ${conflict.employeeId})` : ""}
                </>
              )}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictOpen(false)} variant="contained">
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* 🟠 Early open dialog */}
      <Dialog
        open={earlyDialog.open}
        onClose={() => {
          setEarlyDialog({ open: false, message: "", earlyMinutes: 0 });
          setPendingOpenPayload(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Open Shift Early?</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ whiteSpace: "pre-line" }}>{earlyDialog.message}</Typography>

          {/* Keep reason commented (as in your Cart.jsx) */}
          {/* <TextField ... /> */}

          <TextField
            fullWidth
            size="small"
            label="Note (optional)"
            value={earlyNote}
            onChange={(e) => setEarlyNote(e.target.value)}
            sx={{ mt: 2 }}
            inputProps={{ maxLength: 255 }}
          />
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => {
              setEarlyDialog({ open: false, message: "", earlyMinutes: 0 });
              setPendingOpenPayload(null);
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={async () => {
              if (!pendingOpenPayload) return;
              setSubmitting(true);
              try {
                const payload = {
                  ...pendingOpenPayload,
                  early_reason: earlyReason || null,
                  early_note: earlyNote || null,
                };
                const shift = await openShift(payload);

                setEarlyDialog({ open: false, message: "", earlyMinutes: 0 });
                setPendingOpenPayload(null);

                if (typeof refreshLatestShift === "function") {
                  await refreshLatestShift();
                }
                if (typeof onShiftOpened === "function") {
                  onShiftOpened(shift || null);
                }
              } catch (err) {
                console.error("[Backoffice POS] open shift failed", err);

                const msg = String(err?.message || "");
                const msgLower = msg.toLowerCase();

                const looksLikeConflict =
                  err?.status === 409 ||
                  (err?.code && String(err.code).startsWith("SHIFT_")) ||
                  msgLower.includes("already open") ||
                  msgLower.includes("shift is already open");

                if (looksLikeConflict) {
                  showShiftConflict(
                    msg || "A shift is already open.",
                    pendingOpenPayload?.terminal_id || terminalId || "TERMINAL-1"
                  );
                  return; // ✅ hard stop
                }

                window.alert(err?.message || "Failed to open shift");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}