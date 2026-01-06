// QUSCINA_BACKOFFICE/Frontend/src/pages/ItemList/ItemlistPage.jsx
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Box, Paper, Stack, Button, FormControl, InputLabel, Select, MenuItem,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Typography, Divider, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Avatar, TablePagination,
  Checkbox, IconButton, Tooltip, InputAdornment, useMediaQuery, Chip,
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

function formatKindLabel(k) {
  const s = String(k || "").trim().toLowerCase();
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1); // product -> Product
}

function renderInvOption(inv) {
  const name = inv?.name || "Unnamed";
  const cat = inv?.category || "—";
  const unit = inv?.unit ? formatUnit(inv.unit) : "—";
  const stock = Number(inv?.currentStock || 0).toLocaleString();

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 1,
        minWidth: 0,          // ✅ critical
      }}
    >
      <Typography
        noWrap
        sx={{
          fontSize: "1rem",
          fontWeight: 600,
          lineHeight: 1.3,
          flex: "1 1 0",      // ✅ can shrink
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </Typography>

      <Typography
        noWrap
        sx={{
          fontSize: "0.85rem",
          fontWeight: 500,
          lineHeight: 1.3,
          color: "text.secondary",
          flex: "0 1 auto",   // ✅ can shrink too
          minWidth: 0,
          maxWidth: 220,      // ✅ prevents “infinite width”
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {cat} • {formatKindLabel(inv?.kind)} • {unit} • Stock {stock}
      </Typography>
    </Box>
  );
}

function renderRecipeIngOption(inv) {
  const name = inv?.name || "Unnamed";
  const unit = inv?.unit ? formatUnit(inv.unit) : "—";
  const stock = Number(inv?.currentStock || 0).toLocaleString();

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        py: 0.5,
      }}
    >
      {/* LEFT — Ingredient name */}
      <Typography
        noWrap
        sx={{
          fontSize: "1rem",
          fontWeight: 600,
          lineHeight: 1.3,
          flex: 1,
          minWidth: 0,
        }}
      >
        {name}
      </Typography>

      {/* RIGHT — Meta info (NO category) */}
      <Typography
        noWrap
        sx={{
          fontSize: "0.85rem",
          fontWeight: 500,
          lineHeight: 1.3,
          color: "text.secondary",
          ml: 2,
          whiteSpace: "nowrap",
        }}
      >
        {formatKindLabel(inv?.kind)} • {unit} • Stock {stock}
      </Typography>
    </Box>
  );
}

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

/* ------------------------------ Money helper ------------------------------ */
function asMoney(v) {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  // keep 2 decimals for selling price
  return Math.round(n * 100) / 100;
}

/* -------------------------- Payload builders (NEW) -------------------------- */
function buildRecipePayloadFrom(itemIngredients) {
  return (itemIngredients || [])
    .map((r) => ({
      ingredientId: String(r.ingredientId || "").trim(),
      name: String(r.name || "").trim(),
      category: String(r.category || "").trim(),
      unit: String(r.unit || "").trim(),
      qty: Number(String(r.qty ?? "").replace(/[^0-9.]/g, "")) || 0,
    }))
    .filter((r) => r.ingredientId && r.qty > 0);
}

function buildDirectProductsPayloadFrom(directProducts, legacy) {
  // Prefer multi-row directProducts state if you use it
  const fromRows = (directProducts || [])
    .map((r) => ({
      inventoryIngredientId: Number(r.inventoryIngredientId || 0),
      name: String(r.name || "").trim(),
      qty: Number(String(r.qty ?? "").replace(/[^0-9.]/g, "")) || 0,
    }))
    .filter((x) => Number.isFinite(x.inventoryIngredientId) && x.inventoryIngredientId > 0 && x.qty > 0);

  if (fromRows.length) return fromRows;

  // Backward-compat: single select + deduct qty
  const invId = Number(legacy?.inventoryIngredientId || 0);
  const qty = Number(String(legacy?.inventoryDeductQty ?? "").replace(/[^0-9.]/g, "")) || 0;

  if (Number.isFinite(invId) && invId > 0 && qty > 0) {
    return [{ inventoryIngredientId: invId, name: "", qty }];
  }
  return [];
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

  const [directProducts, setDirectProducts] = useState([]);

function addDirectProductRow() {
  setDirectProducts(prev => [
    ...prev,
    {
      id: `dp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: "",
      inventoryIngredientId: "",
      name: "",
      unit: "",
      currentStock: 0,
      qty: "",
    },
  ]);
}

function removeDirectProductRow(id) {
  setDirectProducts(prev => prev.filter(r => r.id !== id));
}

function onSelectDirectCategory(rowId, categoryName) {
  const nextCat = categoryName || "";
  if (nextCat) {
    const valid = productInvCategories.some(c => String(c.name) === String(nextCat));
    if (!valid) return;
  }

  setDirectProducts(prev => prev.map(r => {
    if (r.id !== rowId) return r;
    return {
      ...r,
      category: nextCat,
      inventoryIngredientId: "",
      name: "",
      unit: "",
      currentStock: 0,
      qty: "",
    };
  }));
}

function onSelectDirectProduct(rowId, invId) {
  const picked = inventoryProducts.find(p => String(p.id) === String(invId));
  setDirectProducts(prev => prev.map(r => {
    if (r.id !== rowId) return r;
    if (!picked) {
      return { ...r, inventoryIngredientId: "", name: "", unit: "", currentStock: 0, qty: "" };
    }
    return {
      ...r,
      inventoryIngredientId: picked.id,
      name: picked.name,
      unit: picked.unit,
      currentStock: picked.currentStock,
      qty: r.qty || "1",
    };
  }));
}

function onDirectQtyChange(rowId, rawValue) {
  setDirectProducts(prev => prev.map(r => {
    if (r.id !== rowId) return r;
    const v = String(rawValue ?? "").replace(/[^0-9.]/g, "");
    return { ...r, qty: v === "" ? "" : String(Number(v)) };
  }));
}

  const emptyForm = {
    name: "",
    description: "",
    categoryId: "",
    categoryName: "",
    price: "", // Item level selling price
    imageFile: null,
    imagePreview: "",

    stockMode: "ingredients",

    inventoryProductCategory: "",
    inventoryIngredientId: "",
    inventoryDeductQty: "1",
  };

  const [f, setF] = useState(emptyForm);

  // inventory list (for selectors inside Add/Edit)
  const [inventory, setInventory] = useState([]); // {id,name,category,unit,kind,currentStock}

  const [invCategories, setInvCategories] = useState([]);

  // recipe rows used by the item (composition)
  const [itemIngredients, setItemIngredients] = useState([]); // { id, ingredientId, name, category, unit, currentStock, qty }

  const [ingLoading, setIngLoading] = useState(false);

  // selection
  const [selected, setSelected] = useState([]);

  // pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5); // -1 for "All"

  function nameExistsCaseInsensitive(name, exceptId = null) {
    const t = normalizeName(name).toLowerCase();
    return rows.some(r => r.name && r.name.trim().toLowerCase() === t && String(r.id) !== String(exceptId || ""));
  }

const INGREDIENT_TYPE_ID = 1;
const PRODUCT_TYPE_ID = 2;

function getInvCatTypeId(c) {
  // supports both backend shapes: inventoryTypeId (camel) or inventory_type_id (snake)
  const raw = c?.inventoryTypeId ?? c?.inventory_type_id ?? c?.inventoryTypeID ?? c?.inventory_typeId;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

const ingredientInvCategories = useMemo(() => {
  return invCategories
    .filter(c => getInvCatTypeId(c) === INGREDIENT_TYPE_ID)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}, [invCategories]);

const productInvCategories = useMemo(() => {
  return invCategories
    .filter(c => getInvCatTypeId(c) === PRODUCT_TYPE_ID)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}, [invCategories]);

const inventoryProducts = useMemo(() => {
  const list = inventory
    .filter(x => Number(x.inventoryTypeId) === PRODUCT_TYPE_ID);
    
  const cat = String(f.inventoryProductCategory || "");
  const filtered = cat
    ? list.filter(x => String(x.category || "") === cat)
    : list;

  return filtered.sort((a, b) => {
    const c = String(a.category || "").localeCompare(String(b.category || ""));
    if (c) return c;
    return String(a.name).localeCompare(String(b.name));
  });
}, [inventory, f.inventoryProductCategory]);

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

  // Load inventory ingredients for selector (no pricing)
async function loadInventory() {
  setIngLoading(true);
  try {
    const res = await fetch(`/api/inventory/ingredients`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    const list =
      res.ok && data?.ok && Array.isArray(data.ingredients)
        ? data.ingredients
        : [];

    setInventory(
      list.map((x) => ({
        id: String(x.id),
        name: x.name || "",
        category: x.category || "",
        unit: x.type || "", // backend uses `type`, not `unit`
        inventoryTypeId: Number(x.inventoryTypeId || x.inventory_type_id || 1),
        kind:
          Number(x.inventoryTypeId || x.inventory_type_id || 1) === 2
            ? "product"
            : "ingredient",
        currentStock: Number(x.currentStock || 0),
      }))
    );
  } catch {
    setInventory([]);
  } finally {
    setIngLoading(false);
  }
}

async function loadInventoryCategories() {
  try {
    const res = await fetch(`/api/inventory/inv-categories`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    const list =
      res.ok && data?.ok && Array.isArray(data.categories)
        ? data.categories
        : [];
    setInvCategories(list);
  } catch {
    setInvCategories([]);
  }
}

useEffect(() => {
  loadCategories();
  loadInventory();
  loadInventoryCategories(); // ✅ ADD
}, []);

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

  useEffect(() => {
    if (!openEdit) return;
    setItemIngredients((prev) =>
      prev.map((r) => {
        const inv = inventory.find((x) => x.id === r.ingredientId);
        if (!inv) return r;
        return { ...r, unit: inv.unit || r.unit, currentStock: inv.currentStock };
      })
    );
  }, [inventory, openEdit]);

  // helpers
  const resetForm = () => {
    setF({ ...emptyForm });
    setItemIngredients([]);
    setDirectProducts([]);
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

  // Add one ingredient blank row (no price/cost)
  function addIngredientRow() {
    setItemIngredients(prev => [
      ...prev,
      {
        id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ingredientId: "",
        name: "",
        category: "",
        unit: "",
        currentStock: 0,
        qty: "",
      },
    ]);
  }

  // Remove ingredient row
  function removeIngredientRow(id) {
    setItemIngredients(prev => prev.filter(r => r.id !== id));
  }

  // Select ingredient from inventory (no unit price / cost logic)
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
          qty: "",
        };
      }

      return {
        ...r,
        ingredientId: selectedIng.id,
        name: selectedIng.name,
        category: selectedIng.category,
        unit: selectedIng.unit,
        currentStock: selectedIng.currentStock,
        // keep existing qty as-is
        qty: r.qty || "",
      };
    }));
  }

  // Update qty for ingredient row (no price/cost)
  function onRowChange(rowId, field, rawValue) {
    if (field !== "qty") return;
    setItemIngredients(prev => prev.map(r => {
      if (r.id !== rowId) return r;

      let v = String(rawValue ?? "").replace(/\D/g, "");

      if (v === "") {
        return {
          ...r,
          qty: "",
        };
      }

      v = String(parseInt(v, 10));

      return {
        ...r,
        qty: v,
      };
    }));
  }

// Select category at ingredient-row level
function onSelectIngredientCategory(rowId, categoryName) {
  const nextCat = categoryName || "";

  // defensive: only allow Ingredient categories here
  if (nextCat) {
    const valid = ingredientInvCategories.some(c => String(c.name) === String(nextCat));
    if (!valid) return;
  }

  setItemIngredients(prev =>
    prev.map(r => {
      if (r.id !== rowId) return r;

      // When category changes, clear ingredient selection + stock/qty
      return {
        ...r,
        category: nextCat,
        ingredientId: "",
        name: "",
        unit: "",
        currentStock: 0,
        qty: "",
      };
    })
  );
}

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

      if (nameExistsCaseInsensitive(cleanName)) {
        throw new Error(
          "That item name already exists. Names are not case-sensitive. Try a different name."
        );
      }

      if (!f.categoryId) {
        throw new Error("Category is required.");
      }

      const pickedCatName =
        (cats.find((c) => String(c.id) === String(f.categoryId))?.name) ||
        f.categoryName;

      const cleanCatName = normalizeName(pickedCatName);
      if (!cleanCatName || !isValidName(cleanCatName)) {
        throw new Error("Invalid category name.");
      }

      const cleanDesc = normalizeDesc(f.description).slice(0, DESC_MAX);
      const itemPrice = asMoney(f.price);

      const ingPayload = buildRecipePayloadFrom(itemIngredients);
      const directPayload = buildDirectProductsPayloadFrom(directProducts, {
        inventoryIngredientId: f.inventoryIngredientId,
        inventoryDeductQty: f.inventoryDeductQty,
      });

      const hasRecipe = ingPayload.length > 0;
      const hasDirect = directPayload.length > 0;

      if (!hasRecipe && !hasDirect) {
        throw new Error("Please add at least 1 ingredient OR add at least 1 direct inventory product.");
      }

      // Validate direct qtys (frontend UX; backend still validates)
      for (const dp of directPayload) {
        const q = Number(dp.qty);
        if (!Number.isFinite(q) || q <= 0) {
          throw new Error("Direct product qty must be greater than 0.");
        }
      }

      const form = new FormData();
      form.append("name", cleanName);
      form.append("description", cleanDesc);
      form.append("price", String(itemPrice));
      form.append("categoryId", String(f.categoryId));
      form.append("categoryName", cleanCatName);

      if (f.imageFile) form.append("image", f.imageFile);

      // ✅ NEW fields
      form.append("ingredients", JSON.stringify(ingPayload));
      form.append("directProducts", JSON.stringify(directPayload));

      // (Optional) Backward-compat: if your backend still expects these sometimes,
      // keep them empty so the new JSON is the source of truth.
      // form.append("inventoryIngredientId", "");
      // form.append("inventoryDeductQty", "1");

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
      // also reset direct products
      setDirectProducts([]);
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

      if (nameExistsCaseInsensitive(cleanName, editingId)) {
        throw new Error(
          "That item name already exists. Names are not case-sensitive. Try a different name."
        );
      }

      if (!f.categoryId) {
        throw new Error("Category is required.");
      }

      const pickedCatName =
        (cats.find((c) => String(c.id) === String(f.categoryId))?.name) ||
        f.categoryName;

      const cleanCatName = normalizeName(pickedCatName);
      if (!cleanCatName || !isValidName(cleanCatName)) {
        throw new Error("Invalid category name.");
      }

      const cleanDesc = normalizeDesc(f.description).slice(0, DESC_MAX);
      const itemPrice = asMoney(f.price);

      const ingPayload = buildRecipePayloadFrom(itemIngredients);
      const directPayload = buildDirectProductsPayloadFrom(directProducts, {
        inventoryIngredientId: f.inventoryIngredientId,
        inventoryDeductQty: f.inventoryDeductQty,
      });

      const hasRecipe = ingPayload.length > 0;
      const hasDirect = directPayload.length > 0;

      if (!hasRecipe && !hasDirect) {
        throw new Error(
          "Please add at least 1 ingredient OR add at least 1 direct inventory product."
        );
      }

      for (const dp of directPayload) {
        const q = Number(dp.qty);
        if (!Number.isFinite(q) || q <= 0) {
          throw new Error("Direct product qty must be greater than 0.");
        }
      }

      const form = new FormData();
      form.append("name", cleanName);
      form.append("description", cleanDesc);
      form.append("price", String(itemPrice));
      form.append("categoryId", String(f.categoryId));
      form.append("categoryName", cleanCatName);

      // ✅ NEW fields
      form.append("ingredients", JSON.stringify(ingPayload));
      form.append("directProducts", JSON.stringify(directPayload));

      // (Optional) if keeping legacy fields, send empty to avoid conflicts
      // form.append("inventoryIngredientId", "");
      // form.append("inventoryDeductQty", "1");

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
      setDirectProducts([]);
      alert.success("Item updated.");
    } catch (e) {
      setSaveErr(e?.message || "Update failed");
      alert.error(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  /* ============== Edit ============== */
  async function openEditDialog(row) {
    let full = row;

    // If list payload doesn't include ingredients, fetch full item
    if (!Array.isArray(row.ingredients)) {
      try {
        const res = await fetch(`/api/items/${encodeURIComponent(row.id)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok && data?.item) full = data.item;
      } catch {}
    }

    const nextF = {
      name: full.name || "",
      description: full.description || "",
      categoryId: full.categoryId || "",
      categoryName: full.categoryName || "",
      price: full.price != null ? String(full.price) : "",
      imageFile: null,
      imagePreview: full.imageUrl || "",
      stockMode: full.stockMode || "ingredients",
      inventoryProductCategory: "",
      inventoryIngredientId: full.inventoryIngredientId || "",
      inventoryDeductQty: full.inventoryDeductQty != null ? String(full.inventoryDeductQty) : "1",
    };

    const initialIngredients = Array.isArray(full.ingredients)
      ? full.ingredients.map((x, idx) => {
          const inventoryItem = inventory.find((inv) => inv.id === x.ingredientId);
          return {
            id: x.ingredientId ? x.ingredientId : `e-${idx}-${Date.now()}`,
            ingredientId: x.ingredientId || "",
            name: x.name || "",
            category: x.category || "",
            unit: inventoryItem?.unit || x.unit || "",
            currentStock: inventoryItem?.currentStock || 0,
            qty: x.qty != null ? String(x.qty) : "",
          };
        })
      : [];

    const initialDirect = Array.isArray(full.directProducts)
      ? full.directProducts.map((x, idx) => {
          const inv = inventoryProducts.find(
            (p) => String(p.id) === String(x.inventoryIngredientId)
          );

          return {
            id: `dp-${idx}-${Date.now()}`,
            category: inv?.category || "",
            inventoryIngredientId: String(x.inventoryIngredientId || ""),
            name: inv?.name || x.name || "",
            unit: inv?.unit || "",
            currentStock: inv?.currentStock || 0,
            qty: x.qty != null ? String(x.qty) : "",
          };
        })
      : [];

    setEditingId(full.id);
    setF(nextF);
    setItemIngredients(initialIngredients);
    setDirectProducts(initialDirect);
    setSaveErr("");
    setOpenEdit(true);
    setEditShowErrors(false);

    initialEditRef.current = snapshotFormFrom(nextF, initialIngredients, initialDirect);
    editTouchedRef.current = false;
  }

  function cancelEdit() {
    setOpenEdit(false);
    setEditingId("");
    resetForm();
    setDirectProducts([]);
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
      ? filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
      : filteredRows;

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

  function snapshotFormFrom(formState, ingredientsState, directProductsState) {
    const cleanF = {
      ...formState,
      name: String(formState.name || "").trim(),
      description: String(formState.description || "").trim(),
      categoryId: String(formState.categoryId || ""),
      categoryName: String(formState.categoryName || "").trim(),
      price: String(formState.price || "").trim(),
      imageFile: !!formState.imageFile,
      imagePreview: !!formState.imagePreview,
      stockMode: String(formState.stockMode || "ingredients"),
      inventoryIngredientId: String(formState.inventoryIngredientId || ""),
      inventoryDeductQty: String(formState.inventoryDeductQty || "1").trim(),
    };

    const ings = (ingredientsState || []).map((r) => ({
      ingredientId: String(r.ingredientId || ""),
      qty: String(r.qty || "").trim(),
    }));

    const dps = (directProductsState || []).map((r) => ({
      category: String(r.category || ""),
      inventoryIngredientId: String(r.inventoryIngredientId || ""),
      qty: String(r.qty || "").trim(),
    }));

    // ✅ IMPORTANT: include dps in the returned snapshot
    return { f: cleanF, ings, dps };
  }

  // ✦ Normalize the form for stable comparison (current state)
  function snapshotForm() {
    const cleanF = {
      ...f,
      name: String(f.name || "").trim(),
      description: String(f.description || "").trim(),
      categoryId: String(f.categoryId || ""),
      categoryName: String(f.categoryName || "").trim(),
      price: String(f.price || "").trim(),
      imageFile: !!f.imageFile,
      imagePreview: !!f.imagePreview,
      stockMode: String(f.stockMode || "ingredients"),
      inventoryIngredientId: String(f.inventoryIngredientId || ""),
      inventoryDeductQty: String(f.inventoryDeductQty || "1").trim(),
    };

    const ings = (itemIngredients || []).map((r) => ({
      ingredientId: String(r.ingredientId || ""),
      qty: String(r.qty || "").trim(),
    }));

    const dps = (directProducts || []).map((r) => ({
      category: String(r.category || ""),
      inventoryIngredientId: String(r.inventoryIngredientId || ""),
      qty: String(r.qty || "").trim(),
    }));

    // ✅ IMPORTANT: include dps in the returned snapshot
    return { f: cleanF, ings, dps };
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
    if (!f.categoryId) return false;
    return isDirty("edit");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEdit, f, itemIngredients, directProducts]);

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
    MenuListProps: { disablePadding: true },
    PaperProps: {
      className: "scroll-x",
      sx: {
        maxHeight: 320,
        "& .MuiList-root": { py: 0 },
        "& .MuiMenuItem-root": {
          px: 1.5,
          mx: -1.5,
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
                setDirectProducts([]);
                setSaveErr("");
                setOpenCreate(true);
                setCreateShowErrors(false);
                setCreateTouched({ category: false });

                initialCreateRef.current = snapshotFormFrom(nextF, [], []);
                createTouchedRef.current = false;
              }}
              sx={{ flexShrink: 0 }}
            >
              Add Item
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

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

            overflowX: "auto",
            overflowY: "auto",
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
                  <TableCell><Typography fontWeight={600}>Description</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Stock</Typography></TableCell>
                  <TableCell align="center"><Typography fontWeight={600}>Actions</Typography></TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Box py={6} textAlign="center">
                        <CircularProgress size={24} />
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : err ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="error">{err}</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
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
                        <Typography>
                          {r.price != null
                            ? `₱${Number(r.price).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Typography noWrap title={r.description || ""}>{r.description || "—"}</Typography>
                      </TableCell>

                      <TableCell>
                        {(() => {
                          const mode = String(r.stockMode || "").toLowerCase();

                          if (mode === "direct") {
                            return <Chip size="small" label="Direct" variant="outlined" />;
                          }
                          if (mode === "ingredients") {
                            return <Chip size="small" label="Recipe" variant="outlined" />;
                          }
                          if (mode === "hybrid") {
                            return (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Chip size="small" label="Recipe" variant="outlined" />
                                <Chip size="small" label="Direct" variant="outlined" />
                              </Stack>
                            );
                          }
                          return <Typography variant="body2">—</Typography>;
                        })()}
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
            overflow: "hidden",
            display: "flex",
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
            flexGrow: 1,
            overflowY: "auto",
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
                  onBlur={() => setCreateTouched((s) => ({ ...s, category: true }))}
                  MenuProps={dropdownMenuProps}
                >
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

            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 1, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width="25%">Inventory Category</TableCell>
                    <TableCell width="45%">Inventory Name</TableCell>
                    <TableCell width="20%">Qty</TableCell>
                    <TableCell align="right" width={40}></TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {itemIngredients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography variant="body2" color="text.secondary">
                          No ingredients added yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    itemIngredients.map((row) => (
                      <TableRow key={row.id}>
                        {/* Category selector (NEW) */}
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <Select
                              value={row.category || ""}
                              displayEmpty
                              onChange={(e) => onSelectIngredientCategory(row.id, e.target.value)}
                              MenuProps={dropdownMenuProps}
                            >
                              <MenuItem value="">
                                <em>Select category</em>
                              </MenuItem>
                              {ingredientInvCategories.map((c) => (
                                <MenuItem key={c.id} value={c.name}>
                                  {c.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>

                        {/* Inventory Name selector (FILTERED + DISABLED until category picked) */}
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <Select
                              value={row.ingredientId || ""}
                              displayEmpty
                              disabled={!row.category}
                              onChange={(e) => onSelectInventory(row.id, e.target.value)}
                              MenuProps={dropdownMenuProps}
                              sx={{
                                "& .MuiSelect-select": {
                                  display: "flex",
                                  alignItems: "center",
                                  py: 1.25,
                                },
                              }}
                              renderValue={(val) => {
                                if (!row.category) return <em>Select category first</em>;
                                if (!val) return <em>Select ingredient</em>;
                                const picked = inventory.find((x) => String(x.id) === String(val));
                                return picked ? renderRecipeIngOption(picked) : <em>Select ingredient</em>;
                              }}
                            >
                              <MenuItem value="">
                                <em>{row.category ? "Select ingredient" : "Select category first"}</em>
                              </MenuItem>

                              {inventory
                                .filter((x) => String(x.kind || "").toLowerCase() !== "product")
                                .filter((x) => String(x.category || "") === String(row.category || ""))
                                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                                .map((ing) => (
                                  <MenuItem key={ing.id} value={ing.id}>
                                    {renderRecipeIngOption(ing)}
                                  </MenuItem>
                                ))}
                            </Select>
                          </FormControl>
                        </TableCell>

                        {/* Qty */}
                        <TableCell>
                          <TextField
                            size="small"
                            value={row.qty || ""}
                            onChange={(e) => onRowChange(row.id, "qty", e.target.value)}
                            inputMode="numeric"
                            placeholder="0"
                            fullWidth
                            disabled={!row.ingredientId}
                          />
                        </TableCell>

                        {/* Remove */}
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => removeIngredientRow(row.id)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

          </Stack>

          <Divider />

          {/* ✅ Direct Inventory Product (always optional) */}
          <Stack spacing={2}>

            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography fontWeight={700}>Direct Inventory Products</Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={addDirectProductRow}
                >
                  Add Product
                </Button>
              </Stack>

              <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 1, overflow: "hidden" }} >
                <Table size="small" sx={{ tableLayout: "fixed" }}>
                  <TableHead>
                    <TableRow>
                      <TableCell width="25%">Category</TableCell>
                      <TableCell width="45%">Product</TableCell>
                      <TableCell sx={{ width: 140 }}>Qty</TableCell>
                      <TableCell width={40} />
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {directProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography variant="body2" color="text.secondary">
                            No direct products added.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      directProducts.map((row) => (
                        <TableRow key={row.id}>
                          {/* Category */}
                          <TableCell>
                            <FormControl fullWidth size="small">
                              <Select
                                value={row.category || ""}
                                displayEmpty
                                onChange={(e) =>
                                  onSelectDirectCategory(row.id, e.target.value)
                                }
                                MenuProps={dropdownMenuProps}
                              >
                                <MenuItem value="">
                                  <em>Select category</em>
                                </MenuItem>
                                {productInvCategories.map((c) => (
                                  <MenuItem key={c.id} value={c.name}>
                                    {c.name}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>

                          {/* Product */}
                          <TableCell>
                            <FormControl fullWidth size="small">
                              <Select
                                value={row.inventoryIngredientId || ""}
                                displayEmpty
                                disabled={!row.category}
                                onChange={(e) =>
                                  onSelectDirectProduct(row.id, e.target.value)
                                }
                                MenuProps={dropdownMenuProps}
                                renderValue={(val) => {
                                  if (!row.category) return <em>Select category first</em>;
                                  if (!val) return <em>Select product</em>;
                                  const picked = inventoryProducts.find(
                                    (p) => String(p.id) === String(val)
                                  );
                                  return picked ? renderInvOption(picked) : <em>Select product</em>;
                                }}
                              >
                                <MenuItem value="">
                                  <em>{row.category ? "Select product" : "Select category first"}</em>
                                </MenuItem>
                                {inventoryProducts
                                  .filter((p) => p.category === row.category)
                                  .map((p) => (
                                    <MenuItem key={p.id} value={p.id}>
                                      {renderInvOption(p)}
                                    </MenuItem>
                                  ))}
                              </Select>
                            </FormControl>
                          </TableCell>

                          {/* Qty */}
                          <TableCell>
                            <TextField
                              size="small"
                              value={row.qty || ""}
                              onChange={(e) =>
                                onDirectQtyChange(row.id, e.target.value)
                              }
                              disabled={!row.inventoryIngredientId}
                              inputMode="decimal"
                              placeholder="1"
                              fullWidth
                            />
                          </TableCell>

                          {/* Remove */}
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              onClick={() => removeDirectProductRow(row.id)}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>

          </Stack>

          {/* Item Price only – no cost/profit */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems="center"
            justifyContent="flex-end"
            sx={{ mt: 2, flexWrap: "wrap" }}
          >
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
            overflow: "hidden",
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
            overflowY: "auto",
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
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
              flexWrap="wrap"
            >
              <Typography fontWeight={700}>Ingredients</Typography>
              <Button
                size="small"
                onClick={() => {
                  // ensure at least one row shows immediately when adding
                  addIngredientRow();
                }}
                startIcon={<AddIcon />}
              >
                Add Ingredient
              </Button>
            </Stack>

            <TableContainer
              component={Paper}
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                overflow: "hidden",
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 220 }}>Inventory Category</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Inventory Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 160 }}>Qty</TableCell>
                    <TableCell sx={{ width: 48 }} />
                  </TableRow>
                </TableHead>

                <TableBody>
                  {itemIngredients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography variant="body2" color="text.secondary">
                          No ingredients yet. Click <strong>Add Ingredient</strong>.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    itemIngredients.map((row) => (
                      <TableRow key={row.id} hover>
                        {/* Category selector (NEW) */}
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <Select
                              value={row.category || ""}
                              displayEmpty
                              onChange={(e) => onSelectIngredientCategory(row.id, e.target.value)}
                              MenuProps={dropdownMenuProps}
                            >
                              <MenuItem value="">
                                <em>Select category</em>
                              </MenuItem>
                              {ingredientInvCategories.map((c) => (
                                <MenuItem key={c.id} value={c.name}>
                                  {c.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>

                        {/* Inventory Name */}
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <Select
                              value={row.ingredientId || ""}
                              displayEmpty
                              disabled={!row.category}
                              onChange={(e) => onSelectInventory(row.id, e.target.value)}
                              MenuProps={dropdownMenuProps}
                              sx={{
                                "& .MuiSelect-select": {
                                  display: "flex",
                                  alignItems: "center",
                                  py: 1.25,
                                },
                              }}
                              renderValue={(val) => {
                                if (!row.category) return <em>Select category first</em>;
                                if (!val) return <em>Select ingredient</em>;
                                const picked = inventory.find((x) => String(x.id) === String(val));
                                return picked ? renderRecipeIngOption(picked) : <em>Select ingredient</em>;
                              }}
                            >
                              <MenuItem value="">
                                <em>{row.category ? "Select ingredient" : "Select category first"}</em>
                              </MenuItem>

                              {inventory
                                .filter((x) => String(x.kind || "").toLowerCase() !== "product")
                                .filter((x) => String(x.category || "") === String(row.category || ""))
                                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                                .map((ing) => (
                                  <MenuItem key={ing.id} value={ing.id}>
                                    {renderRecipeIngOption(ing)}
                                  </MenuItem>
                                ))}
                            </Select>
                          </FormControl>
                        </TableCell>

                        {/* Qty */}
                        <TableCell>
                          <TextField
                            size="small"
                            value={row.qty || ""}
                            onChange={(e) => onRowChange(row.id, "qty", e.target.value)}
                            inputMode="numeric"
                            placeholder="0"
                            fullWidth
                            disabled={!row.ingredientId}
                          />
                        </TableCell>

                        {/* Remove */}
                        <TableCell align="right">
                          <Tooltip title="Remove ingredient">
                            <span>
                              <IconButton size="small" onClick={() => removeIngredientRow(row.id)}>
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
            
          </Stack>

          <Divider />

          {/* ✅ Direct Inventory Products */}
          <Stack spacing={2}>

            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography fontWeight={700}>Direct Inventory Products</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={addDirectProductRow}>
                  Add Product
                </Button>
              </Stack>

              <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 1, overflow: "hidden" }}>
                <Table size="small" sx={{ tableLayout: "fixed" }}>
                  <TableHead>
                    <TableRow>
                      <TableCell width="25%">Category</TableCell>
                      <TableCell width="45%">Product</TableCell>
                      <TableCell width="20%">Qty</TableCell>
                      <TableCell width={40} />
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {directProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography variant="body2" color="text.secondary">
                            No direct products added.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      directProducts.map((row) => (
                        <TableRow key={row.id}>
                          {/* Category */}
                          <TableCell>
                            <FormControl fullWidth size="small">
                              <Select
                                value={row.category || ""}
                                displayEmpty
                                onChange={(e) => onSelectDirectCategory(row.id, e.target.value)}
                                MenuProps={dropdownMenuProps}
                              >
                                <MenuItem value="">
                                  <em>Select category</em>
                                </MenuItem>
                                {productInvCategories.map((c) => (
                                  <MenuItem key={c.id} value={c.name}>
                                    {c.name}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>

                          {/* Product */}
                          <TableCell>
                            <FormControl fullWidth size="small">
                              <Select
                                value={row.inventoryIngredientId || ""}
                                displayEmpty
                                disabled={!row.category}
                                onChange={(e) => onSelectDirectProduct(row.id, e.target.value)}
                                MenuProps={dropdownMenuProps}
                                renderValue={(val) => {
                                  if (!row.category) return <em>Select category first</em>;
                                  if (!val) return <em>Select product</em>;
                                  const picked = inventoryProducts.find((p) => String(p.id) === String(val));
                                  return picked ? renderInvOption(picked) : <em>Select product</em>;
                                }}
                              >
                                <MenuItem value="">
                                  <em>{row.category ? "Select product" : "Select category first"}</em>
                                </MenuItem>
                                {inventoryProducts
                                  .filter((p) => p.category === row.category)
                                  .map((p) => (
                                    <MenuItem key={p.id} value={p.id}>
                                      {renderInvOption(p)}
                                    </MenuItem>
                                  ))}
                              </Select>
                            </FormControl>
                          </TableCell>

                          {/* Qty */}
                          <TableCell>
                            <TextField
                              size="small"
                              value={row.qty || ""}
                              onChange={(e) => onDirectQtyChange(row.id, e.target.value)}
                              disabled={!row.inventoryIngredientId}
                              inputMode="decimal"
                              placeholder="1"
                              fullWidth
                            />
                          </TableCell>

                          {/* Remove */}
                          <TableCell align="right">
                            <IconButton size="small" onClick={() => removeDirectProductRow(row.id)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          </Stack>

          {/* Item Price only – no cost/profit */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems="center"
            justifyContent="flex-end"
            sx={{ mt: 2, flexWrap: "wrap" }}
          >
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
                sx={{ width: 140 }}
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