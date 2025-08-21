// src/pages/Discounts/DiscountPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, InputAdornment, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import {
  subscribeDiscounts,
  createDiscountAuto,
  updateDiscount,
  deleteMany
} from "@/services/Discounts/discounts";

function percentClamp(n) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export default function DiscountPage() {
  const [rows, setRows] = useState([]);

  // selection
  const [selected, setSelected] = useState([]);
  const allChecked = rows.length > 0 && selected.length === rows.length;
  const someChecked = selected.length > 0 && selected.length < rows.length;

  useEffect(() => {
    const unsub = subscribeDiscounts(({ rows }) => {
      setRows(rows);
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

  // dialog (create/edit)
  const [open, setOpen] = useState(false);
  const [editingCode, setEditingCode] = useState(null); // null = create, string = edit
  const isEdit = Boolean(editingCode);

  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const resetForm = () => {
    setName("");
    setValue("");
    setTouched(false);
    setEditingCode(null);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditingCode(row.id);
    setName(row.name ?? "");
    setValue(String(row.value ?? ""));
    setTouched(false);
    setOpen(true);
  };

  const onSave = async () => {
    setTouched(true);
    const pct = percentClamp(parseFloat(String(value).replace(",", ".")));
    const valid = name.trim().length > 0 && !Number.isNaN(pct);
    if (!valid) return;

    const payload = {
      name: name.trim(),
      value: pct,
      type: "percent",
      scope: "order",
      isStackable: false,
      requiresApproval: false,
      isActive: true,
    };

    try {
      if (isEdit) {
        await updateDiscount(editingCode, { name: payload.name, value: payload.value });
      } else {
        await createDiscountAuto(payload);
      }
      setOpen(false);
      resetForm();
    } finally {
      setEditingCode(null);
    }
  };

  const onDeleteSelected = async () => {
    if (!selected.length) return;
    await deleteMany(selected);
    setSelected([]);
  };

  // pagination
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const page = pageState.page;
  const rowsPerPage = pageState.rowsPerPage;
  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const nameError = touched && name.trim().length === 0;
  const valueNum = percentClamp(parseFloat(String(value).replace(",", ".")));
  const valueError = touched && (Number.isNaN(valueNum) || String(value).trim() === "");

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
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
                <Checkbox
                  checked={allChecked}
                  indeterminate={someChecked}
                  onChange={toggleAll}
                />
              </TableCell>
              <TableCell><Typography fontWeight={600}>Item Name</Typography></TableCell>
              <TableCell width={220}><Typography fontWeight={600}>Value</Typography></TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {paged.map((r) => (
              <TableRow
                key={r.id}
                hover
                onClick={() => { openEdit(r); }}
                sx={(theme) => ({
                  cursor: "pointer",
                  "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.04) },
                })}
              >
                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.includes(r.id)}
                    onChange={() => toggleOne(r.id)}
                  />
                </TableCell>

                {/* Name */}
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography>{r.name}</Typography>
                    {r.isActive === false && (
                      <Chip size="small" label="Inactive" variant="outlined" />
                    )}
                  </Stack>
                </TableCell>

                {/* Value */}
                <TableCell>
                  <Typography fontWeight={700}>{r.value}%</Typography>
                </TableCell>
              </TableRow>
            ))}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
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
          onPageChange={(_, p) => setPageState((s) => ({ ...s, page: p }))}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => setPageState({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </TableContainer>

      {/* Create/Edit dialog */}
      <Dialog
        open={open}
        onClose={() => { setOpen(false); resetForm(); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Stack alignItems="center" spacing={1}>
            <LocalOfferOutlinedIcon sx={{ fontSize: 56 }} color="error" />
            <Typography variant="h5" fontWeight={800}>
              {isEdit ? "Edit Discount" : "Type of Discount"}
            </Typography>
            {isEdit && (
              <Typography variant="body2" color="text.secondary">
                Code: {editingCode}
              </Typography>
            )}
          </Stack>
        </DialogTitle>

        <Divider />

        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Name of Discount"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError}
              helperText={nameError ? "Please enter a name." : " "}
              autoFocus
              fullWidth
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
            />
            <TextField
              label="Value"
              value={value}
              onChange={(e) => {
                let raw = e.target.value.replace(/\D/g, "");
                if (raw.length > 3) raw = raw.slice(0, 3);
                setValue(raw);
              }}
              type="number"
              inputProps={{ min: 0, max: 100, step: 1 }}
              error={valueError}
              helperText={valueError ? "Enter a number from 0 to 100." : " "}
              fullWidth
              slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => { setOpen(false); resetForm(); }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onSave}
            disabled={name.trim().length === 0 || Number.isNaN(valueNum)}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}