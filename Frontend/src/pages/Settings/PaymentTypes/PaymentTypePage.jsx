// Frontend/src/pages/Settings/PaymentTypes/PaymentTypePage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  IconButton,
  Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useAlert } from "@/context/Snackbar/AlertContext";

export default function PaymentTypePage() {
  const alert = useAlert();
  // If you renamed to PaymentTypes/index.js, change to "/api/settings/payment-types".
  const API_BASE = "/api/settings/payment-type";

  // Data
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Selection
  const [selected, setSelected] = useState([]);
  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const someChecked = rows.some((r) => selected.includes(r.id)) && !allChecked;

  const toggleAll = () => {
    const ids = rows.map((r) => r.id);
    const everyIncluded = ids.every((id) => selected.includes(id));
    setSelected((s) =>
      everyIncluded ? s.filter((id) => !ids.includes(id)) : Array.from(new Set([...s, ...ids]))
    );
  };
  const toggleOne = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  // Dialog (create only)
  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState("");
  const nameError = name.trim().length === 0;

  // Delete confirms
  const [deleteOpen, setDeleteOpen] = useState(false); // bulk confirm
  const [deleteOne, setDeleteOne] = useState({ open: false, id: null, name: "" }); // single confirm

  // Load
  async function loadPaymentTypes() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(API_BASE, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Load failed (HTTP ${res.status})`);
      const list = Array.isArray(data.paymentTypes) ? data.paymentTypes : [];
      setRows(list.map((x) => ({ id: String(x.id), name: x.name, active: x.active, sortOrder: x.sortOrder })));
    } catch (e) {
      setErr(e?.message || "Failed to load payment types.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadPaymentTypes(); }, []);

  // Create
  async function onSave() {
    if (nameError) return;
    try {
      const payload = { name: name.trim() };
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.code === "name_taken") throw new Error("Payment type already exists.");
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Save failed (HTTP ${res.status})`);
      alert.success("Payment type added.");
      setName("");
      setOpenCreate(false);
      await loadPaymentTypes();
    } catch (e) {
      alert.error(e?.message || "Failed to save.");
    }
  }

  // Bulk delete
  async function onDeleteSelected() {
    if (!selected.length) return;
    try {
      const res = await fetch(API_BASE, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      alert.info(`Deleted ${selected.length} payment type${selected.length > 1 ? "s" : ""}.`);
      setSelected([]);
      await loadPaymentTypes();
    } catch (e) {
      alert.error(e?.message || "Failed to delete.");
    }
  }

  // Single delete
  async function onDeleteOneConfirmed() {
    if (!deleteOne.id) return;
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(deleteOne.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      // unselect if selected
      setSelected((prev) => prev.filter((x) => x !== deleteOne.id));
      alert.info(`Deleted "${deleteOne.name || "payment type"}".`);
      setDeleteOne({ open: false, id: null, name: "" });
      await loadPaymentTypes();
    } catch (e) {
      alert.error(e?.message || "Failed to delete.");
    }
  }

  const displayRows = useMemo(() => rows, [rows]);

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        {/* Header */}
        <Box p={2}>
          <Stack
            direction="row"
            useFlexGap
            alignItems="center"
            flexWrap="wrap"
            rowGap={1.5}
            columnGap={2}
            sx={{ minWidth: 0 }}
          >
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenCreate(true)}
              sx={{ flexShrink: 0 }}
            >
              Add Payment Type
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

            {/* Bulk delete icon button */}
            <Tooltip title={selected.length ? "Delete selected" : "Nothing selected"}>
              <span>
                <IconButton
                  aria-label="Delete selected"
                  color="error"
                  disabled={!selected.length}
                  onClick={() => setDeleteOpen(true)}
                  sx={{ flexShrink: 0 }}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>

        <Divider />

        {/* Table */}
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{
              mx: "auto",
              width: { xs: "100%", sm: "auto" },
              maxWidth: 720,
              borderRadius: 2,
            }}
          >
            <Table
              stickyHeader
              aria-label="payment types table"
              sx={{ tableLayout: "fixed", minWidth: 560 }}>
              <colgroup>
                <col style={{ width: 56 }} />
                <col style={{ minWidth: 280 }} />
                <col style={{ width: 100 }} />
              </colgroup>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Name</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography fontWeight={600}>Actions</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2">Loading…</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && err && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="error">{err}</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}

                {displayRows.map((r) => (
                  <TableRow
                    key={r.id}
                    hover
                    sx={(theme) => ({
                      cursor: "default",
                      "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.04) },
                    })}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox checked={selected.includes(r.id)} onChange={() => toggleOne(r.id)} />
                    </TableCell>

                    <TableCell sx={{ overflow: "hidden" }}>
                      <Typography noWrap title={r.name}>{r.name}</Typography>
                    </TableCell>

                    <TableCell align="center">
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteOne({ open: true, id: r.id, name: r.name })}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}

                {displayRows.length === 0 && !loading && !err && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No payment types yet. Click <strong>Add Payment Type</strong> to create one.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Paper>

      {/* Create dialog */}
      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          Add Payment Type
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Box mt={1}>
            <TextField
              autoFocus
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={name.length > 0 && nameError}
              helperText={name.length > 0 && nameError ? "Please enter a name." : " "}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setOpenCreate(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={nameError}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Single-delete Confirm Dialog */}
      <Dialog
        open={deleteOne.open}
        onClose={() => setDeleteOne({ open: false, id: null, name: "" })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete payment type?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleteOne.name || "this payment type"}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOne({ open: false, id: null, name: "" })}>Cancel</Button>
          <Button color="error" variant="contained" onClick={onDeleteOneConfirmed}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk-delete Confirm Dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete selected?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete {selected.length} payment type{selected.length > 1 ? "s" : ""}? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              setDeleteOpen(false);
              await onDeleteSelected();
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}