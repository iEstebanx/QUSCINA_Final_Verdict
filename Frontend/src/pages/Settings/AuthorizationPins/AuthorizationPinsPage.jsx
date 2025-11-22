// Frontend/src/pages/Settings/AuthorizationPins/AuthorizationPinPage.jsx
import { useState, useEffect, useRef } from "react";
import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Tooltip,
  InputAdornment,
} from "@mui/material";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

const ACTIONS = [
  { key: "void_order", label: "Void order" },
  { key: "refund", label: "Refund transaction" },
  {
    key: "open_shift_cash_limit",
    label: "Open shift when cash in drawer exceeds limit",
  },
];

export default function AuthorizationPinsPage() {
  const [hasPin, setHasPin] = useState(false);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState("set"); // "set" | "change"

  // 6-digit arrays for each PIN row
  const [currentPinDigits, setCurrentPinDigits] = useState(Array(6).fill(""));
  const [newPinDigits, setNewPinDigits] = useState(Array(6).fill(""));
  const [confirmPinDigits, setConfirmPinDigits] = useState(Array(6).fill(""));

  const [pinVisibility, setPinVisibility] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const [pinError, setPinError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");

  // refs for auto-focus between boxes
  const currentRefs = Array.from({ length: 6 }).map(() => useRef(null));
  const newRefs = Array.from({ length: 6 }).map(() => useRef(null));
  const confirmRefs = Array.from({ length: 6 }).map(() => useRef(null));

  const resetPinForm = () => {
    setCurrentPinDigits(Array(6).fill(""));
    setNewPinDigits(Array(6).fill(""));
    setConfirmPinDigits(Array(6).fill(""));
    setPinVisibility({ current: false, next: false, confirm: false });
    setPinError("");
  };

  // Load current PIN status on mount
  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      setPageError("");
      try {
        const res = await fetch("/api/settings/authorization-pins", {
          credentials: "include",
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Failed to load PIN status");
        }

        const data = await res.json();
        if (ignore) return;

        setHasPin(!!data.hasPin);
      } catch (err) {
        if (ignore) return;
        setPageError(err.message || "Failed to load PIN status");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenSetPin = () => {
    setPinDialogMode("set");
    resetPinForm();
    setPinDialogOpen(true);
  };

  const handleOpenChangePin = () => {
    setPinDialogMode("change");
    resetPinForm();
    setPinDialogOpen(true);
  };

  const handleCloseDialog = () => {
    if (saving) return;
    setPinDialogOpen(false);
    resetPinForm();
  };

  const validatePinFields = () => {
    const pinPattern = /^\d{6}$/; // exactly 6 digits

    const currentPin = currentPinDigits.join("");
    const newPin = newPinDigits.join("");
    const confirmPin = confirmPinDigits.join("");

    if (pinDialogMode === "change" && !currentPin.trim()) {
      setPinError("Please enter your current PIN.");
      return false;
    }

    if (!pinPattern.test(newPin)) {
      setPinError("PIN must be exactly 6 digits.");
      return false;
    }

    if (newPin !== confirmPin) {
      setPinError("New PIN and confirm PIN do not match.");
      return false;
    }

    setPinError("");
    return true;
  };

  const handleSavePin = async () => {
    if (!validatePinFields()) return;

    setSaving(true);
    setPinError("");

    const currentPin = currentPinDigits.join("");
    const newPin = newPinDigits.join("");

    try {
      const res = await fetch("/api/settings/authorization-pins", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: pinDialogMode, // "set" or "change"
          currentPin: currentPin || null,
          newPin,
          app: "backoffice", // explicit, but backend defaults anyway
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Failed to save PIN");
      }

      setHasPin(true);
      setPinDialogOpen(false);
      resetPinForm();
    } catch (err) {
      setPinError(err.message || "Failed to save PIN");
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle =
    pinDialogMode === "set" ? "Set authorization PIN" : "Change authorization PIN";

  // reusable 6-digit row renderer
  const renderPinRow = ({
    label,
    digits,
    setDigits,
    refs,
    visibilityKey,
  }) => {
    const visible = pinVisibility[visibilityKey];

    return (
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {label}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="nowrap">
          <LockOutlinedIcon fontSize="small" />
          <Stack direction="row" spacing={0.5}>
            {digits.map((d, i) => (
              <TextField
                key={i}
                size="small"
                inputRef={refs[i]}
                value={visible ? d : d ? "•" : ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(-1);
                  setDigits((prev) => {
                    const arr = [...prev];
                    arr[i] = v;
                    return arr;
                  });
                  if (v && i < 5) refs[i + 1].current?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) {
                    refs[i - 1].current?.focus();
                  }
                }}
                slotProps={{
                  htmlInput: {
                    inputMode: "numeric",
                    pattern: "[0-9]*",
                    maxLength: 1,
                    style: { textAlign: "center", width: 28 },
                    "aria-label": `${label} digit ${i + 1}`,
                  },
                }}
                sx={{
                  "& .MuiInputBase-input": { p: "8px 6px" },
                  width: 34,
                }}
              />
            ))}
          </Stack>
          <Tooltip title={visible ? "Hide PIN" : "Show PIN"}>
            <IconButton
              size="small"
              onClick={() =>
                setPinVisibility((prev) => ({
                  ...prev,
                  [visibilityKey]: !prev[visibilityKey],
                }))
              }
            >
              {visible ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    );
  };

  return (
    <Box sx={{ p: 2, maxWidth: 960, mx: "auto", display: "grid", gap: 2 }}>
      <Typography variant="h5" fontWeight={600}>
        Authorization PINs
      </Typography>

      {pageError && (
        <Typography variant="body2" color="error">
          {pageError}
        </Typography>
      )}

      {/* Action matrix */}
      <Paper sx={{ p: 2.5, display: "grid", gap: 2, opacity: loading ? 0.5 : 1 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Protected actions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The actions below require an authorization PIN before they can be completed.
          </Typography>
        </Box>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ACTIONS.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.label}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {/* PIN management actions */}
      <Paper
        sx={{
          p: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: loading ? 0.5 : 1,
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Authorization PIN
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hasPin
              ? "A PIN is currently configured. You can change or reset it at any time."
              : "No authorization PIN is set yet. Set a PIN to protect the actions above."}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant={hasPin ? "outlined" : "contained"}
            size="small"
            onClick={handleOpenSetPin}
            disabled={loading}
          >
            {hasPin ? "Reset PIN" : "Set PIN"}
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleOpenChangePin}
            disabled={!hasPin || loading}
          >
            Change PIN
          </Button>
        </Stack>
      </Paper>

      {/* PIN dialog */}
      <Dialog
        open={pinDialogOpen}
        onClose={handleCloseDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          {pinDialogMode === "change" &&
            renderPinRow({
              label: "Current PIN",
              digits: currentPinDigits,
              setDigits: setCurrentPinDigits,
              refs: currentRefs,
              visibilityKey: "current",
            })}

          {renderPinRow({
            label: "New PIN",
            digits: newPinDigits,
            setDigits: setNewPinDigits,
            refs: newRefs,
            visibilityKey: "next",
          })}

          {renderPinRow({
            label: "Confirm new PIN",
            digits: confirmPinDigits,
            setDigits: setConfirmPinDigits,
            refs: confirmRefs,
            visibilityKey: "confirm",
          })}

          <Typography variant="caption" color="text.secondary">
            Use a 6-digit numeric PIN. Avoid obvious patterns like 000000 or 123456.
          </Typography>

          {pinError && (
            <Typography variant="body2" color="error">
              {pinError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSavePin} disabled={saving}>
            {saving ? "Saving..." : "Save PIN"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}