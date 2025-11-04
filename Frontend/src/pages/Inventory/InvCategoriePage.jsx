// Frontend/src/pages/Inventory/InvCategoriePage.jsx
import { useMemo, useState, useEffect } from "react";
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
  TablePagination,
  TableRow,
  TextField,
  Typography,
  Avatar,
  IconButton,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { alpha } from "@mui/material/styles";
import { useConfirm } from "@/context/Cancel&ConfirmDialog/ConfirmContext.jsx";

/* validation */
const NAME_MAX = 60;
const NAME_MIN = 3;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalizeName = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length >= NAME_MIN && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

const API_BASE = "/api/inventory/inv-categories";

export default function InvCategoriePage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState([]);
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const isEdit = Boolean(editingId);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const nameIsInvalid = name.trim().length > 0 && !isValidName(normalizeName(name));

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  function clearSelection() {
    setSelected([]);
  }
  const someChecked = rows.some((r) => selected.includes(r.id)) && !allChecked;

  const toggleAll = () =>
    setSelected((s) => (s.length === rows.length ? [] : rows.map((r) => r.id)));
  const toggleOne = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function onDeleteOne(row) {
    const result = await confirm({
      title: "Delete inventory category?",
      content: `Delete "${row.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmColor: "error",
    });
    const ok = result === true || result?.confirmed === true;
    if (!ok) {
      // user canceled: uncheck only this row if it was selected
      setSelected((s) => s.filter((id) => id !== row.id));
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      }
      // ensure this id is not in selection anymore
      setSelected((s) => s.filter((id) => id !== row.id));
      await load();
    } catch (e) {
      setErr(e?.message || "Delete failed");
    }
  }

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setSaving(false);
    setSaveErr("");
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };
  const openEdit = (row) => {
    setEditingId(row.id);
    setName(row.name ?? "");
    setOpen(true);
  };
  const handleClose = () => setOpen(false);

  // comparator: newest-first
  const sortNewestFirst = (a, b) => {
    // prefer createdAt (ISO date string)
    if (a?.createdAt && b?.createdAt) {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return db - da; // b before a for newest-first
    }
    // fallback: numeric id descending
    if (typeof a.id === "number" && typeof b.id === "number") {
      return b.id - a.id;
    }
    // fallback: string compare reversed
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  };

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(API_BASE, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        const list = Array.isArray(data.categories) ? data.categories : [];
        // always sort newest-first client-side
        const sorted = [...list].sort(sortNewestFirst);
        setRows(sorted);
        // ensure pagination shows first page (so newest items are visible)
        setPageState((s) => ({ ...s, page: 0 }));
        const valid = new Set(sorted.map((r) => r.id));
        setSelected((prev) => prev.filter((id) => valid.has(id)));
      } else {
        setErr(data?.error || `Failed to load (HTTP ${res.status})`);
      }
    } catch (e) {
      setErr(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSave() {
    const clean = normalizeName(name);
    if (!isValidName(clean)) {
      setSaveErr(
        `Please enter a valid name (min ${NAME_MIN}, max ${NAME_MAX}; allowed letters, numbers, spaces, - ' & . , ( ) /).`
      );
      return;
    }
    setSaving(true);
    setSaveErr("");

    try {
      const body = JSON.stringify({ name: clean });
      const headers = { "Content-Type": "application/json" };

      const res = await fetch(
        isEdit ? `${API_BASE}/${encodeURIComponent(editingId)}` : API_BASE,
        { method: isEdit ? "PATCH" : "POST", headers, body }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        if (res.status === 409) {
          setSaveErr("That category name already exists. Names are case-insensitive. Please choose a different name.");
          return;
        }
        throw new Error(data?.error || `Save failed (HTTP ${res.status})`);
      }

      // If API returned the created/updated category object, update local rows for immediate UX.
      // Backend suggested response shape: { ok: true, category: { id, name, createdAt, ... } }
      if (!isEdit && data?.category) {
        // Prepend new category (newest-first) and reset to page 0 so user sees it.
        setRows((prev) => [data.category, ...prev]);
        setPageState((s) => ({ ...s, page: 0 }));
        // Make sure selected set doesn't contain invalid ids (and keep existing selections)
        const valid = new Set([data.category.id, ...rows.map((r) => r.id)]);
        setSelected((prev) => prev.filter((id) => valid.has(id)));
      } else if (isEdit && data?.category) {
        // Update edited row in-place
        setRows((prev) => prev.map((r) => (r.id === data.category.id ? data.category : r)));
      } else {
        // Fallback to reload (safe) if API didn't return category object
        await load();
      }

      setOpen(false);
    } catch (e) {
      setSaveErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }
  
  async function onDeleteSelected() {
    if (!selected.length) return;
    const plural = selected.length > 1 ? "categories" : "category";
    const result = await confirm({
      title: `Delete ${selected.length} ${plural}?`,
      content: "This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmColor: "error",
    });
    const ok = result === true || result?.confirmed === true;
    if (!ok) { clearSelection(); return; }

    try {
      const res = await fetch(API_BASE, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      }
      clearSelection();
      await load();
    } catch (e) {
      setErr(e?.message || "Delete failed");
    }
  }

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        <Box p={2}>
          <Stack direction="row" useFlexGap alignItems="center" flexWrap="wrap" rowGap={1.5} columnGap={2}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              Add Inventory Category
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

            <Tooltip title={selected.length ? "Delete selected" : "Nothing selected"}>
              <span>
                <IconButton aria-label="Delete selected" onClick={onDeleteSelected} disabled={!selected.length}>
                  <DeleteOutlineIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>

        <Divider />

        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer component={Paper} elevation={0} className="scroll-x"
            sx={{ mx: "auto", width: { xs: "100%", sm: "auto" }, maxWidth: 720 }}>
            <Table stickyHeader sx={{ tableLayout: "fixed", minWidth: 520 }}>
              <colgroup>
                <col style={{ width: 56 }} />
                <col style={{ minWidth: 320 }} />
                <col style={{ width: 72 }} />
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                  </TableCell>
                  <TableCell><Typography fontWeight={600}>Name</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={600}>Actions</Typography></TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={3}><Box py={6} textAlign="center">Loading…</Box></TableCell></TableRow>
                ) : err ? (
                  <TableRow><TableCell colSpan={3}><Box py={6} textAlign="center">
                    <Typography variant="body2" color="error">{err}</Typography></Box></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={3}><Box py={6} textAlign="center">
                    <Typography variant="body2" color="text.secondary">
                      No inventory categories yet. Click <strong>Add Inventory Category</strong>.
                    </Typography></Box></TableCell></TableRow>
                ) : (
                  paged.map((r) => (
                    <TableRow key={r.id} hover onClick={() => openEdit(r)}
                      sx={(theme) => ({ cursor: "pointer", "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.04) } })}>
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.includes(r.id)} onChange={() => toggleOne(r.id)} />
                      </TableCell>
                      <TableCell sx={{ overflow: "hidden" }}>
                        <Typography noWrap title={r.name}>{r.name}</Typography>
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Delete">
                          <span>
                            <IconButton
                              aria-label={`Delete ${r.name}`}
                              onClick={(e) => { e.stopPropagation(); onDeleteOne(r); }}
                              size="small"
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={rows.length}
            page={page}
            onPageChange={(_, p) => setPageState((s) => ({ ...s, page: p }))}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => setPageState({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })}
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>

      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              {isEdit ? "Edit Inventory Category" : "Add Inventory Category"}
            </Typography>
            {isEdit && <Typography variant="body2" color="text.secondary">ID: {editingId}</Typography>}
          </Stack>
        </DialogTitle>

        <Divider />
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => { const raw = e.target.value; if (raw.length <= NAME_MAX) setName(raw); }}
              error={nameIsInvalid}
              helperText={
                name
                  ? `${name.length}/${NAME_MAX}${
                      nameIsInvalid
                        ? ` • Must be at least ${NAME_MIN} chars • Allowed: letters, numbers, spaces, - ' & . , ( ) /`
                        : ""
                    }`
                  : `Min ${NAME_MIN}, max ${NAME_MAX} chars`
              }
              autoFocus
              fullWidth
              onKeyDown={(e) => e.key === "Enter" && onSave()}
            />
            {saveErr && <Typography variant="body2" color="error">{saveErr}</Typography>}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || normalizeName(name).length < NAME_MIN}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}