// src/pages/Discounts/DiscountPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, InputAdornment, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
  Alert
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import {
  subscribeDiscounts,
  createDiscount,
  deleteMany
} from "@/services/discounts";

function percentClamp(n) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export default function DiscountPage() {
  const [rows, setRows] = useState([]);
  const [fromCache, setFromCache] = useState(false);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  // selection
  const [selected, setSelected] = useState([]);
  const allChecked = rows.length > 0 && selected.length === rows.length;
  const someChecked = selected.length > 0 && selected.length < rows.length;

  useEffect(() => {
    const unsub = subscribeDiscounts(({ rows, fromCache, hasPendingWrites }) => {
      setRows(rows);
      setFromCache(fromCache);
      setHasPendingWrites(hasPendingWrites);
      // clear selection if ids disappeared
      setSelected((sel) => sel.filter((id) => rows.some(r => r.id === id)));
    });
    return () => unsub();
  }, []);

  const toggleAll = () => {
    setSelected((s) => (s.length === rows.length ? [] : rows.map((r) => r.id)));
  };
  const toggleOne = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  // pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  // dialog
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const resetForm = () => { setCode(""); setName(""); setValue(""); setTouched(false); };

  const onSave = async () => {
    setTouched(true);
    const pct = percentClamp(parseFloat(String(value).replace(",", ".")));
    const valid =
      code.trim().length > 0 &&
      name.trim().length > 0 &&
      !Number.isNaN(pct);

    if (!valid) return;

    try {
      await createDiscount({
        code: code.trim(),
        name: name.trim(),
        type: "percent",
        value: pct,
        scope: "order",
        isStackable: false,
        requiresApproval: false,
        isActive: true,
      });
      setOpen(false);
      resetForm();
    } catch (e) {
      alert(e.message);
    }
  };

  const onDeleteSelected = async () => {
    if (!selected.length) return;
    await deleteMany(selected);
    setSelected([]);
  };

  const nameError = touched && name.trim().length === 0;
  const codeError = touched && code.trim().length === 0;
  const valueNum = percentClamp(parseFloat(String(value).replace(",", ".")));
  const valueError = touched && (Number.isNaN(valueNum) || String(value).trim() === "");

  return (
    <Stack spacing={2}>
      {/* Sync / Offline banners */}
      {hasPendingWrites && (
        <Alert severity="info">Saving changes… (will sync when online)</Alert>
      )}
      {fromCache && !hasPendingWrites && (
        <Alert severity="warning">You’re viewing cached data (offline)</Alert>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          Add Discount
        </Button>

        <IconButton
          aria-label="Delete selected"
          onClick={onDeleteSelected}
          disabled={!selected.length}
          title="Delete selected"
        >
          <DeleteOutlineIcon />
        </IconButton>
      </Stack>

      <TableContainer component={Paper}>
        <Table size="medium">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
              </TableCell>
              <TableCell><Typography fontWeight={600}>Code</Typography></TableCell>
              <TableCell><Typography fontWeight={600}>Item Name</Typography></TableCell>
              <TableCell width={180}><Typography fontWeight={600}>Value</Typography></TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {paged.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell padding="checkbox">
                  <Checkbox checked={selected.includes(r.id)} onChange={() => toggleOne(r.id)} />
                </TableCell>
                <TableCell>{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell><Typography fontWeight={600}>{r.value}%</Typography></TableCell>
              </TableRow>
            ))}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Box py={6} textAlign="center">
                    <Typography color="text.secondary">No discounts yet</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={rows.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </TableContainer>

      {/* Create dialog */}
      <Dialog open={open} onClose={() => { setOpen(false); resetForm(); }} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack alignItems="center" spacing={1}>
            <LocalOfferOutlinedIcon sx={{ fontSize: 56 }} color="error" />
            <Typography variant="h5" fontWeight={800}>Type of Discount</Typography>
          </Stack>
        </DialogTitle>

        <Divider />

        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Code (unique)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={codeError}
              helperText={codeError ? "Please enter a unique code." : " "}
              autoFocus
              fullWidth
            />
            <TextField
              label="Name of Discount"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError}
              helperText={nameError ? "Please enter a name." : " "}
              fullWidth
            />
            <TextField
              label="Value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type="number"
              inputProps={{ min: 0, max: 100, step: 1 }}
              error={valueError}
              helperText={valueError ? "Enter a number from 0 to 100." : " "}
              fullWidth
              slotProps={{
                input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }
              }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => { setOpen(false); resetForm(); }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={onSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}