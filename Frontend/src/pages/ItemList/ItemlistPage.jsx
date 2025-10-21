// Frontend/src/pages/ItemList/ItemlistPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box, Paper, Stack, Button, FormControl, InputLabel, Select, MenuItem,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Typography, Divider, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Avatar, TablePagination,
  Checkbox, IconButton, Tooltip, InputAdornment
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { useAlert } from "@/context/Snackbar/AlertContext";

/* -------------------------- Name validation helpers -------------------------- */
const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
function normalizeName(s) { return String(s ?? "").replace(/\s+/g, " ").trim(); }
function isValidName(s) {
  if (!s) return false;
  if (s.length === 0 || s.length > NAME_MAX) return false;
  if (!NAME_ALLOWED.test(s)) return false;
  return true;
}
/* ---------------------------- Description helpers ---------------------------- */
const DESC_MAX = 300;
function normalizeDesc(s) { return String(s ?? "").replace(/\s+/g, " ").trim(); }
/* --------------------------------------------------------------------------- */

// Safely derive a ms timestamp from Firestore Timestamp / Date-string / number
function getMs(u) {
  if (!u) return 0;
  if (typeof u === "number") return u;
  if (typeof u === "string") return Date.parse(u) || 0;
  if (typeof u === "object") {
    if (typeof u.toDate === "function") return u.toDate().getTime();
    if (u._seconds != null) return u._seconds * 1000 + Math.floor((u._nanoseconds || 0) / 1e6);
  }
  return 0;
}

export default function ItemlistPage() {
  // table filter
  const [categoryFilter, setCategoryFilter] = useState("all");

  // data
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]); // {id, name}
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const alert = useAlert();

  // dialog state (create)
  const [openCreate, setOpenCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // dialog state (edit)
  const [openEdit, setOpenEdit] = useState(false);
  const [editingId, setEditingId] = useState("");

  const emptyForm = {
    name: "",
    description: "",
    categoryId: "",
    categoryName: "",
    price: "", // Item level price
    imageFile: null,
    imagePreview: "",
  };

  const [f, setF] = useState(emptyForm);

  // ingredients from inventory (for ingredient selector inside Add Item modal)
  const [inventory, setInventory] = useState([]); // {id,name,category,type,currentStock,price}
  const [ingLoading, setIngLoading] = useState(false);

  // ingredients used in new item
  const [itemIngredients, setItemIngredients] = useState([]); // each: { id, ingredientId, name, category, unit, currentStock, qty, price, cost }

  // selection
  const [selected, setSelected] = useState([]);

  // pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10); // -1 for "All"

  // Build query string for items
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (categoryFilter && categoryFilter !== "all") p.set("categoryId", categoryFilter);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [categoryFilter]);

  // Load categories
  async function loadCategories() {
    try {
      const res = await fetch(`/api/categories`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const list = (res.ok && data?.ok && Array.isArray(data.categories)) ? data.categories : [];
      setCats(list.map(c => ({ id: c.id, name: c.name })));
    } catch {
      setCats([]);
    }
  }

  // Load items → newest first
  async function loadItems() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/items${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        const list = Array.isArray(data.items) ? data.items : [];
        const withTs = list.map(it => {
          const ts = getMs(it.updatedAt) || getMs(it.createdAt);
          return { ...it, _ts: ts };
        });
        withTs.sort((a, b) => (b._ts - a._ts) || String(a.name).localeCompare(String(b.name)));
        setRows(withTs);
      } else {
        setErr(data?.error || `Failed to load (HTTP ${res.status})`);
      }
    } catch (e) {
      setErr(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  // Load inventory ingredients for selector
  async function loadInventory() {
    setIngLoading(true);
    try {
      const res = await fetch(`/api/inventory/ingredients`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const list = (res.ok && data?.ok && Array.isArray(data.ingredients)) ? data.ingredients : [];
      setInventory(list.map(x => ({
        id: x.id,
        name: x.name || "",
        category: x.category || "",
        unit: x.type || "",
        currentStock: Number(x.currentStock || 0),
        price: Number(x.price || 0),
      })));
    } catch {
      setInventory([]);
    } finally {
      setIngLoading(false);
    }
  }

  useEffect(() => { loadCategories(); loadInventory(); }, []);
  useEffect(() => { loadItems(); }, [qs]);

  // keep selection valid
  useEffect(() => {
    const valid = new Set(rows.map(r => r.id));
    setSelected(prev => prev.filter(id => valid.has(id)));
  }, [rows]);

  // reset page when data/filter/page-size changes
  useEffect(() => { setPage(0); }, [qs, rowsPerPage, rows.length]);

  // helpers
  const resetForm = () => {
    setF({ ...emptyForm });
    setItemIngredients([]);
    setSaveErr("");
  };

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setF(s => ({ ...s, imageFile: null, imagePreview: editingId ? s.imagePreview : "" }));
      return;
    }
    const preview = URL.createObjectURL(file);
    setF(s => ({ ...s, imageFile: file, imagePreview: preview }));
  }

  function onPickCategory(id) {
    if (!id) {
      setF(s => ({ ...s, categoryId: "", categoryName: "" }));
      return;
    }
    const found = cats.find(c => c.id === id);
    setF(s => ({ ...s, categoryId: id, categoryName: found?.name || "" }));
  }

  // Add one ingredient blank row
  function addIngredientRow() {
    setItemIngredients(prev => [
      ...prev,
      { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, ingredientId: "", name: "", category: "", unit: "", currentStock: 0, qty: "", price: "", cost: 0 }
    ]);
  }

  // Remove ingredient row
  function removeIngredientRow(id) {
    setItemIngredients(prev => prev.filter(r => r.id !== id));
  }

  // Select ingredient from inventory
  function onSelectInventory(rowId, ingredientId) {
    const selectedIng = inventory.find(i => i.id === ingredientId);
    setItemIngredients(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      if (!selectedIng) {
        return { ...r, ingredientId: "", name: "", category: "", unit: "", currentStock: 0, price: "", qty: "", cost: 0 };
      }

      const priceNum = Number(selectedIng.price || 0);

      return {
        ...r,
        ingredientId: selectedIng.id,
        name: selectedIng.name,
        category: selectedIng.category,
        unit: selectedIng.unit,
        currentStock: selectedIng.currentStock,
        price: priceNum, // store as number
        qty: r.qty || "",
        cost: (Number(r.qty || 0) * priceNum) || 0,
      };
    }));
  }

  // Update qty or price and auto-calc cost
  function onRowChange(rowId, field, rawValue) {
    setItemIngredients(prev => prev.map(r => {
      if (r.id !== rowId) return r;

      let v = String(rawValue ?? "").replace(/[^0-9.]/g, "");
      const parts = v.split(".");
      if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");

      const newRow = { ...r, [field]: v };
      const qtyN = parseFloat(newRow.qty) || 0;
      const priceN = parseFloat(newRow.price) || 0;

      // cost auto-calculates when typing qty or price
      newRow.cost = +(qtyN * priceN).toFixed(2);

      return newRow;
    }));
  }

  const computeCostOverall = () => {
    return itemIngredients.reduce((s, r) => s + (Number(r.cost || 0)), 0);
  };

  /* ============== Create ============== */
  async function saveItem() {
    setSaving(true);
    setSaveErr("");
    try {
      const cleanName = normalizeName(f.name);
      if (!isValidName(cleanName)) {
        throw new Error("Please enter a valid item name (max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /).");
      }

      let cleanCatName = "";
      if (f.categoryId) {
        const candidate = normalizeName(f.categoryName);
        if (candidate && !isValidName(candidate)) {
          throw new Error("Please enter a valid category name (max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /).");
        }
        cleanCatName = candidate;
      }

      const cleanDesc = normalizeDesc(f.description).slice(0, DESC_MAX);
      const itemPrice = Number(String(f.price || "").replace(/[^0-9.]/g, "")) || 0;

      // build ingredients payload (only include meaningful fields)
      const ingPayload = itemIngredients
        .filter(r => r.ingredientId && (String(r.qty).trim() || String(r.price).trim()))
        .map(r => ({
          ingredientId: r.ingredientId,
          name: r.name,
          category: r.category,
          unit: r.unit,
          qty: Number(r.qty || 0),
          price: Number(r.price || 0),
          cost: Number(r.cost || 0),
        }));

      const costOverall = ingPayload.reduce((s, x) => s + (Number(x.cost || 0)), 0);

      const form = new FormData();
      form.append("name", cleanName);
      form.append("description", cleanDesc);
      form.append("price", String(itemPrice));
      if (f.categoryId) {
        form.append("categoryId", f.categoryId);
        form.append("categoryName", cleanCatName);
      }
      if (f.imageFile) form.append("image", f.imageFile);
      // ingredients as JSON string
      form.append("ingredients", JSON.stringify(ingPayload));
      form.append("costOverall", String(costOverall));

      const res = await fetch(`/api/items`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Save failed (HTTP ${res.status})`);

      await loadItems();
      setOpenCreate(false);
      resetForm();
      alert.success("Item added.");
    } catch (e) {
      setSaveErr(e?.message || "Save failed");
      alert.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ============== Edit ============== */
  function openEditDialog(row) {
    setEditingId(row.id);
    setF({
      name: row.name || "",
      description: row.description || "",
      categoryId: row.categoryId || "",
      categoryName: row.categoryName || "",
      price: row.price != null ? String(row.price) : "",
      imageFile: null,
      imagePreview: row.imageUrl || "", // show current image
    });
    // If editing existing item and it has ingredients, prefill itemIngredients
    const initialIngredients = Array.isArray(row.ingredients) ? row.ingredients.map((x, idx) => ({
      id: x.ingredientId ? x.ingredientId : `e-${idx}-${Date.now()}`,
      ingredientId: x.ingredientId || "",
      name: x.name || "",
      category: x.category || "",
      unit: x.unit || "",
      currentStock: x.currentStock || 0,
      qty: x.qty != null ? String(x.qty) : "",
      price: x.price != null ? String(x.price) : "",
      cost: x.cost != null ? Number(x.cost) : (Number(x.qty || 0) * Number(x.price || 0)),
    })) : [];
    setItemIngredients(initialIngredients);
    setSaveErr("");
    setOpenEdit(true);
  }

  async function updateItem() {
    if (!editingId) return;
    setSaving(true);
    setSaveErr("");
    try {
      const cleanName = normalizeName(f.name);
      if (!isValidName(cleanName)) {
        throw new Error("Please enter a valid item name (max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /).");
      }
      let cleanCatName = "";
      if (f.categoryId) {
        const candidate = normalizeName(f.categoryName);
        if (candidate && !isValidName(candidate)) {
          throw new Error("Please enter a valid category name (max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /).");
        }
        cleanCatName = candidate;
      }
      const cleanDesc = normalizeDesc(f.description).slice(0, DESC_MAX);
      const itemPrice = Number(String(f.price || "").replace(/[^0-9.]/g, "")) || 0;

      const ingPayload = itemIngredients
        .filter(r => r.ingredientId && (String(r.qty).trim() || String(r.price).trim()))
        .map(r => ({
          ingredientId: r.ingredientId,
          name: r.name,
          category: r.category,
          unit: r.unit,
          qty: Number(r.qty || 0),
          price: Number(r.price || 0),
          cost: Number(r.cost || 0),
        }));

      const costOverall = ingPayload.reduce((s, x) => s + (Number(x.cost || 0)), 0);

      const form = new FormData();
      form.append("name", cleanName);
      form.append("description", cleanDesc);
      form.append("price", String(itemPrice));
      form.append("categoryId", f.categoryId || "");
      form.append("categoryName", cleanCatName || "");
      form.append("ingredients", JSON.stringify(ingPayload));
      form.append("costOverall", String(costOverall));
      if (f.imageFile) form.append("image", f.imageFile);

      const res = await fetch(`/api/items/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Update failed (HTTP ${res.status})`);

      await loadItems();
      setOpenEdit(false);
      setEditingId("");
      resetForm();
      alert.success("Item updated.");
    } catch (e) {
      setSaveErr(e?.message || "Update failed");
      alert.error(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setOpenEdit(false);
    setEditingId("");
    resetForm();
    setSaveErr("");
  }

  // DELETE (bulk)
  const onDeleteSelected = async () => {
    if (!selected.length) return;
    try {
      const res = await fetch(`/api/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      alert.info(`Deleted ${selected.length} item${selected.length > 1 ? "s" : ""}.`);
      setSelected([]);
      await loadItems();
    } catch (e) {
      alert.error(e?.message || "Failed to delete selected items.");
    }
  };

  // selection helpers
  const allChecked = rows.length > 0 && rows.every(r => selected.includes(r.id));
  const someChecked = rows.some(r => selected.includes(r.id)) && !allChecked;
  const toggleAll = () => {
    const ids = rows.map(r => r.id);
    const everyIncluded = ids.every(id => selected.includes(id));
    setSelected(s => (everyIncluded ? s.filter(id => !ids.includes(id)) : Array.from(new Set([...s, ...ids]))));
  };
  const toggleOne = (id) => {
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  };

  // compute paged rows
  const pagedRows =
    rowsPerPage > 0
      ? rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
      : rows;

  const handleChangePage = (_evt, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (evt) => {
    const v = parseInt(evt.target.value, 10);
    setRowsPerPage(v);
    setPage(0);
  };

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        <Box p={2}>
          {/* Header */}
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
              onClick={() => { resetForm(); setOpenCreate(true); }}
              sx={{ flexShrink: 0 }}
            >
              Add Item
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

            <FormControl
              size="small"
              sx={{ minWidth: { xs: 160, sm: 200 }, flex: { xs: "1 1 160px", sm: "0 0 auto" } }}
            >
              <InputLabel id="itemlist-category-label">Category</InputLabel>
              <Select
                labelId="itemlist-category-label"
                value={categoryFilter}
                label="Category"
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                {cats.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

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

        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{ width: "100%", borderRadius: 1, maxHeight: 520, overflowX: "auto" }}
          >
            <Table stickyHeader aria-label="items table" sx={{ minWidth: { xs: 820, sm: 960, md: 1200 } }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked}
                      onChange={toggleAll}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell><Typography fontWeight={600}>Image</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Item Name</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Category</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Price</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Cost Overall</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Description</Typography></TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Box py={6} textAlign="center">
                        <CircularProgress size={24} />
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : err ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="error">{err}</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No items yet. Click <strong>Add Item</strong> to create your first product.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedRows.map((r) => (
                    <TableRow
                      key={r.id}
                      hover
                      onClick={() => openEditDialog(r)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.includes(r.id)}
                          onChange={() => toggleOne(r.id)}
                        />
                      </TableCell>

                      <TableCell>
                        {r.imageUrl ? (
                          <Avatar
                            variant="rounded"
                            src={r.imageUrl}
                            alt={r.name}
                            sx={{ width: 44, height: 44 }}
                          />
                        ) : (
                          <Avatar variant="rounded" sx={{ width: 44, height: 44 }}>
                            {String(r.name || "?").slice(0, 1).toUpperCase()}
                          </Avatar>
                        )}
                      </TableCell>
                      <TableCell><Typography fontWeight={600}>{r.name}</Typography></TableCell>
                      <TableCell><Typography>{r.categoryName || "—"}</Typography></TableCell>
                      <TableCell>
                        <Typography>{r.price != null ? `₱${Number(r.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography>{r.costOverall != null ? `₱${Number(r.costOverall).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Typography noWrap title={r.description || ""}>{r.description || "—"}</Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          <TablePagination
            component="div"
            count={rows.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25, { label: "All", value: -1 }]}
            labelRowsPerPage="Rows per page:"
          />
        </Box>
      </Paper>

      {/* Create Dialog */}
      <Dialog open={openCreate} onClose={() => (!saving && setOpenCreate(false))} fullWidth maxWidth="md">
        <DialogTitle>
          <Typography component="div" variant="h5" fontWeight={800}>
            Add Item
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          {/* Section 1: item info */}
          <Stack spacing={2}>
            {/* Item Name + Category in one row */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Item Name"
                value={f.name}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.length <= NAME_MAX) setF((s) => ({ ...s, name: raw }));
                }}
                autoFocus
                required
                fullWidth
                error={f.name.trim().length > 0 && !isValidName(normalizeName(f.name))}
                helperText={
                  f.name
                    ? `${f.name.length}/${NAME_MAX} ${
                        !isValidName(normalizeName(f.name))
                          ? "• Allowed: letters, numbers, spaces, - ' & . , ( ) /"
                          : ""
                      }`
                    : `Max ${NAME_MAX} chars`
                }
              />

              <FormControl fullWidth size="small">
                <InputLabel id="add-item-category-label">Category (optional)</InputLabel>
                <Select
                  labelId="add-item-category-label"
                  value={f.categoryId || ""}
                  label="Category (optional)"
                  onChange={(e) => onPickCategory(e.target.value)}
                >
                  <MenuItem value="">None</MenuItem>
                  {cats.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {/* Description */}
            <TextField
              label="Description (optional)"
              value={f.description}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw.length <= DESC_MAX) setF((s) => ({ ...s, description: raw }));
              }}
              multiline
              minRows={2}
              maxRows={6}
              helperText={`${f.description.length}/${DESC_MAX}`}
            />

            {/* Image Picker */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
              <Button component="label" variant="outlined">
                Choose Image
                <input type="file" accept="image/*" hidden onChange={onPickFile} />
              </Button>
              {f.imagePreview ? (
                <Avatar variant="rounded" src={f.imagePreview} alt="preview" sx={{ width: 64, height: 64 }} />
              ) : (
                <Typography variant="body2" color="text.secondary">Image is optional</Typography>
              )}
            </Stack>
          </Stack>

          <Divider />

          {/* Section 2: Ingredients */}
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Typography fontWeight={700}>Ingredients</Typography>
              <Button size="small" onClick={addIngredientRow} startIcon={<AddIcon />}>Add Ingredient</Button>
            </Stack>

            <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 320 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Ingredient</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Unit / In stock</TableCell>
                    <TableCell>Qty</TableCell>
                    <TableCell>Price per Unit</TableCell>
                    <TableCell>Cost</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ingLoading && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Box py={2} textAlign="center"><CircularProgress size={20} /></Box>
                      </TableCell>
                    </TableRow>
                  )}

                  {!ingLoading && itemIngredients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Box py={3} textAlign="center">
                          <Typography variant="body2" color="text.secondary">
                            No ingredients added. Click "Add Ingredient".
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}

                  {itemIngredients.map(row => (
                    <TableRow key={row.id}>
                      <TableCell sx={{ minWidth: 220 }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={row.ingredientId || ""}
                            displayEmpty
                            onChange={(e) => onSelectInventory(row.id, e.target.value)}
                          >
                            <MenuItem value=""><em>Select ingredient</em></MenuItem>
                            {inventory.map(i => (
                              <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>

                      <TableCell sx={{ minWidth: 140 }}>
                        <Typography variant="body2">{row.category || "—"}</Typography>
                      </TableCell>

                      <TableCell sx={{ minWidth: 140 }}>
                        <Typography variant="body2">{row.unit || "—"}{row.currentStock != null ? ` • ${row.currentStock}` : ""}</Typography>
                      </TableCell>

                      <TableCell sx={{ minWidth: 100 }}>
                        <TextField
                          size="small"
                          value={row.qty || ""}
                          onChange={(e) => onRowChange(row.id, "qty", e.target.value)}
                          inputMode="decimal"
                          placeholder="0"
                          InputProps={{
                            endAdornment: <InputAdornment position="end">{row.unit || "pcs"}</InputAdornment>
                          }}
                        />
                      </TableCell>

                      <TableCell sx={{ minWidth: 120 }}>
                        <TextField
                          size="small"
                          value={row.price || ""}
                          onChange={(e) => onRowChange(row.id, "price", e.target.value)}
                          inputMode="decimal"
                          placeholder="0.00"
                          InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                        />
                      </TableCell>

                      <TableCell sx={{ minWidth: 120 }}>
                        <TextField size="small" value={Number(row.cost || 0).toFixed(2)} InputProps={{ readOnly: true }} />
                      </TableCell>

                      <TableCell>
                        <Tooltip title="Remove">
                          <IconButton size="small" onClick={() => removeIngredientRow(row.id)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

          </Stack>

          {/* Cost + Item Price + Profit/Margin in one row */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems="center"
            justifyContent="flex-end"
            sx={{ mt: 2 }}
          >
            {/* Cost Overall */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                label="Cost Overall"
                size="small"
                value={computeCostOverall().toFixed(2)}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                  readOnly: true
                }}
                sx={{ width: 130 }}
              />
            </Box>

            {/* Item Price */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                label="Item Price"
                size="small"
                value={f.price}
                onChange={(e) => {
                  const v = String(e.target.value ?? "").replace(/[^0-9.]/g, "");
                  setF((s) => ({ ...s, price: v }));
                }}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₱</InputAdornment>
                }}
                inputMode="decimal"
                sx={{ width: 130 }}
              />
            </Box>

            {/* Profit / Margin (single combined group like in Edit dialog) */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                label="Profit / Margin"
                size="small"
                value={(() => {
                  const price = parseFloat(f.price || 0);
                  const cost = computeCostOverall();
                  const profit = price - cost;
                  const margin = price > 0 ? ((profit / price) * 100).toFixed(1) : "0";
                  return `₱${profit.toFixed(2)} • ${margin}%`;
                })()}
                InputProps={{ readOnly: true }}
                sx={{ width: 220 }}
              />
            </Box>
          </Stack>

          {saveErr && (
            <Typography variant="body2" color="error">
              {saveErr}
            </Typography>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => { resetForm(); setOpenCreate(false); }} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={saveItem} variant="contained" disabled={saving || !f.name.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog (reuse same layout as Create) */}
      <Dialog open={openEdit} onClose={() => (!saving && cancelEdit())} fullWidth maxWidth="md">
        <DialogTitle>
          <Typography component="div" variant="h5" fontWeight={800}>
            Edit Item
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          {/* (Same structure as Add) */}
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {/* Item Name */}
              <TextField
                label="Item Name"
                value={f.name}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.length <= NAME_MAX) setF((s) => ({ ...s, name: raw }));
                }}
                autoFocus
                required
                fullWidth
                error={f.name.trim().length > 0 && !isValidName(normalizeName(f.name))}
                helperText={
                  f.name
                    ? `${f.name.length}/${NAME_MAX} ${
                        !isValidName(normalizeName(f.name))
                          ? "• Allowed: letters, numbers, spaces, - ' & . , ( ) /"
                          : ""
                      }`
                    : `Max ${NAME_MAX} chars`
                }
              />

              {/* Category Dropdown (match height to Item Name) */}
              <FormControl fullWidth>
                <InputLabel id="add-item-category-label">Category (optional)</InputLabel>
                <Select
                  labelId="add-item-category-label"
                  value={f.categoryId || ""}
                  label="Category (optional)"
                  onChange={(e) => onPickCategory(e.target.value)}
                  sx={{
                    height: '56px', // match TextField’s default height for variant="outlined"
                    display: 'flex',
                    alignItems: 'center',
                    "& .MuiSelect-select": {
                      paddingY: '16.5px', // adjust vertical padding
                    },
                  }}
                >
                  <MenuItem value="">None</MenuItem>
                  {cats.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <TextField
              label="Description (optional)"
              value={f.description}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw.length <= DESC_MAX) setF((s) => ({ ...s, description: raw }));
              }}
              multiline
              minRows={2}
              maxRows={6}
              helperText={`${f.description.length}/${DESC_MAX}`}
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
              <Button component="label" variant="outlined">
                {f.imagePreview ? "Replace Image" : "Choose Image"}
                <input type="file" accept="image/*" hidden onChange={onPickFile} />
              </Button>
              {f.imagePreview ? (
                <Avatar variant="rounded" src={f.imagePreview} alt="preview" sx={{ width: 64, height: 64 }} />
              ) : (
                <Typography variant="body2" color="text.secondary">No image</Typography>
              )}
            </Stack>
          </Stack>

          <Divider />

          {/* Ingredients table (reuse existing itemIngredients state) */}
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Typography fontWeight={700}>Ingredients</Typography>
              <Button size="small" onClick={addIngredientRow} startIcon={<AddIcon />}>Add Ingredient</Button>
            </Stack>
          
          <Box>
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{
                maxHeight: 320,
                mb: 2,            // <-- add bottom margin so controls don't hug the table
                overflow: "auto"
              }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Ingredient</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Unit / In stock</TableCell>
                    <TableCell>Qty</TableCell>
                    <TableCell>Price per Unit</TableCell>
                    <TableCell>Cost</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ingLoading && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Box py={2} textAlign="center"><CircularProgress size={20} /></Box>
                      </TableCell>
                    </TableRow>
                  )}

                  {!ingLoading && itemIngredients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Box py={3} textAlign="center">
                          <Typography variant="body2" color="text.secondary">No ingredients added. Click "Add Ingredient".</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}

                  {itemIngredients.map(row => (
                    <TableRow key={row.id}>
                      <TableCell sx={{ minWidth: 220 }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={row.ingredientId || ""}
                            displayEmpty
                            onChange={(e) => onSelectInventory(row.id, e.target.value)}
                          >
                            <MenuItem value=""><em>Select ingredient</em></MenuItem>
                            {inventory.map(i => (
                              <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>

                      <TableCell sx={{ minWidth: 140 }}>
                        <Typography variant="body2">{row.category || "—"}</Typography>
                      </TableCell>

                      <TableCell sx={{ minWidth: 140 }}>
                        <Typography variant="body2">{row.unit || "—"}{row.currentStock != null ? ` • ${row.currentStock}` : ""}</Typography>
                      </TableCell>

                      <TableCell sx={{ minWidth: 140 }}>  {/* increased from 100 */}
                        <TextField
                          size="small"
                          value={row.qty || ""}
                          onChange={(e) => onRowChange(row.id, "qty", e.target.value)}
                          inputMode="decimal"
                          placeholder="0"
                          sx={{ width: '100%' }}  // ensures the TextField fills the cell
                          InputProps={{
                            endAdornment: <InputAdornment position="end">{row.unit || "pcs"}</InputAdornment>
                          }}
                        />
                      </TableCell>

                      <TableCell sx={{ minWidth: 120 }}>
                        <TextField
                          size="small"
                          value={row.price || ""}
                          inputMode="decimal"
                          placeholder="0.00"
                          InputProps={{
                            startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                            readOnly: true,
                          }}
                        />
                      </TableCell>

                      <TableCell sx={{ minWidth: 120 }}>
                        <TextField
                          size="small"
                          value={Number(row.cost || 0).toFixed(2)}
                          InputProps={{
                            startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                            readOnly: true,
                          }}
                        />
                      </TableCell>

                      <TableCell>
                        <Tooltip title="Remove">
                          <IconButton size="small" onClick={() => removeIngredientRow(row.id)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Cost Overall, Item Price, and Profit/Margin in one row */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems="center"
              justifyContent="flex-end"
              sx={{ mt: 3 }}
            >
              {/* Cost Overall */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TextField
                  label="Cost Overall"
                  size="small"
                  value={computeCostOverall().toFixed(2)}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                    readOnly: true,
                  }}
                  sx={{ width: 130 }}
                />
              </Box>

              {/* Item Price */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TextField
                  label="Item Price"
                  size="small"
                  value={f.price}
                  onChange={(e) => {
                    const v = String(e.target.value ?? "").replace(/[^0-9.]/g, "");
                    setF((s) => ({ ...s, price: v }));
                  }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                  }}
                  inputMode="decimal"
                  sx={{ width: 130 }}
                />
              </Box>

              {/* Profit / Margin (expand only within the row) */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TextField
                  label="Profit / Margin"
                  size="small"
                  value={(() => {
                    const price = parseFloat(f.price || 0);
                    const cost = computeCostOverall();
                    const profit = price - cost;
                    const margin = price > 0 ? ((profit / price) * 100).toFixed(1) : "0";
                    return `₱${profit.toFixed(2)} • ${margin}%`;
                  })()}
                  InputProps={{ readOnly: true }}
                  sx={{ width: 220 }} // expand a bit, but not stretch full width
                />
              </Box>
            </Stack>

          </Box>
          </Stack>

          {saveErr && (
            <Typography variant="body2" color="error">
              {saveErr}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelEdit} disabled={saving}>Cancel</Button>
          <Button onClick={updateItem} variant="contained" disabled={saving || !f.name.trim()}>{saving ? "Updating..." : "Update"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}