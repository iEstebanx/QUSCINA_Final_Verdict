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
import { useConfirm } from "@/context/Cancel&ConfirmDialog/ConfirmContext.jsx";

/* -------------------------- Name validation helpers -------------------------- */
const NAME_MAX = 60;
const NAME_MIN = 3;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;

function normalizeName(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
function isValidName(s) {
  if (!s) return false;
  if (s.length < NAME_MIN || s.length > NAME_MAX) return false;
  if (!NAME_ALLOWED.test(s)) return false;
  return true;
}
/* --------------------------------------------------------------------------- */

function blurActive() {
  const el = document.activeElement;
  if (el && typeof el.blur === "function") el.blur();
}

export default function CategoriePage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // selection / paging
  const [selected, setSelected] = useState([]);
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const someChecked = rows.some((r) => selected.includes(r.id)) && !allChecked;

  const [renameInfo, setRenameInfo] = useState({ open: false, count: 0, name: "", sample: [] })

  // create/edit dialog
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null=create, string=edit
  const isEdit = Boolean(editingId);
  const [name, setName] = useState("");
  const [imageFile, setImageFile] = useState(null); // File or null
  const [imageUrl, setImageUrl] = useState(""); // preview URL or existing URL
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Blocked-delete modal (rich, inventory-like)
  const [blockedDialog, setBlockedDialog] = useState({
    open: false,
    categoryName: "",
    countItems: 0,
    activityCount: 0,   // reserved for parity with inventory dialog; keep 0 for now
    sampleItems: [],    // array of strings
    message: "",
  });

  // Keep track of blob URLs to revoke
  const [objectUrls, setObjectUrls] = useState([]);
  useEffect(() => () => objectUrls.forEach((u) => URL.revokeObjectURL(u)), [objectUrls]);

  const nameIsInvalid = name.trim().length > 0 && !isValidName(normalizeName(name));

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);
  const isEmpty = !loading && !err && rows.length === 0;

  // Handy helper so we always clear selection the same way
  function clearSelection() {
    setSelected([]);
  }

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
      const res = await fetch(`/api/categories`, { cache: "no-store", credentials: "include" });
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
      setSaveErr(
        "Please enter a valid category name (max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /)."
      );
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
          credentials: "include",
        });
      } else {
        res = await fetch(`/api/categories`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
      }
      data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        if (res.status === 409) {
          setSaveErr("That category name already exists. Names are case-insensitive. Please choose a different name.");
          return; // keep dialog open so user can fix it
        }
        throw new Error(data?.error || `Save failed (HTTP ${res.status})`);
      }

      await load();
      setOpen(false);
      // If we just renamed and backend tells us how many items were auto-updated, show it.
      if (isEdit && Number.isFinite(data?.affectedItems) && data.affectedItems > 0) {
        setRenameInfo({
          open: true,
          count: Number(data.affectedItems),
          name: normalizeName(name),
          sample: Array.isArray(data?.sample) ? data.sample.slice(0, 5) : [],
        });
      }
    } catch (e) {
      setSaveErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------ Inventory-like blocked modal ------------------------ */
  function showBlockedModal(payload = {}) {
    const {
      categoryName = "",
      countItems = 0,
      activityCount = 0,
      sampleItems = [],
      message = "",
    } = payload || {};
    setBlockedDialog({
      open: true,
      categoryName,
      countItems: Number.isFinite(countItems) ? countItems : 0,
      activityCount: Number.isFinite(activityCount) ? activityCount : 0,
      sampleItems: Array.isArray(sampleItems) ? sampleItems.slice(0, 6) : [],
      message: String(message || ""),
    });
  }

  async function onDeleteOne(row) {
    const result = await confirm({
      title: "Delete category?",
      content: `Delete "${row.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmColor: "error",
    });
    const ok = result === true || result?.confirmed === true;
    if (!ok) {
      setSelected([]); // user canceled
      return;
    }

    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          const count = Number.isFinite(data?.count) ? data.count : undefined;
          const sample = Array.isArray(data?.sample) ? data.sample : [];
          // If server didn't send names, try to at least show the current row name
          showBlockedModal({
            categoryName: row.name || "This category",
            countItems: Number.isFinite(count) ? count : 0,
            activityCount: Number.isFinite(data?.activityCount) ? data.activityCount : 0,
            sampleItems: sample,
            message:
              typeof data?.error === "string"
                ? data.error
                : "Cannot delete category; item(s) are assigned to it.",
          });
          setSelected((s) => s.filter((id) => id !== row.id)); // uncheck just this one
        } else {
          throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
        }
      } else {
        // deleted -> remove from selection if present
        setSelected((s) => s.filter((id) => id !== row.id));
      }

      await load();
    } catch (e) {
      setErr(e?.message || "Delete failed");
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
    if (!ok) {
      clearSelection();
      return;
    }

    try {
      const res = await fetch(`/api/categories`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && data?.error) {
          showBlockedModal({ message: String(data.error) });
        } else {
          throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
        }
      } else {
        // Build a helpful dialog summarizing blocked ones
        if (Array.isArray(data.blocked) && data.blocked.length) {
          const namesById = new Map(rows.map((r) => [r.id, r.name]));
          // If only one blocked, show its details inventory-style
          if (data.blocked.length === 1) {
            const b = data.blocked[0];
            const name = namesById.get(b.id) || "This category";
            const sample =
              Array.isArray(b.sample) && b.sample.length
                ? b.sample
                : []; // server-provided sample if any
            showBlockedModal({
              categoryName: name,
              countItems: Number.isFinite(b.count) ? b.count : 0,
              activityCount: Number.isFinite(b.activityCount) ? b.activityCount : 0,
              sampleItems: sample,
              message: "Cannot delete category; item(s) are assigned to it.",
            });
          } else {
            // Multiple blocked: show a compact summary message with first few names
            const preview = data.blocked
              .slice(0, 5)
              .map((b) => namesById.get(b.id) || b.id)
              .join(", ");
            const more = data.blocked.length > 5 ? ` and ${data.blocked.length - 5} more` : "";
            showBlockedModal({
              categoryName: "",
              countItems: 0,
              sampleItems: [],
              message: `Some categories were not deleted because items are still assigned: ${preview}${more}.`,
            });
          }
        }

        // Remove deleted ones from selection; keep blocked ones unchecked
        const blockedIds = new Set((data.blocked || []).map((b) => b.id));
        setSelected((prev) => prev.filter((id) => blockedIds.has(id))); // leave blocked selected off next render
      }

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
                {[
                  <col key="c1" style={{ width: 56 }} />,
                  <col key="c2" style={{ width: 120 }} />,
                  <col key="c3" style={{ minWidth: 240 }} />,
                  <col key="c4" style={{ width: 72 }} />,
                ]}
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
                  <TableCell align="right">
                    <Typography fontWeight={600}>Actions</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2">Loading categories…</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {!!err && !loading && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="error">{err}</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {isEmpty && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">
                        No categories yet. Click <strong>Add Category</strong> to create your first one.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !err && !isEmpty && paged.map((r) => (
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
                        <Avatar src={r.imageUrl} alt={r.name} sx={{ width: 56, height: 56, borderRadius: 1 }} variant="rounded" />
                      ) : (
                        <Avatar variant="rounded" sx={{ width: 56, height: 56, borderRadius: 1 }}>
                          {r.name?.[0]?.toUpperCase() || "?"}
                        </Avatar>
                      )}
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
                ))}
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
                if (raw.length <= NAME_MAX) setName(raw);
              }}
              error={nameIsInvalid}
              helperText={
                name
                  ? `${name.length}/${NAME_MAX} ${
                      nameIsInvalid
                        ? `• Must be at least ${NAME_MIN} chars • Allowed: letters, numbers, spaces, - ' & . , ( ) /`
                        : ""
                    }`
                  : `Min ${NAME_MIN}, max ${NAME_MAX} chars`
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
            disabled={saving || normalizeName(name).length < NAME_MIN}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Blocked Delete Dialog (Cleaned, Inventory-style) */}
      <Dialog open={blockedDialog.open} onClose={() => setBlockedDialog((d) => ({ ...d, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle>Cannot Delete Category</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>
            <strong>{blockedDialog.categoryName || "This category"}</strong>{" "}
            is currently in use and can’t be deleted.
          </Typography>

          {/* Linked items count */}
          <Typography variant="body2" sx={{ mb: 1 }}>
            Linked <strong>items</strong>: {blockedDialog.countItems}
          </Typography>

          {/* List of linked items */}
          {blockedDialog.sampleItems?.length > 0 && (
            <>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Recent items in this category:
              </Typography>
              <Box component="ul" sx={{ pl: 3, mt: 0, mb: 1.5 }}>
                {blockedDialog.sampleItems.map((item, i) => (
                  <li key={`${item}-${i}`}>
                    <Typography variant="body2">{item}</Typography>
                  </li>
                ))}
              </Box>
            </>
          )}

          {/* Core message */}
          {blockedDialog.message && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1.5, whiteSpace: "pre-wrap" }}
            >
              {blockedDialog.message}
            </Typography>
          )}

          {/* Footer tip */}
          <Typography variant="body2" color="text.secondary">
            To delete this category, move or delete all items in it, and ensure
            any related references are cleared.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBlockedDialog((d) => ({ ...d, open: false }))}
            variant="contained"
            autoFocus
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Feedback Dialog */}
      <Dialog
        open={renameInfo.open}
        onClose={() => setRenameInfo((d) => ({ ...d, open: false }))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Category Renamed</DialogTitle>
        <DialogContent>
          <Typography>
            <strong>{renameInfo.name || "This category"}</strong> was renamed.
          </Typography>
          <Typography sx={{ mt: 1 }} variant="body2" color="text.secondary">
            {renameInfo.count} linked item
            {renameInfo.count > 1 ? "s were" : " was"} automatically updated by the system.
          </Typography>
            {renameInfo.sample?.length > 0 && (
              <>
                <Typography sx={{ mt: 1 }} variant="body2">
                  Recent items in this category:
                </Typography>
                <Box component="ul" sx={{ pl: 3, mt: 0.5, mb: 0 }}>
                  {renameInfo.sample.slice(0, 5).map((n, i) => (
                    <li key={`${n}-${i}`}>
                      <Typography variant="body2">{n}</Typography>
                    </li>
                  ))}
                </Box>
              </>
            )}    
        </DialogContent>
        
        <DialogActions>
          <Button
            onClick={() => setRenameInfo((d) => ({ ...d, open: false }))}
            variant="contained"
            autoFocus
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}