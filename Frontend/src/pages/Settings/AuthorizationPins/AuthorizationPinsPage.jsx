// Frontend/src/pages/Settings/AuthorizationPins/AuthorizationPinPage.jsx
import { useState } from "react";
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
} from "@mui/material";

const ACTIONS = [
  { key: "void_order", label: "Void order" },
  { key: "refund", label: "Refund transaction" },
  {
    key: "open_shift_cash_limit",
    label: "Open shift when cash in drawer exceeds limit",
  },
];

export default function AuthorizationPinsPage() {
  // simple local state to track if a PIN is configured
  const [hasPin, setHasPin] = useState(false);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState("set"); // "set" | "change"
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");

  const resetPinForm = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinError("");
  };

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
    setPinDialogOpen(false);
    resetPinForm();
  };

  const validatePinFields = () => {
    const pinPattern = /^\d{4,6}$/; // 4–6 digit numeric PIN

    if (pinDialogMode === "change" && !currentPin.trim()) {
      setPinError("Please enter your current PIN.");
      return false;
    }

    if (!pinPattern.test(newPin)) {
      setPinError("PIN must be 4–6 digits.");
      return false;
    }

    if (newPin !== confirmPin) {
      setPinError("New PIN and confirm PIN do not match.");
      return false;
    }

    setPinError("");
    return true;
  };

  const handleSavePin = () => {
    if (!validatePinFields()) return;

    // TODO: call backend API here to set / change PIN
    // e.g. POST /api/settings/authorization-pin

    setHasPin(true);
    setPinDialogOpen(false);
    resetPinForm();
  };

  const dialogTitle =
    pinDialogMode === "set" ? "Set authorization PIN" : "Change authorization PIN";

  return (
    <Box sx={{ p: 2, maxWidth: 960, mx: "auto", display: "grid", gap: 2 }}>
      <Typography variant="h5" fontWeight={600}>
        Authorization PINs
      </Typography>

      {/* Action matrix */}
      <Paper sx={{ p: 2.5, display: "grid", gap: 2 }}>
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
      <Paper sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Authorization PIN
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hasPin
              ? "A PIN is currently configured. You can change it at any time."
              : "No authorization PIN is set yet. Set a PIN to protect the actions above."}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant={hasPin ? "outlined" : "contained"}
            size="small"
            onClick={handleOpenSetPin}
          >
            {hasPin ? "Reset PIN" : "Set PIN"}
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleOpenChangePin}
            disabled={!hasPin}
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
          {pinDialogMode === "change" && (
            <TextField
              label="Current PIN"
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              inputProps={{ maxLength: 6, inputMode: "numeric" }}
              fullWidth
            />
          )}

          <TextField
            label="New PIN"
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            inputProps={{ maxLength: 6, inputMode: "numeric" }}
            fullWidth
          />

          <TextField
            label="Confirm new PIN"
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            inputProps={{ maxLength: 6, inputMode: "numeric" }}
            fullWidth
          />

          <Typography variant="caption" color="text.secondary">
            Use a 4–6 digit numeric PIN. Avoid obvious patterns like 0000 or 1234.
          </Typography>

          {pinError && (
            <Typography variant="body2" color="error">
              {pinError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePin}>
            Save PIN
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}