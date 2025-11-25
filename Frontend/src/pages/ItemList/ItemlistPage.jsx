// QUSCINA_BACKOFFICE/Frontend/src/pages/ItemList/ItemlistPage.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Box, Paper, Stack, Button, FormControl, InputLabel, Select, MenuItem,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Typography, Divider, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Avatar, TablePagination,
  Checkbox, IconButton, Tooltip, InputAdornment, useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
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

/* ---------------------------- Unit display helper ---------------------------- */
function formatUnit(u) {
  const s = String(u || "").trim().toLowerCase();
  if (!s) return "";

  if (s === "g" || s === "gram" || s === "grams") return "G";
  if (s === "ml" || s === "milliliter" || s === "milliliters") return "ML";
  if (s === "pc" || s === "pcs" || s === "piece" || s === "pieces") return "PCS";

  return s.toUpperCase(); // fallback
}
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
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  // dialog state for discard confirmation
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardTarget, setDiscardTarget] = useState(null); // "create" or "edit"

  // table filter
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

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
  const [createShowErrors, setCreateShowErrors] = useState(false);
  const [createTouched, setCreateTouched] = useState({ category: false });

  // dialog state (edit)
  const [openEdit, setOpenEdit] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editShowErrors, setEditShowErrors] = useState(false);
  const [editTouched, setEditTouched] = useState({ category: false });

  // confirm delete selected dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOne, setDeleteOne] = useState({ open: false, id: null, name: "" });

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

  // ingredients from inventory (for ingredient selector inside Add/Edit)
  const [inventory, setInventory] = useState([]); // {id,name,category,type,currentStock,price}
  const [ingLoading, setIngLoading] = useState(false);

  // ingredients used in item (create/edit)
  const [itemIngredients, setItemIngredients] = useState([]); // each: { id, ingredientId, name, category, unit, currentStock, qty, price, cost }

  // selection
  const [selected, setSelected] = useState([]);

  // pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5); // -1 for "All"

  function nameExistsCaseInsensitive(name, exceptId = null) {
    const t = normalizeName(name).toLowerCase();
    return rows.some(r => r.name && r.name.trim().toLowerCase() === t && String(r.id) !== String(exceptId || ""));
  }

  // Unique categories from inventory for per-row category dropdown
  const inventoryCategories = useMemo(() => {
    const set = new Set();
    for (const ing of inventory) {
      if (ing.category) set.add(ing.category);
    }
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
  }, [inventory]);

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
  useEffect(() => {
    setPage(0);
  }, [qs, rowsPerPage, rows.length, search]);

  useEffect(() => {
    // When imagePreview changes, this cleanup will revoke the PREVIOUS blob URL
    if (!f.imagePreview?.startsWith("blob:")) return;

    return () => {
      try { URL.revokeObjectURL(f.imagePreview); } catch {}
    };
  }, [f.imagePreview]);

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
        return {
          ...r,
          ingredientId: "",
          name: "",
          category: "",
          unit: "",
          currentStock: 0,
          price: "",
          qty: "",
          cost: 0,
        };
      }

      const unitPrice = Number(selectedIng.price || 0);
      const qtyN = parseFloat(r.qty) || 0;

      return {
        ...r,
        ingredientId: selectedIng.id,
        name: selectedIng.name,
        category: selectedIng.category,
        unit: selectedIng.unit,
        currentStock: selectedIng.currentStock,
        // store unit price
        price: unitPrice,
        // keep existing qty
        qty: r.qty || "",
        // cost = qty * unit price
        cost: +(qtyN * unitPrice).toFixed(2),
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
      const unitPrice = parseFloat(newRow.price) || 0;

      // cost for this ingredient row
      newRow.cost = +(qtyN * unitPrice).toFixed(2);

      return newRow;
    }));
  }

  // Select category at ingredient-row level
  function onSelectIngredientCategory(rowId, categoryName) {
    setItemIngredients(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r;

        // When category changes, clear ingredient selection + stock/price/qty/cost
        return {
          ...r,
          category: categoryName || "",
          ingredientId: "",
          name: "",
          unit: "",
          currentStock: 0,
          qty: "",
          price: "",
          cost: 0,
        };
      })
    );
  }

  const computeCostOverall = () => {
    return itemIngredients.reduce((s, r) => s + (Number(r.cost || 0)), 0);
  };

  // ========== CREATE ==========
  async function saveItem() {
    setCreateShowErrors(true);
    setSaving(true);
    setSaveErr("");
    try {
      const cleanName = normalizeName(f.name);
      if (!isValidName(cleanName)) {
        throw new Error(
          "Please enter a valid item name (max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /)."
        );
      }

      // Local pre-check (UX only; DB is the final authority)
      if (nameExistsCaseInsensitive(cleanName)) {
        throw new Error(
          "That item name already exists. Names are not case-sensitive. Try a different name."
        );
      }

      // 🔴 Category is required
      if (!f.categoryId) {
        throw new Error("Category is required.");
      }

      // Prefer the canonical name from cats; fall back to f.categoryName
      const pickedCatName = (cats.find(c => String(c.id) === String(f.categoryId))?.name) || f.categoryName;
      const cleanCatName = normalizeName(pickedCatName);
      if (!cleanCatName || !isValidName(cleanCatName)) {
        throw new Error("Invalid category name.");
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
      form.append("categoryId", f.categoryId);          // 🔴 always
      form.append("categoryName", cleanCatName);        // 🔴 always
      if (f.imageFile) form.append("image", f.imageFile);
      form.append("ingredients", JSON.stringify(ingPayload));
      form.append("costOverall", String(costOverall));

      const res = await fetch(`/api/items`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data?.code === "name_taken") {
        throw new Error(
          data?.error ||
            "That item name already exists. Names are not case-sensitive. Try a different name."
        );
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Save failed (HTTP ${res.status})`);
      }

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

  // ========== EDIT ==========
  async function updateItem() {
    if (!editingId) return;
    setEditShowErrors(true);
    setSaving(true);
    setSaveErr("");
    try {
      const cleanName = normalizeName(f.name);
      if (!isValidName(cleanName)) {
        throw new Error(
          "Please enter a valid item name (max 60 chars; allowed letters, numbers, spaces, - ' & . , ( ) /)."
        );
      }

      // Local pre-check (ignore the item being edited)
      if (nameExistsCaseInsensitive(cleanName, editingId)) {
        throw new Error(
          "That item name already exists. Names are not case-sensitive. Try a different name."
        );
      }

      // 🔴 Category is required for edit, too
      if (!f.categoryId) {
        throw new Error("Category is required.");
      }

      // Prefer canonical name from cats; fall back to f.categoryName
      const pickedCatName = (cats.find(c => String(c.id) === String(f.categoryId))?.name) || f.categoryName;
      const cleanCatName = normalizeName(pickedCatName);
      if (!cleanCatName || !isValidName(cleanCatName)) {
        throw new Error("Invalid category name.");
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
      form.append("categoryId", f.categoryId);         // 🔴 always (no empty string)
      form.append("categoryName", cleanCatName);       // 🔴 always (no empty string)
      form.append("ingredients", JSON.stringify(ingPayload));
      form.append("costOverall", String(costOverall));
      if (f.imageFile) form.append("image", f.imageFile);

      const res = await fetch(`/api/items/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        body: form,
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data?.code === "name_taken") {
        throw new Error(
          data?.error ||
            "That item name already exists. Names are not case-sensitive. Try a different name."
        );
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Update failed (HTTP ${res.status})`);
      }

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

  /* ============== Edit ============== */
  function openEditDialog(row) {
    const nextF = {
      name: row.name || "",
      description: row.description || "",
      categoryId: row.categoryId || "",
      categoryName: row.categoryName || "",
      price: row.price != null ? String(row.price) : "",
      imageFile: null,
      imagePreview: row.imageUrl || "",
    };

    const initialIngredients = Array.isArray(row.ingredients)
      ? row.ingredients.map((x, idx) => {
          const inventoryItem = inventory.find((inv) => inv.id === x.ingredientId);
          const currentStock = inventoryItem ? inventoryItem.currentStock : 0;
          const unit = inventoryItem ? inventoryItem.unit : x.unit || "";

          return {
            id: x.ingredientId ? x.ingredientId : `e-${idx}-${Date.now()}`,
            ingredientId: x.ingredientId || "",
            name: x.name || "",
            category: x.category || "",
            unit,
            currentStock,
            qty: x.qty != null ? String(x.qty) : "",
            price: x.price != null ? String(x.price) : "",
            cost:
              x.cost != null
                ? Number(x.cost)
                : Number(x.qty || 0) * Number(x.price || 0),
          };
        })
      : [];

    setEditingId(row.id);
    setF(nextF);
    setItemIngredients(initialIngredients);
    setSaveErr("");
    setOpenEdit(true);
    setEditShowErrors(false);

    // ✅ Take the "initial" snapshot from the values we just computed
    initialEditRef.current = snapshotFormFrom(nextF, initialIngredients);
    editTouchedRef.current = false;
  }

  function cancelEdit() {
    setOpenEdit(false);
    setEditingId("");
    resetForm();
    setSaveErr("");
    initialEditRef.current = null;
    editTouchedRef.current = false;
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

  async function onDeleteOneConfirmed() {
    if (!deleteOne.id) return;
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(deleteOne.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);

      // If it was selected, unselect it
      setSelected(prev => prev.filter(x => x !== deleteOne.id));

      // If you were editing it, close the dialog
      if (String(editingId) === String(deleteOne.id)) {
        setOpenEdit(false);
        setEditingId("");
        resetForm();
      }

      alert.info(`Deleted "${deleteOne.name || "item"}".`);
      setDeleteOne({ open: false, id: null, name: "" });
      await loadItems();
    } catch (e) {
      alert.error(e?.message || "Failed to delete item.");
    }
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = String(r.name || "").toLowerCase();
      const cat  = String(r.categoryName || "").toLowerCase();
      return name.includes(q) || cat.includes(q);
    });
  }, [rows, search]);

  // selection helpers
  const allChecked =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selected.includes(r.id));

  const someChecked =
    filteredRows.some((r) => selected.includes(r.id)) && !allChecked;

  const toggleAll = () => {
    const ids = filteredRows.map((r) => r.id);
    const everyIncluded = ids.every((id) => selected.includes(id));
    setSelected((s) =>
      everyIncluded
        ? s.filter((id) => !ids.includes(id))
        : Array.from(new Set([...s, ...ids]))
    );
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


  // ✦ Track "touched" + initial snapshots
  const createTouchedRef = useRef(false);
  const editTouchedRef   = useRef(false);
  const initialCreateRef = useRef(null); // { f, itemIngredients }
  const initialEditRef   = useRef(null);

  function snapshotFormFrom(formState, ingredientsState) {
    const cleanF = {
      ...formState,
      name: String(formState.name || "").trim(),
      description: String(formState.description || "").trim(),
      categoryId: String(formState.categoryId || ""),
      categoryName: String(formState.categoryName || "").trim(),
      price: String(formState.price || "").trim(),
      imageFile: !!formState.imageFile,
      imagePreview: !!formState.imagePreview,
    };

    const ings = (ingredientsState || []).map((r) => ({
      ingredientId: String(r.ingredientId || ""),
      qty: String(r.qty || "").trim(),
      price: String(r.price || "").trim(),
    }));

    return { f: cleanF, ings };
  }

  // ✦ Normalize the form for stable comparison (current state)
  function snapshotForm() {
    return snapshotFormFrom(f, itemIngredients);
  }

  // ✦ Normalize the form for stable comparison
  function snapshotForm() {
    const cleanF = {
      ...f,
      // trim strings so whitespace edits don't false-trigger
      name: String(f.name || "").trim(),
      description: String(f.description || "").trim(),
      categoryId: String(f.categoryId || ""),
      categoryName: String(f.categoryName || "").trim(),
      price: String(f.price || "").trim(),
      imageFile: !!f.imageFile,      // only presence matters for "dirty" detection
      imagePreview: !!f.imagePreview // ditto
    };

    // Only fields we actually edit on ingredients
    const ings = itemIngredients.map(r => ({
      ingredientId: String(r.ingredientId || ""),
      qty: String(r.qty || "").trim(),
      price: String(r.price || "").trim(),
      // name/category/unit/currentStock/cost are derived; we don’t include them
    }));

    return { f: cleanF, ings };
  }

  function deepEqual(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); }
    catch { return false; }
  }

  // ✦ Is dialog dirty?
  function isDirty(target /* "create" | "edit" */) {
    const snapNow = snapshotForm();
    if (target === "create") {
      if (!initialCreateRef.current) return false;
      if (createTouchedRef.current) return true;
      return !deepEqual(snapNow, initialCreateRef.current);
    }
    if (target === "edit") {
      if (!initialEditRef.current) return false;
      if (editTouchedRef.current) return true;
      return !deepEqual(snapNow, initialEditRef.current);
    }
    return false;
  }

  const canUpdate = useMemo(() => {
    if (!openEdit) return false;
    const hasValidName = isValidName(normalizeName(f.name || ""));
    if (!hasValidName) return false;
    if (!f.categoryId) return false;               // 🔴 must have category
    return isDirty("edit");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEdit, f, itemIngredients]);

  // ✦ Centralized close attempt
  function tryClose(target) {
    if (saving) return;
    if (isDirty(target)) {
      setDiscardTarget(target);
      setDiscardOpen(true);
    } else {
      if (target === "create") { setOpenCreate(false); resetForm(); }
      if (target === "edit")   { cancelEdit(); }
    }
  }

  // Reusable menu styling: same scrollbar + full-bleed highlight
  const dropdownMenuProps = {
    MenuListProps: { disablePadding: true },   // remove default List padding
    PaperProps: {
      className: "scroll-x",                   // ✅ picks up your global scrollbar design
      sx: {
        maxHeight: 320,
        "& .MuiList-root": { py: 0 },          // extra safety
        "& .MuiMenuItem-root": {
          px: 1.5,                             // keep text inset
          mx: -1.5,                            // make hover/selected bg reach edges
          borderRadius: 0,
        },
        "& .MuiMenuItem-root.Mui-disabled": {
          px: 1.5,
          mx: -1.5,
          opacity: 1,
          color: "text.secondary",
          fontStyle: "italic",
        },
      },
    },
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
              onClick={() => {
                const nextF = { ...emptyForm };

                setF(nextF);
                setItemIngredients([]);
                setSaveErr("");
                setOpenCreate(true);
                setCreateShowErrors(false);
                setCreateTouched({ category: false });

                initialCreateRef.current = snapshotFormFrom(nextF, []);
                createTouchedRef.current = false;
              }}
              sx={{ flexShrink: 0 }}
            >
              Add Item
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

            {/* 🔎 NEW search field (left of Category dropdown) */}
            <TextField
              size="small"
              placeholder="Search item or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                flexGrow: 1,
                minWidth: 200,
                maxWidth: 360,
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            <FormControl
              size="small"
              sx={{
                minWidth: { xs: 160, sm: 200 },
                flexShrink: 0,
              }}
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
                  onClick={() => setDeleteOpen(true)}
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
            sx={{
              width: "100%",
              borderRadius: 1,
              maxHeight: { xs: 420, md: 520 },
              overflowX: "auto"
            }}
          >
            <Table
              stickyHeader
              aria-label="items table"
              sx={{ minWidth: { xs: 720, sm: 900, md: 1080 } }}
            >
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
                  <TableCell align="center"><Typography fontWeight={600}>Actions</Typography></TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Box py={6} textAlign="center">
                        <CircularProgress size={24} />
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : err ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="error">{err}</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
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
                      <TableCell align="center" onClick={(e) => e.stopPropagation()} sx={{ width: 64 }}>
                        <Tooltip title="Delete item">
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
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          <TablePagination
            component="div"
            count={filteredRows.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25, { label: "All", value: -1 }]}
            labelRowsPerPage="Rows per page:"
          />
        </Box>
      </Paper>

      {/* Create Dialog (Responsive) */}
      <Dialog
        open={openCreate}
        onClose={(_e, _reason) => tryClose("create")}
        fullWidth
        fullScreen={fullScreen}
        maxWidth="md"
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: "92%", md: "80%" },
            m: { xs: 0, sm: 2 },
            maxHeight: { xs: "100dvh", sm: "calc(100dvh - 64px)" },
            overflow: "hidden",             // ✅ keep children inside
            display: "flex",                // ✅ stack title/content/actions
            flexDirection: "column",
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography component="div" variant="h5" fontWeight={800}>
            Add Item
          </Typography>
        </DialogTitle>

        <DialogContent
          className="scroll-x"
          dividers
          onInputCapture={() => { createTouchedRef.current = true; }}
          onChangeCapture={() => { createTouchedRef.current = true; }}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: 2,
            flexGrow: 1,            // ✅ fill remaining height
            overflowY: "auto",      // ✅ vertical scroll inside modal
            overflowX: "hidden",
            px: { xs: 2, sm: 3 },
          }}
        >
          {/* Section 1: item info */}
          <Stack spacing={2}>
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

              <FormControl
                fullWidth
                size="small"
                required
                error={(createShowErrors || createTouched.category) && !f.categoryId}
              >
                <InputLabel id="add-item-category-label">Category</InputLabel>
                <Select
                  labelId="add-item-category-label"
                  value={f.categoryId || ""}
                  label="Category"
                  onChange={(e) => onPickCategory(e.target.value)}
                  onBlur={() => setCreateTouched((s) => ({ ...s, category: true }))}  // mark touched
                  MenuProps={dropdownMenuProps}
                >
                  {/* 🔴 remove "None" */}
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
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
              <Typography fontWeight={700}>Ingredients</Typography>
              <Button size="small" onClick={addIngredientRow} startIcon={<AddIcon />}>Add Ingredient</Button>
            </Stack>

            <TableContainer
              component={Paper}
              elevation={0}
              sx={{
                maxHeight: { xs: 300, sm: 400 },
                overflowY: "auto",          // ✅ vertical scroll only
                overflowX: "hidden",        // ✅ prevent side overflow
                "& table": {
                  width: "100%",
                  tableLayout: "fixed",
                  wordWrap: "break-word",
                },
                // ▼▼ Scoped compact padding just for INGREDIENTS table ▼▼
                "& th, & td": {
                  px: 1,         // 8px left/right
                  py: 0.5,       // 4px top/bottom
                },
                "& .MuiInputBase-root": { height: 36 },              // compact Select/TextField height
                "& .MuiSelect-select": { py: 0.75, px: 1 },          // compact select inner padding
                "& .MuiInputAdornment-root": { m: 0 },               // tighten adornments
                // ✅ Mobile-friendly stacked table (unchanged)
                "@media (max-width:600px)": {
                  "& thead": { display: "none" }, // hide headers
                  "& tr": {
                    display: "block",
                    borderBottom: "1px solid rgba(0,0,0,0.1)",
                    marginBottom: "8px",
                    padding: "8px 4px",
                  },
                  "& td": {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "4px",
                    fontSize: "0.9rem",
                    padding: "8px 6px !important",
                    border: "none !important",
                    "&::before": {
                      content: "attr(data-label)",  // use table headers as labels
                      fontWeight: 600,
                      color: "rgba(0,0,0,0.6)",
                      fontSize: "0.8rem",
                    },
                  },
                },
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  "& .MuiTableCell-root": { py: 1.25 },
                  "& .MuiTableCell-head": { py: 1 },
                  "& .MuiTableRow-root": { height: "auto" },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell data-label="Category" align="center">Category</TableCell>
                    <TableCell data-label="Ingredient" align="center">Ingredient</TableCell>
                    <TableCell data-label="Unit / In stock" align="center">Unit / In stock</TableCell>
                    <TableCell data-label="Qty" align="center">Qty</TableCell>
                    <TableCell data-label="Costing Per Pack" align="center">
                      Costing Per Pack
                    </TableCell>
                    <TableCell data-label="Action" align="center">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ingLoading && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Box py={2} textAlign="center">
                          <CircularProgress size={20} />
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}

                  {!ingLoading && itemIngredients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Box py={3} textAlign="center">
                          <Typography variant="body2" color="text.secondary">
                            No ingredients added. Click "Add Ingredient".
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}

                  {itemIngredients.map(row => {
                    const ingredientOptions = row.category
                      ? inventory.filter(i => i.category === row.category)
                      : inventory;

                    return (
                      <TableRow key={row.id}>
                        {/* Category first column (dropdown) */}
                        <TableCell
                          data-label="Category"
                          align="center"
                          sx={{ minWidth: 140 }}
                        >
                          <FormControl fullWidth size="small">
                            <Select
                              value={row.category || ""}
                              displayEmpty
                              onChange={(e) =>
                                onSelectIngredientCategory(row.id, e.target.value)
                              }
                              MenuProps={dropdownMenuProps}
                            >
                              <MenuItem value="">
                                <em>Select category</em>
                              </MenuItem>
                              {inventoryCategories.map(catName => (
                                <MenuItem key={catName} value={catName}>
                                  {catName}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>

                        {/* Ingredient second column, filtered by category */}
                        <TableCell
                          data-label="Ingredient"
                          align="center"
                          sx={{ minWidth: { xs: 220, sm: 260 } }}
                        >
                          <FormControl fullWidth size="small">
                            <Select
                              value={row.ingredientId || ""}
                              displayEmpty
                              onChange={(e) =>
                                onSelectInventory(row.id, e.target.value)
                              }
                              MenuProps={dropdownMenuProps}
                            >
                              <MenuItem value="">
                                <em>
                                  {row.category
                                    ? "Select ingredient"
                                    : "Select category first"}
                                </em>
                              </MenuItem>
                              {ingredientOptions.map(i => (
                                <MenuItem
                                  key={i.id}
                                  value={i.id}
                                  sx={{ py: 0.75 }}
                                >
                                  {i.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>

                        <TableCell
                          data-label="Unit / In Stock"
                          align="center"
                          sx={{ minWidth: 110 }}
                        >
                          <Typography variant="body2">
                            {row.unit ? formatUnit(row.unit) : "—"}
                            {row.currentStock != null ? ` • ${row.currentStock}` : ""}
                          </Typography>
                        </TableCell>

                        <TableCell
                          data-label="Qty"
                          align="center"
                          sx={{ minWidth: 96 }}
                        >
                          <TextField
                            size="small"
                            value={row.qty || ""}
                            onChange={(e) =>
                              onRowChange(row.id, "qty", e.target.value)
                            }
                            inputMode="decimal"
                            placeholder="0"
                            fullWidth
                            InputProps={{
                              endAdornment: (
                              <InputAdornment position="end">
                                {row.unit ? formatUnit(row.unit) : "PCS"}
                              </InputAdornment>
                              ),
                            }}
                          />
                        </TableCell>

                        <TableCell
                          data-label="Costing Per Pack"
                          align="center"
                          sx={{ minWidth: 112 }}
                        >
                          <TextField
                            size="small"
                            // Costing Per Pack (unit cost copied from Inventory)
                            value={
                              row.price != null
                                ? Number(row.price).toFixed(2)
                                : ""}
                            inputMode="decimal"
                            placeholder="0.00"
                            fullWidth
                            disabled
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  ₱
                                </InputAdornment>
                              ),
                            }}
                          />
                        </TableCell>

                        <TableCell
                          data-label="Action"
                          align="center"
                          sx={{ width: 64 }}
                        >
                          <Tooltip title="Remove">
                            <IconButton
                              size="small"
                              onClick={() => removeIngredientRow(row.id)}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
            sx={{ mt: 2, flexWrap: "wrap" }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                label="Cost Overall"
                size="small"
                value={computeCostOverall().toFixed(2)}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                  readOnly: true
                }}
                sx={{ width: 140 }}
              />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                label="Item Price"
                size="small"
                value={f.price}
                onChange={(e) => {
                  const v = String(e.target.value ?? "").replace(/[^0-9.]/g, "");
                  setF((s) => ({ ...s, price: v }));
                }}
                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                inputMode="decimal"
                sx={{ width: 140 }}
              />
            </Box>

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

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5 }}>
          <Button onClick={() => tryClose("create")} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={saveItem} variant="contained" disabled={saving || !f.name.trim() || !f.categoryId}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog (Responsive) */}
      <Dialog
        open={openEdit}
        onClose={(_e, _reason) => tryClose("edit")}
        fullWidth
        fullScreen={fullScreen}
        maxWidth="md"
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: "92%", md: "80%" },
            m: { xs: 0, sm: 2 },
            maxHeight: { xs: "100dvh", sm: "calc(100dvh - 64px)" },
            overflow: "hidden",            // ✅ keep content inside
            display: "flex",
            flexDirection: "column",
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography component="div" variant="h5" fontWeight={800}>
            Edit Item
          </Typography>
        </DialogTitle>

        <DialogContent
          className="scroll-x"
          dividers
          onInputCapture={() => { editTouchedRef.current = true; }}
          onChangeCapture={() => { editTouchedRef.current = true; }}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: 2,
            flexGrow: 1,
            overflowY: "auto",      // ✅ vertical scroll inside
            overflowX: "hidden",
            px: { xs: 2, sm: 3 },
          }}
        >
          <Stack spacing={2}>
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

              <FormControl
                fullWidth
                required
                error={(editShowErrors || editTouched.category) && !f.categoryId}
              >
                <InputLabel id="edit-item-category-label">Category</InputLabel>
                <Select
                  labelId="edit-item-category-label"
                  value={f.categoryId || ""}
                  label="Category"
                  onChange={(e) => onPickCategory(e.target.value)}
                  onBlur={() => setEditTouched((s) => ({ ...s, category: true }))}
                  MenuProps={dropdownMenuProps}
                  sx={{
                    height: "56px",
                    display: "flex",
                    alignItems: "center",
                    "& .MuiSelect-select": { paddingY: "16.5px" },
                  }}
                >
                  {/* 🔴 remove "None" */}
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

          {/* Ingredients table */}
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
              <Typography fontWeight={700}>Ingredients</Typography>
              <Button size="small" onClick={addIngredientRow} startIcon={<AddIcon />}>Add Ingredient</Button>
            </Stack>

            <Box>
              <TableContainer
                component={Paper}
                elevation={0}
                sx={{
                  maxHeight: { xs: 260, sm: 360 },
                  mb: 2,
                  overflowY: "auto",
                  overflowX: "hidden",
                  "& table": {
                    width: "100%",
                    tableLayout: "fixed",
                    wordWrap: "break-word",
                  },
                  // ▼▼ Scoped compact padding just for INGREDIENTS table ▼▼
                  "& th, & td": {
                    px: 1,
                    py: 0.5,
                  },
                  "& .MuiInputBase-root": { height: 36 },
                  "& .MuiSelect-select": { py: 0.75, px: 1 },
                  "& .MuiInputAdornment-root": { m: 0 },
                  // ✅ Mobile-friendly stacked table (unchanged)
                  "@media (max-width:600px)": {
                    "& thead": { display: "none" }, // hide headers
                    "& tr": {
                      display: "block",
                      borderBottom: "1px solid rgba(0,0,0,0.1)",
                      marginBottom: "8px",
                      padding: "8px 4px",
                    },
                    "& td": {
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: "4px",
                      fontSize: "0.9rem",
                      padding: "8px 6px !important",
                      border: "none !important",
                      "&::before": {
                        content: "attr(data-label)",  // use table headers as labels
                        fontWeight: 600,
                        color: "rgba(0,0,0,0.6)",
                        fontSize: "0.8rem",
                      },
                    },
                  },
                }}
              >
                <Table
                  stickyHeader
                  size="small"
                  sx={{
                    "& .MuiTableCell-root": { py: 1.25 },
                    "& .MuiTableCell-head": { py: 1 },
                    "& .MuiTableRow-root": { height: "auto" },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell data-label="Category" align="center">Category</TableCell>
                      <TableCell data-label="Ingredient" align="center">Ingredient</TableCell>
                      <TableCell data-label="Unit / In stock" align="center">Unit / In stock</TableCell>
                      <TableCell data-label="Qty" align="center">Qty</TableCell>
                      <TableCell data-label="Costing Per Pack" align="center">Costing Per Pack</TableCell>
                      <TableCell data-label="Action" align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ingLoading && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <Box py={2} textAlign="center">
                            <CircularProgress size={20} />
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}

                    {!ingLoading && itemIngredients.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <Box py={3} textAlign="center">
                            <Typography variant="body2" color="text.secondary">
                              No ingredients added. Click "Add Ingredient".
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}

                    {itemIngredients.map(row => {
                      const ingredientOptions = row.category
                        ? inventory.filter(i => i.category === row.category)
                        : inventory;

                      return (
                        <TableRow key={row.id}>
                          {/* Category first */}
                          <TableCell
                            data-label="Category"
                            align="center"
                            sx={{ minWidth: 140 }}
                          >
                            <FormControl fullWidth size="small">
                              <Select
                                value={row.category || ""}
                                displayEmpty
                                onChange={(e) =>
                                  onSelectIngredientCategory(row.id, e.target.value)
                                }
                                MenuProps={dropdownMenuProps}
                              >
                                <MenuItem value="">
                                  <em>Select category</em>
                                </MenuItem>
                                {inventoryCategories.map(catName => (
                                  <MenuItem key={catName} value={catName}>
                                    {catName}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>

                          {/* Ingredient second, filtered by category */}
                          <TableCell
                            data-label="Ingredient"
                            align="center"
                            sx={{ minWidth: { xs: 220, sm: 260 } }}
                          >
                            <FormControl fullWidth size="small">
                              <Select
                                value={row.ingredientId || ""}
                                displayEmpty
                                onChange={(e) =>
                                  onSelectInventory(row.id, e.target.value)
                                }
                                MenuProps={dropdownMenuProps}
                              >
                                <MenuItem value="">
                                  <em>
                                    {row.category
                                      ? "Select ingredient"
                                      : "Select category first"}
                                  </em>
                                </MenuItem>
                                {ingredientOptions.map(i => (
                                  <MenuItem
                                    key={i.id}
                                    value={i.id}
                                    sx={{ py: 0.75 }}
                                  >
                                    {i.name}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>

                          <TableCell
                            data-label="Unit / In Stock"
                            align="center"
                            sx={{ minWidth: 110 }}
                          >
                            <Typography variant="body2">
                              {row.unit ? formatUnit(row.unit) : "—"}
                              {row.currentStock != null ? ` • ${row.currentStock}` : ""}
                            </Typography>
                          </TableCell>

                          <TableCell
                            data-label="Qty"
                            align="center"
                            sx={{ minWidth: 96 }}
                          >
                            <TextField
                              size="small"
                              value={row.qty || ""}
                              onChange={(e) =>
                                onRowChange(row.id, "qty", e.target.value)
                              }
                              inputMode="decimal"
                              placeholder="0"
                              fullWidth
                              InputProps={{
                                endAdornment: (
                                  <InputAdornment position="end">
                                    {row.unit ? formatUnit(row.unit) : "PCS"}
                                  </InputAdornment>
                                ),
                              }}
                            />
                          </TableCell>

                          <TableCell
                            data-label="Costing Per Pack"
                            align="center"
                            sx={{ minWidth: 112 }}
                          >
                            <TextField
                              size="small"
                              // Costing Per Pack (unit cost copied from Inventory)
                              value={
                                row.price != null
                                  ? Number(row.price).toFixed(2)
                                  : ""}
                              inputMode="decimal"
                              placeholder="0.00"
                              fullWidth
                              disabled
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    ₱
                                  </InputAdornment>
                                ),
                              }}
                            />
                          </TableCell>

                          <TableCell
                            data-label="Action"
                            align="center"
                            sx={{ width: 64 }}
                          >
                            <Tooltip title="Remove">
                              <IconButton
                                size="small"
                                onClick={() => removeIngredientRow(row.id)}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Cost row */}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                alignItems="center"
                justifyContent="flex-end"
                sx={{ mt: 3, flexWrap: "wrap" }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <TextField
                    label="Cost Overall"
                    size="small"
                    value={computeCostOverall().toFixed(2)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                      readOnly: true,
                    }}
                    sx={{ width: 140 }}
                  />
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <TextField
                    label="Item Price"
                    size="small"
                    value={f.price}
                    onChange={(e) => {
                      const v = String(e.target.value ?? "").replace(/[^0-9.]/g, "");
                      setF((s) => ({ ...s, price: v }));
                    }}
                    InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                    inputMode="decimal"
                    sx={{ width: 140 }}
                  />
                </Box>

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
            </Box>
          </Stack>

          {saveErr && (
            <Typography variant="body2" color="error">
              {saveErr}
            </Typography>
          )}
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5 }}>
          <Button onClick={() => tryClose("edit")} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={updateItem} variant="contained" disabled={saving || !canUpdate}>
            {saving ? "Updating..." : "Update"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Discard Confirmation Dialog */}
      <Dialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        fullScreen={fullScreen}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 420 },
            m: { xs: 0, sm: 2 }
          }
        }}
      >
        <DialogTitle>Discard changes?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to discard unsaved changes? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              setDiscardOpen(false);
              if (discardTarget === "create") {
                setOpenCreate(false);
              } else if (discardTarget === "edit") {
                cancelEdit();
              }
              resetForm();
            }}
            color="error"
            variant="contained"
          >
            Discard
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Single-delete Confirm Dialog */}
      <Dialog
        open={deleteOne.open}
        onClose={() => setDeleteOne({ open: false, id: null, name: "" })}
        maxWidth="xs"
        fullWidth
        fullScreen={fullScreen}
        PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, m: { xs: 0, sm: 2 } } }}
      >
        <DialogTitle>Delete item?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleteOne.name || "this item"}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOne({ open: false, id: null, name: "" })}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={onDeleteOneConfirmed}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Selected Confirmation Dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        maxWidth="xs"
        fullWidth
        fullScreen={fullScreen}
        PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, m: { xs: 0, sm: 2 } } }}
      >
        <DialogTitle>Delete selected?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete {selected.length} item{selected.length > 1 ? "s" : ""}? This cannot be undone.
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