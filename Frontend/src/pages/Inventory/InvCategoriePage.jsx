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
const MAX_BLOCKED_SHOWN = 5; // show up to 10 categories in the blocked dialog

export default function InvCategoriePage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState([]);
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  // Editor (create/edit)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const isEdit = Boolean(editingId);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Rename feedback
  const [renameInfo, setRenameInfo] = useState({ open: false, name: "", count: 0, sample: [] })

  // Usage warning dialog — now supports single OR multi
  // usageList = [{ categoryName, ingredientCount, activityCount, sampleIngredients }, ...]
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageList, setUsageList] = useState(null);

  function openUsageDialog(payload) {
    const list = Array.isArray(payload) ? payload : [payload];
    setUsageList(list);
    setUsageOpen(true);
  }

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
    // Pre-check usage to give a nicer message before confirming
    try {
      const check = await fetch(`${API_BASE}/${encodeURIComponent(row.id)}/usage`, { cache: "no-store" });
      const usageResp = await check.json().catch(() => ({}));
      if (check.ok && usageResp?.ok) {
        const u = usageResp.usage;
        if (u.ingredientCount > 0 || u.activityCount > 0) {
          openUsageDialog({
            categoryName: row.name,
            ingredientCount: u.ingredientCount,
            activityCount: u.activityCount,
            sampleIngredients: u.sampleIngredients || [],
          });
          // ensure this row isn't selected anymore
          setSelected((s) => s.filter((id) => id !== row.id));
          return;
        }
      }
    } catch {}

    // If not in use, proceed with confirm -> delete
    const result = await confirm({
      title: "Delete inventory category?",
      content: `Delete "${row.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmColor: "error",
    });
    const ok = result === true || result?.confirmed === true;
    if (!ok) {
      setSelected((s) => s.filter((id) => id !== row.id));
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        if (res.status === 409 && data?.usage) {
          openUsageDialog({
            categoryName: row.name,
            ingredientCount: data.usage.ingredientCount,
            activityCount: data.usage.activityCount,
            sampleIngredients: data.usage.sampleIngredients || [],
          });
        } else {
          throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
        }
        setSelected((s) => s.filter((id) => id !== row.id));
        return;
      }
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
    setEditorOpen(true);
  };
  const openEdit = (row) => {
    setEditingId(row.id);
    setName(row.name ?? "");
    setEditorOpen(true);
  };
  const handleClose = () => setEditorOpen(false);

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

      // Optimistic UI
      if (!isEdit && data?.category) {
        setRows((prev) => [data.category, ...prev]);
        setPageState((s) => ({ ...s, page: 0 }));
        const valid = new Set([data.category.id, ...rows.map((r) => r.id)]);
        setSelected((prev) => prev.filter((id) => valid.has(id)));
      } else if (isEdit && data?.category) {
        setRows((prev) => prev.map((r) => (r.id === data.category.id ? data.category : r)));
        // If ingredients were auto-associated, show a rename summary with up to 5 names
        if (Number.isFinite(data?.affectedIngredients) && data.affectedIngredients > 0) {
          setRenameInfo({
            open: true,
            name: data?.category?.name || "",
            count: Number(data.affectedIngredients),
            sample: Array.isArray(data?.sample) ? data.sample.slice(0, 5) : [],
          });
        }
      } else {
        await load(); // fallback
      }

      setEditorOpen(false);
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

      // If some blocked, show ALL of them (capped visually)
      if (Array.isArray(data.blocked) && data.blocked.length) {
        const payload = data.blocked.map((b) => ({
          categoryName: b?.name || "Category",
          ingredientCount: b?.usage?.ingredientCount || 0,
          activityCount: b?.usage?.activityCount || 0,
          sampleIngredients: b?.usage?.sampleIngredients || [],
        }));
        openUsageDialog(payload);
      }

      clearSelection();
      await load();
    } catch (e) {
      setErr(e?.message || "Delete failed");
    }
  }

  const blockedCount = Array.isArray(usageList) ? usageList.length : 0;
  const blockedShown = Array.isArray(usageList) ? usageList.slice(0, MAX_BLOCKED_SHOWN) : [];
  const blockedRemaining = Math.max(0, blockedCount - blockedShown.length);

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        <Box p={2}>
          <Stack direction="row" useFlexGap alignItems="center" flexWrap="wrap" rowGap={1.5} columnGap={2}>
            <Button
              type="button"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openCreate}
            >
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
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{ mx: "auto", width: { xs: "100%", sm: "auto" }, maxWidth: 720 }}
          >
            <Table stickyHeader sx={{ tableLayout: "fixed", minWidth: 520 }}>
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
                  <TableCell><Typography fontWeight={600}>Name</Typography></TableCell>
                  <TableCell align="center"><Typography fontWeight={600}>Actions</Typography></TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">Loading…</Box>
                    </TableCell>
                  </TableRow>
                ) : err ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="error">{err}</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No inventory categories yet. Click <strong>Add Inventory Category</strong>.
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
                        <Checkbox
                          checked={selected.includes(r.id)}
                          onChange={() => toggleOne(r.id)}
                        />
                      </TableCell>
                      <TableCell sx={{ overflow: "hidden" }}>
                        <Typography noWrap title={r.name}>{r.name}</Typography>
                      </TableCell>
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
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
            onRowsPerPageChange={(e) =>
              setPageState({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })
            }
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>

      {/* Add / Edit Category Dialog */}
      <Dialog
        keepMounted
        open={editorOpen}
        onClose={handleClose}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle component="div">
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              {isEdit ? "Edit Inventory Category" : "Add Inventory Category"}
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
              label="Name"
              value={name}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw.length <= NAME_MAX) setName(raw);
              }}
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
          <Button variant="outlined" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onSave}
            disabled={saving || normalizeName(name).length < NAME_MIN || nameIsInvalid}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Blocked-Delete Usage Dialog (single or multiple) */}
      <Dialog open={usageOpen} onClose={() => setUsageOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" fontWeight={600}>
            {blockedCount > 1 ? "Cannot Delete Categories" : "Cannot Delete Category"}
          </Typography>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={1.5}>
            {blockedCount > 1 ? (
              <>
                <Typography>
                  <strong>{blockedCount}</strong> categories can’t be deleted because they’re in use.
                </Typography>

                {/* List of blocked categories (max 10 to avoid a huge dialog) */}
                <Box component="ul" sx={{ pl: 3, m: 0 }}>
                  {blockedShown.map((b, i) => (
                    <li key={i}>
                      <Typography variant="subtitle2" component="div" sx={{ mb: 0.25 }}>
                        {b.categoryName}
                        {" · "}
                        <Typography component="span" variant="body2">
                          ingredients: <strong>{b.ingredientCount}</strong>
                          {" • "}
                          activity logs: <strong>{b.activityCount}</strong>
                        </Typography>
                      </Typography>
                      {!!(b.sampleIngredients?.length) && (
                        <Box component="ul" sx={{ pl: 3, m: 0, mb: 1 }}>
                          {b.sampleIngredients.slice(0, 3).map((n, j) => (
                            <Typography key={j} component="li" variant="body2">{n}</Typography>
                          ))}
                          {b.sampleIngredients.length > 3 && (
                            <Typography component="li" variant="body2" fontStyle="italic">…and more</Typography>
                          )}
                        </Box>
                      )}
                    </li>
                  ))}
                  {blockedRemaining > 0 && (
                    <li>
                      <Typography variant="body2" fontStyle="italic">
                        …and {blockedRemaining} more categor{blockedRemaining === 1 ? "y" : "ies"}
                      </Typography>
                    </li>
                  )}
                </Box>

                <Typography variant="body2" color="text.secondary">
                  To proceed, move or delete all ingredients in those categories, and ensure related activity is no longer tied to them.
                </Typography>
              </>
            ) : (
              // Single category (previous behavior)
              <>
                <Typography>
                  <strong>{usageList?.[0]?.categoryName}</strong> is currently in use and can’t be deleted.
                </Typography>
                <Typography variant="body2">
                  Linked <strong>ingredients</strong>: {usageList?.[0]?.ingredientCount ?? 0}
                  {" • "}Linked <strong>activity logs</strong>: {usageList?.[0]?.activityCount ?? 0}
                </Typography>

                {!!(usageList?.[0]?.sampleIngredients?.length) && (
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>Recent ingredients in this category:</Typography>
                    <Box component="ul" sx={{ pl: 3, m: 0 }}>
                      {usageList[0].sampleIngredients.map((n, i) => (
                        <Typography key={i} component="li" variant="body2">{n}</Typography>
                      ))}
                      {(usageList[0].ingredientCount || 0) > usageList[0].sampleIngredients.length && (
                        <Typography component="li" variant="body2" fontStyle="italic">…and more</Typography>
                      )}
                    </Box>
                  </Box>
                )}

                <Typography variant="body2" color="text.secondary">
                  To delete this category, move or delete all ingredients in it, and ensure related activity is no longer tied to those ingredients.
                </Typography>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setUsageOpen(false)}>OK</Button>
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
            {renameInfo.count} linked ingredient{renameInfo.count === 1 ? "" : "s"} {renameInfo.count === 1 ? "was" : "were"} automatically updated by the system.
          </Typography>
          {renameInfo.sample?.length > 0 && (
            <>
              <Typography sx={{ mt: 1 }} variant="body2">Recent ingredients in this category:</Typography>
              <Box component="ul" sx={{ pl: 3, mt: 0.5, mb: 0 }}>
                {renameInfo.sample.map((n, i) => (
                  <Typography key={i} component="li" variant="body2">{n}</Typography>
                ))}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setRenameInfo((d) => ({ ...d, open: false }))}>OK</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}