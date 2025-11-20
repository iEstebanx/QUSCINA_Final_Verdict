// Frontend/src/pages/Discounts/DiscountPage.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useAlert } from "@/context/Snackbar/AlertContext";
import { useConfirm } from "@/context/Cancel&ConfirmDialog/ConfirmContext";

import {
  subscribeDiscounts,
  createDiscountAuto,
  updateDiscount,
  deleteMany,
  deleteDiscount,
} from "@/services/Discounts/discounts";

function percentClamp(n) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export default function DiscountPage() {
  const [rows, setRows] = useState([]);
  const alert = useAlert();
  const confirm = useConfirm();

  // single filter (Status only)
  const [statusFilter, setStatusFilter] = useState("all");

  // selection
  const [selected, setSelected] = useState([]);

  const handleDiscounts = useCallback(({ rows: nextRows }) => {
    setRows(nextRows);
    const validIds = new Set(nextRows.map((r) => r.id));
    setSelected((prev) => prev.filter((id) => validIds.has(id)));
  }, []);

  useEffect(() => {
    const unsub = subscribeDiscounts(handleDiscounts);
    return unsub;
  }, [handleDiscounts]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const isInactive = r.isActive === false;
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "active" && !isInactive) ||
        (statusFilter === "inactive" && isInactive);
      return statusOk;
    });
  }, [rows, statusFilter]);

  // header checkbox state is based on the filtered list
  const allChecked =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selected.includes(r.id));
  const someChecked =
    filteredRows.some((r) => selected.includes(r.id)) && !allChecked;

  const toggleAll = () => {
    const ids = filteredRows.map((r) => r.id);
    const everyIncluded = ids.every((id) => selected.includes(id));
    setSelected((s) =>
      everyIncluded ? s.filter((id) => !ids.includes(id)) : Array.from(new Set([...s, ...ids]))
    );
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
    setEditingCode(row.code);
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
        alert.success("Discount updated.");
      } else {
        await createDiscountAuto(payload);
        alert.success("Discount created.");
      }
      setOpen(false);
      resetForm();
    } catch (e) {
      alert.error(e?.message || "Failed to save discount.");
    } finally {
      setEditingCode(null);
    }
  };

  // Bulk delete with confirm
  const onDeleteSelected = async () => {
    if (!selected.length) return;

    const ok = await confirm({
      title: "Delete Selected Discounts",
      content: `Are you sure you want to delete ${selected.length} discount${selected.length > 1 ? "s" : ""}?\nThis action cannot be undone.`,
      confirmLabel: "Delete All",
      confirmColor: "error",
    });

    if (!ok) {
      const visible = new Set(filteredRows.map(r => r.id));
      setSelected(s => s.filter(id => !visible.has(id)));
      return;
    }

    try {
      await deleteMany(selected);
      alert.info(`Deleted ${selected.length} discount${selected.length > 1 ? "s" : ""}.`);
      setSelected([]);
    } catch (e) {
      alert.error(e?.message || "Failed to delete selected discounts.");
    }
  };

  // pagination (reset to page 0 when the status filter changes)
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const page = pageState.page;
  const rowsPerPage = pageState.rowsPerPage;

  useEffect(() => {
    setPageState((s) => ({ ...s, page: 0 }));
  }, [statusFilter]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const nameError = touched && name.trim().length === 0;
  const valueNum = percentClamp(parseFloat(String(value).replace(",", ".")));
  const valueError = touched && (Number.isNaN(valueNum) || String(value).trim() === "");

  // Single delete with confirm
  const onDeleteOne = async (code, discountName) => {
    const ok = await confirm({
      title: "Delete Discount",
      content: `Are you sure you want to delete "${discountName}"?\nThis action cannot be undone.`,
      confirmLabel: "Delete",
      confirmColor: "error",
    });
    if (!ok) return;

    try {
      await deleteDiscount(code); // calls DELETE /api/discounts/:code
      alert.info(`Discount "${discountName}" deleted.`);
      // also unselect if it was selected
      setSelected((s) => s.filter((x) => x !== code && x !== rows.find(r => r.code === code)?.id));
    } catch (e) {
      alert.error(e?.message || "Failed to delete discount.");
    }
  };

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        {/* Header (from ItemList pattern): wraps nicely on small screens */}
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
              onClick={openCreate}
              sx={{ flexShrink: 0 }}
            >
              Add Discount
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

            <Stack
              direction="row"
              useFlexGap
              spacing={2}
              flexWrap="wrap"
              sx={{ minWidth: 0 }}
            >
              <FormControl
                size="small"
                sx={{
                  minWidth: { xs: 140, sm: 180 },
                  flex: { xs: "1 1 160px", sm: "0 0 auto" },
                }}
              >
                <InputLabel id="discount-status-label">Status</InputLabel>
                <Select
                  labelId="discount-status-label"
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Tooltip title={selected.length ? "Delete selected" : "Nothing selected"}>
              <span>
                <IconButton
                  aria-label="Delete selected"
                  onClick={onDeleteSelected}
                  disabled={!selected.length}
                  sx={{ flexShrink: 0 }}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>

        <Divider />

        {/* Table area: scrolls inside, sticky header, horizontal scroll only here */}
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{
              mx: "auto",
              width: { xs: "100%", sm: "auto" }, // full width on phones, shrink/cap above
              maxWidth: 720,                     // cap the table width (adjust to taste)
            }}
          >
            <Table
              stickyHeader
              aria-label="discounts table"
              sx={{
                tableLayout: "fixed",
                minWidth: 540,               // small bump so columns have room
              }}
            >
              <colgroup>
                <col style={{ width: 56 }} />{/* checkbox */}
                <col style={{ minWidth: 260 }} />{/* Item Name */}
                <col style={{ minWidth: 110, width: "auto" }} />{/* Value */}
                <col style={{ width: 104 }} />{/* Actions – was 56 */}
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Item Name</Typography>
                  </TableCell>
                  <TableCell align="left">
                    <Typography fontWeight={600}>Value</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography fontWeight={600}>Actions</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {paged.map((r) => (
                  <TableRow
                    key={r.id}
                    hover
                    onClick={() => {
                      openEdit(r);
                    }}
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

                    {/* Name (50%) */}
                    <TableCell sx={{ overflow: "hidden" }}>
                      <Stack direction="row" alignItems="center" spacing={1} overflow="hidden">
                        <Typography noWrap title={r.name}>
                          {r.name}
                        </Typography>
                        {r.isActive === false && (
                          <Chip size="small" label="Inactive" variant="outlined" />
                        )}
                      </Stack>
                    </TableCell>

                    {/* Value (50%) */}
                    <TableCell align="left" sx={{ whiteSpace: "nowrap" }}>
                      <Typography fontWeight={700}>{r.value}%</Typography>
                    </TableCell>

                    {/* Actions */}
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        aria-label="Delete"
                        onClick={() => onDeleteOne(r.code, r.name)}
                        size="small"
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No discounts found{rows.length ? " for the chosen filters." : " yet."}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredRows.length}
            page={page}
            onPageChange={(_, p) => setPageState((s) => ({ ...s, page: p }))}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) =>
              setPageState({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })
            }
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>

      {/* Create/Edit dialog */}
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
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
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
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
              error={valueError}
              helperText={valueError ? "Enter a number from 0 to 100." : " "}
              fullWidth
              slotProps={{
                htmlInput: {
                  min: 0,
                  max: 100,
                  step: 1,
                  inputMode: "numeric",
                  "aria-label": "Percent value",
                },
                input: {
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                },
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
          >
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
    </Box>
  );
}