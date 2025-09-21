// Frontend/src/pages/Categories/CategoriePage.jsx
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

/* -------------------------- Name validation helpers -------------------------- */
const NAME_MAX = 60;
// First character must be alphanumeric; then allow spaces and a small safe set of punctuations
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;

function normalizeName(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
function isValidName(s) {
  if (!s) return false;
  if (s.length === 0 || s.length > NAME_MAX) return false;
  if (!NAME_ALLOWED.test(s)) return false;
  return true;
}
/* --------------------------------------------------------------------------- */

function blurActive() {
  const el = document.activeElement;
  if (el && typeof el.blur === "function") el.blur();
}

export default function CategoriePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // selection / paging
  const [selected, setSelected] = useState([]);
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const someChecked = rows.some((r) => selected.includes(r.id)) && !allChecked;

  // dialog
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null=create, string=edit
  const isEdit = Boolean(editingId);
  const [name, setName] = useState("");
  const [imageFile, setImageFile] = useState(null); // File or null
  const [imageUrl, setImageUrl] = useState(""); // preview URL or existing URL
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Keep track of blob URLs to revoke
  const [objectUrls, setObjectUrls] = useState([]);
  useEffect(() => () => objectUrls.forEach((u) => URL.revokeObjectURL(u)), [objectUrls]);

  const nameIsInvalid = name.trim().length > 0 && !isValidName(normalizeName(name));

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  function toggleAll() {
    setSelected((s) => (s.length === rows.length ? [] : rows.map((r) => r.id)));
  }
  function toggleOne(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setImageFile(null);
    setImageUrl("");
    setTouched(false);
    setSaving(false);
    setSaveErr("");
  }

  function openCreate() {
    blurActive();
    resetForm();
    setOpen(true);
  }

  function openEdit(row) {
    blurActive();
    setEditingId(row.id);
    setName(row.name || "");
    setImageFile(null);
    setImageUrl(row.imageUrl || "");
    setTouched(false);
    setOpen(true);
  }

  function onPickImage(file) {
    if (!file) {
      setImageFile(null);
      setImageUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrls((prev) => [...prev, url]);
    setImageFile(file);
    setImageUrl(url);
  }

  function handleClose() {
    setOpen(false);
  }

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/categories`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        const list = Array.isArray(data.categories) ? data.categories : [];
        setRows(list);
        // drop selections that no longer exist
        const valid = new Set(list.map((r) => r.id));
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
    setTouched(true);

    const clean = normalizeName(name);
    if (!isValidName(clean)) {
      setSaveErr("Please enter a valid category name (max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /).");
      return;
    }

    setSaving(true);
    setSaveErr("");

    try {
      const form = new FormData();
      form.append("name", clean);
      if (imageFile) form.append("image", imageFile);

      let res, data;
      if (isEdit) {
        res = await fetch(`/api/categories/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          body: form,
        });
      } else {
        res = await fetch(`/api/categories`, {
          method: "POST",
          body: form,
        });
      }
      data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || `Save failed (HTTP ${res.status})`);
      }

      await load();
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
    if (!window.confirm(`Delete ${selected.length} ${plural}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/categories`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      }
      setSelected([]);
      await load();
    } catch (e) {
      setErr(e?.message || "Delete failed");
    }
  }

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        {/* Header (Add + Delete like Discounts) */}
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
              onClick={(e) => {
                e.currentTarget.blur();
                openCreate();
              }}
              sx={{ flexShrink: 0 }}
            >
              Add Category
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

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

        {/* Table */}
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{ mx: "auto", width: { xs: "100%", sm: "auto" }, maxWidth: 720 }}
          >
            <Table stickyHeader aria-label="categories table" sx={{ tableLayout: "fixed", minWidth: 520 }}>
              <colgroup>
                <col style={{ width: 56 }} />
                <col style={{ width: 120 }} />
                <col style={{ minWidth: 240 }} />
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Image</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Name</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        Loading…
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : err ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="error">
                          {err}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No categories yet. Click <strong>Add Category</strong> to create one.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((r) => (
                    <TableRow
                      key={r.id}
                      hover
                      onClick={() => openEdit(r)}
                      sx={(theme) => ({
                        cursor: "pointer",
                        "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.04) },
                      })}
                    >
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.includes(r.id)} onChange={() => toggleOne(r.id)} />
                      </TableCell>

                      <TableCell>
                        {r.imageUrl ? (
                          <Avatar
                            src={r.imageUrl}
                            alt={r.name}
                            sx={{ width: 56, height: 56, borderRadius: 1 }}
                            variant="rounded"
                          />
                        ) : (
                          <Avatar variant="rounded" sx={{ width: 56, height: 56, borderRadius: 1 }}>
                            {r.name?.[0]?.toUpperCase() || "?"}
                          </Avatar>
                        )}
                      </TableCell>

                      <TableCell sx={{ overflow: "hidden" }}>
                        <Typography noWrap title={r.name}>
                          {r.name}
                        </Typography>
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
            onRowsPerPageChange={(e) =>
              setPageState({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })
            }
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>

      {/* Create / Edit Dialog */}
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="xs"
        fullWidth
        TransitionProps={{ onExited: resetForm }}
      >
        <DialogTitle>
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              {isEdit ? "Edit Category" : "Add Category"}
            </Typography>
            {isEdit && (
              <Typography variant="body2" color="text.secondary">
                ID: {editingId}
              </Typography>
            )}
          </Stack>
        </DialogTitle>

        <Divider />

        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Category Name"
              value={name}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw.length <= NAME_MAX) setName(raw); // hard cap length while typing
              }}
              error={nameIsInvalid}
              helperText={
                name
                  ? `${name.length}/${NAME_MAX} ${nameIsInvalid ? "• Allowed: letters, numbers, spaces, - ' & . , ( ) /" : ""}`
                  : `Max ${NAME_MAX} chars`
              }
              autoFocus
              fullWidth
              onKeyDown={(e) => e.key === "Enter" && onSave()}
            />
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" component="label" sx={{ alignSelf: "start" }}>
                  Upload Image
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(e) => onPickImage(e.target.files?.[0] || null)}
                  />
                </Button>
                {imageUrl && (
                  <Button
                    variant="text"
                    color="error"
                    onClick={() => {
                      if (imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
                      setImageUrl("");
                      setImageFile(null);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </Stack>

              {imageUrl && (
                <Avatar src={imageUrl} alt="Preview" sx={{ width: 96, height: 96 }} variant="rounded" />
              )}

              <Typography variant="caption" color="text.secondary">
                Image is optional. If none is uploaded, an initial will be shown.
              </Typography>
            </Stack>

            {saveErr && (
              <Typography variant="body2" color="error">
                {saveErr}
              </Typography>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onSave}
            disabled={saving || normalizeName(name).length === 0}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}