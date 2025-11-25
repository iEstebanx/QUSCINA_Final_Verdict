// QUSCINA_BACKOFFICE/Frontend/src/pages/Inventory/InventoryPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Checkbox,
  ToggleButton, ToggleButtonGroup, FormHelperText,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import { useAlert } from "@/context/Snackbar/AlertContext";

/** Validation must mirror backend */
const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) => !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

const formatPhp = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatStockParts = (qty, unit) => {
  const n = Number(qty || 0);
  if (!Number.isFinite(n)) return { primary: "0", secondary: "" };

  // base numeric text
  const base = n.toLocaleString("en-PH", {
    maximumFractionDigits: unit === "pcs" || unit === "pack" ? 0 : 3,
  });

  // helper: primary unit label
  const unitSuffix =
    unit === "g"   ? "g"   :
    unit === "kg"  ? "kg"  :
    unit === "ml"  ? "mL"  :
    unit === "l"   ? "L"   :
    unit === "pcs" ? "pcs" :
    unit === "pack"? "pack" :
    "";

  // 👇 add a space between number and unit
  let primary = unitSuffix ? `${base} ${unitSuffix}` : base;

  // Nothing to convert if zero or negative
  if (n <= 0) return { primary, secondary: "" };

  // Small → big units (threshold 1000 concept)
  if (unit === "g") {
    const kg = n / 1000;
    return {
      primary,
      secondary: `${kg.toLocaleString("en-PH", {
        maximumFractionDigits: 3,
      })} kg`,              // 👈 space here too
    };
  }

  if (unit === "ml") {
    const L = n / 1000;
    return {
      primary,
      secondary: `${L.toLocaleString("en-PH", {
        maximumFractionDigits: 3,
      })} L`,
    };
  }

  // Big → small units
  if (unit === "kg") {
    const g = n * 1000;
    return {
      primary,
      secondary: `${g.toLocaleString("en-PH", {
        maximumFractionDigits: 0,
      })} g`,
    };
  }

  if (unit === "l") {
    const ml = n * 1000;
    return {
      primary,
      secondary: `${ml.toLocaleString("en-PH", {
        maximumFractionDigits: 0,
      })} mL`,
    };
  }

  // pcs / pack / others = no conversion
  return { primary, secondary: "" };
};

const formatStockInline = (qty, unit) => {
  const { primary, secondary } = formatStockParts(qty, unit);
  return secondary ? `${primary} (${secondary})` : primary;
};

const NOW = () => new Date().toISOString();
const todayDate = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const ING_API = "/api/inventory/ingredients";
const INV_ACTIVITY_API = "/api/inventory/inv-activity";
const INV_CATS_API = "/api/inventory/inv-categories";

// 🔹 Unit is fixed to PACK for everything
const DEFAULT_UNIT = "pack";

const UNIT_OPTIONS = [
  { value: DEFAULT_UNIT, label: "PACK" }, // fixed unit
];

const UNIT_LABEL_MAP = UNIT_OPTIONS.reduce((map, u) => {
  map[u.value] = u.label;
  return map;
}, {});

export default function InventoryPage() {
  const [query, setQuery] = useState("");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const [selected, setSelected] = useState([]); // For bulk selection

  const [ingredients, setIngredients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activity, setActivity] = useState([]);

  const [stockFilter, setStockFilter] = useState("all"); // "all" | "low" | "out"
  const [categoryFilter, setCategoryFilter] = useState("all");

  const alert = useAlert();

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ingredientToDelete, setIngredientToDelete] = useState(null);
  const [deleteCheckResult, setDeleteCheckResult] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const addTouchedRef = useRef(false);
  const stockTouchedRef = useRef(false);

  const markAddTouched = () => { if (!addTouchedRef.current) addTouchedRef.current = true; };
  const markStockTouched = () => { if (!stockTouchedRef.current) stockTouchedRef.current = true; };

  const handleStockClose = () => {
    if (stockFormChanged || stockTouchedRef.current) {
      setShowStockConfirm(true);   // ✅ show Cancel / Discard
    } else {
      setOpenStock(false);
      resetStockForm();
    }
  };

  // Load categories
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(INV_CATS_API, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
        const names = (data.categories ?? [])
          .map((c) => String(c?.name || "").trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        if (alive) setCategories(names);
      } catch (e) {
        console.error("[inv-categories] load failed:", e);
        if (alive) setCategories([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load ingredients — backend returns newest-first
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(ING_API, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);

        const list = (data.ingredients ?? []).map((x) => ({
          id: x.id,
          name: x.name || "",
          category: x.category,
          type: x.type,
          currentStock: Number(x.currentStock || 0),
          lowStock: Number(x.lowStock || 0),
          price: Number(x.price || 0),
          createdAt: x.createdAt || null,
          updatedAt: x.updatedAt || null,
        }));
        if (alive) setIngredients(list);
      } catch (e) {
        console.error("[ingredients] load failed:", e);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load inventory activity
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${INV_ACTIVITY_API}?limit=1000`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);

        const rows = (data.rows ?? []).map((r) => ({
          id: r.id,
          ts: r.ts,
          ingredientId: r.ingredientId || r.ingredient?.id || r.ingredientId,
          ingredientName: r.ingredientName || (r.ingredient && r.ingredient.name) || "",
          employee: r.employee || "Chef",
          reason: r.reason || "",
          io: r.io === "Out" ? "Out" : "In",
          qty: Number(r.qty || 0),
          price: Number(r.price || 0),
        }));
        if (alive) setActivity(rows);
      } catch (e) {
        console.error("[inv-activity] load failed:", e);
        if (alive) setActivity([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Search / filter
  const qLower = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    // text search first
    let filteredList = ingredients.filter((ing) => {
      if (!qLower) return true;
      return (
        ing.name.toLowerCase().includes(qLower) ||
        String(ing.category || "").toLowerCase().includes(qLower)
      );
    });

    // category filter
    if (categoryFilter !== "all") {
      filteredList = filteredList.filter(
        (ing) => String(ing.category || "") === categoryFilter
      );
    }

    // stock alert filter
    if (stockFilter === "low") {
      filteredList = filteredList.filter((ing) => {
        const low = Number(ing.lowStock || 0);
        const cur = Number(ing.currentStock || 0);
        if (low <= 0) return false;            // 0 = disabled threshold
        if (cur <= 0) return false;            // out-of-stock goes to "Out of stock"
        return cur <= low;                     // low but still > 0
      });
    } else if (stockFilter === "out") {
      filteredList = filteredList.filter(
        (ing) => Number(ing.currentStock || 0) <= 0
      );
    }

    // keep your “name match first” behaviour for search
    if (qLower) {
      return filteredList.sort((a, b) => {
        const aName = a.name.toLowerCase().includes(qLower);
        const bName = b.name.toLowerCase().includes(qLower);
        if (aName !== bName) return aName ? -1 : 1;
        return 0;
      });
    }
    return filteredList;
  }, [ingredients, qLower, stockFilter, categoryFilter]);

  useEffect(() => {
    setPageState((s) => ({ ...s, page: 0 }));
  }, [query, stockFilter, categoryFilter]);

  const paged = useMemo(() => {
    const start = pageState.page * pageState.rowsPerPage;
    return filtered.slice(start, start + pageState.rowsPerPage);
  }, [filtered, pageState]);

  // selection
  const allChecked = filtered.length > 0 && filtered.every((ing) => selected.includes(ing.id));
  const someChecked = filtered.some((ing) => selected.includes(ing.id)) && !allChecked;

  const toggleAll = () => {
    const ids = filtered.map((ing) => ing.id);
    const everyIncluded = ids.every((id) => selected.includes(id));
    setSelected((s) => (everyIncluded ? s.filter((id) => !ids.includes(id)) : Array.from(new Set([...s, ...ids]))));
  };

  const toggleOne = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  useEffect(() => {
    const validIds = new Set(ingredients.map((ing) => ing.id));
    setSelected((prev) => prev.filter((id) => validIds.has(id)));
  }, [ingredients]);

  // helpers
  const convertStockByUnitChange = (value, from, to) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    if (from === to) return n;

    // weight
    if (from === "g" && to === "kg") return n / 1000;
    if (from === "kg" && to === "g") return n * 1000;

    // volume
    if (from === "ml" && to === "l") return n / 1000;
    if (from === "l" && to === "ml") return n * 1000;

    // other combos (pcs, pack, etc) → no automatic conversion
    return n;
  };


  const lastActivity = (ingId, ioType) => {
    const rows = activity
      .filter((a) => a.ingredientId === ingId && a.io === ioType)
      .slice()
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    return rows[0] || null;
  };

  const formatShortDate = (iso) => {
    if (!iso) return "-";
    try {
      const dt = new Date(iso);
      return dt.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    } catch (e) {
      return "-";
    }
  };

  // Delete flow
  const handleDeleteClick = async (ingredient) => {
    setIngredientToDelete(ingredient);

    try {
      const res = await fetch(`${ING_API}/${ingredient.id}/usage`);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.ok && data.isUsed) {
        // Show Category-style blocked modal for SINGLE delete
        showBlockedModal({
          ingredientName: ingredient.name,
          countItems: Array.isArray(data.usedInItems) ? data.usedInItems.length : 0,
          countActivity: Number.isFinite(data.activityCount) ? data.activityCount : 0,
          sampleItems: Array.isArray(data.usedInItems) ? data.usedInItems.slice(0, 6) : [],
          message: "Cannot delete ingredient; item(s) are assigned to it.",
        });

        // Uncheck this one (same behavior you liked in Categories)
        setSelected((s) => s.filter((id) => id !== ingredient.id));
        return; // do not open the confirm dialog
      }

      // Not used → proceed to confirmation dialog
      setDeleteDialogOpen(true);
    } catch (e) {
      console.error("usage check error:", e);
      // If usage check fails, still allow confirmation (best effort)
      setDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!ingredientToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`${ING_API}/${ingredientToDelete.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setIngredients((prev) => prev.filter((ing) => ing.id !== ingredientToDelete.id));
        setSelected((prev) => prev.filter((id) => id !== ingredientToDelete.id));
        alert.success(`Ingredient "${ingredientToDelete.name}" deleted successfully`);
        setDeleteDialogOpen(false);
      } else {
        alert.error(data?.error || "Failed to delete ingredient");
      }
    } catch (e) {
      console.error("delete error:", e);
      alert.error("Failed to delete ingredient");
    } finally {
      setDeleting(false);
    }
  };

  // Blocked-delete modal (inventory)
  const [blockedDialog, setBlockedDialog] = useState({
    open: false,
    ingredientName: "",
    countItems: 0,
    countActivity: 0,
    sampleItems: [],
    message: "",
  });

  function showBlockedModal(payload = {}) {
    const {
      ingredientName = "",
      countItems = 0,
      countActivity = 0,
      sampleItems = [],
      message = "",
    } = payload || {};
    setBlockedDialog({
      open: true,
      ingredientName,
      countItems: Number.isFinite(countItems) ? countItems : 0,
      countActivity: Number.isFinite(countActivity) ? countActivity : 0,
      sampleItems: Array.isArray(sampleItems) ? sampleItems.slice(0, 6) : [],
      message: String(message || ""),
    });
  }

  const handleBulkDelete = async () => {
    if (!selected.length) return;

    try {
      const res = await fetch(ING_API, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok !== true) {
        alert.error(data?.error || `Delete failed (HTTP ${res.status})`);
        return;
      }

      // Refresh list minimalistically
      try {
        const r = await fetch(ING_API, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.ok) {
          const list = (j.ingredients ?? []).map((x) => ({
            id: x.id,
            name: x.name || "",
            category: x.category || "Uncategorized",
            type: x.type || "",
            currentStock: Number(x.currentStock || 0),
            lowStock: Number(x.lowStock || 0),
            price: Number(x.price || 0),
          }));
          setIngredients(list);
        }
      } catch {}

      // Build helpful dialog summarizing blocked ones
      const blocked = Array.isArray(data.blocked) ? data.blocked : [];
      const deleted = Number(data.deleted || 0);

      if (deleted) {
        alert.success(`Deleted ${deleted} ingredient${deleted > 1 ? "s" : ""}`);
      }

      if (blocked.length) {
        const namesById = new Map(ingredients.map((i) => [String(i.id), i.name]));
        if (blocked.length === 1) {
          const b = blocked[0];
          const name = namesById.get(String(b.id)) || "This ingredient";
          const message =
            b.reason === "activity-linked"
              ? `Cannot delete ingredient; ${b.count} activity record(s) are linked to it.`
              : `Cannot delete ingredient; it is currently used in menu item(s).`;
          showBlockedModal({
            ingredientName: name,
            countItems: b.reason === "item-linked" ? (Number(b.count) || 0) : 0,
            countActivity: b.reason === "activity-linked" ? (Number(b.count) || 0) : 0,
            sampleItems: Array.isArray(b.sample) ? b.sample : [],
            message,
          });
        } else {
          // Multiple blocked → compact summary
          const preview = blocked
            .slice(0, 5)
            .map((b) => namesById.get(String(b.id)) || `#${b.id}`)
            .join(", ");
          const more = blocked.length > 5 ? ` and ${blocked.length - 5} more` : "";
          showBlockedModal({
            ingredientName: "",
            message: `Some ingredients were not deleted because they are still linked: ${preview}${more}.`,
          });
        }
      }

      // Keep only still-selected those that remained blocked (uncheck deleted)
      const blockedIds = new Set(blocked.map((b) => String(b.id)));
      setSelected([]);
    } catch (e) {
      console.error("[ingredients] bulk delete error:", e);
      alert.error(e?.message || "Bulk delete failed");
    }
  };

  // Add Ingredient dialog
  const [openAdd, setOpenAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newUnit, setNewUnit] = useState(DEFAULT_UNIT);
  const [addFormChanged, setAddFormChanged] = useState(false);
  const [showAddConfirm, setShowAddConfirm] = useState(false);

  const handleAddFormChange = () => { if (!addFormChanged) setAddFormChanged(true); };
  const resetAddForm = () => {
    setNewName("");
    setNewCat("");
    setNewUnit(DEFAULT_UNIT);
    setAddFormChanged(false);
    setShowAddConfirm(false);
  };
  const handleAddClose = () => {
    (addFormChanged || addTouchedRef.current)
      ? setShowAddConfirm(true)
      : (setOpenAdd(false), resetAddForm());
  };
  const handleAddConfirmClose = () => { setOpenAdd(false); resetAddForm(); };
  const handleAddCancelClose = () => setShowAddConfirm(false);

  const handleAddIngredient = async () => {
    const name = normalize(newName);
    const category = normalize(newCat);
    const unit = DEFAULT_UNIT;

    if (!category) { alert.error("Please select a category."); return; }
    if (!unit) { alert.error("Please select a unit."); return; }

    if (!isValidName(name)) {
      alert.error("Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).");
      return;
    }

    try {
      const res = await fetch(ING_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, type: unit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);

      const id = data.id || `ing-${Date.now()}`;
      setIngredients((list) => [
        {
          id,
          name,
          category,
          type: unit,
          currentStock: 0,
          lowStock: 0,
          price: 0,
          createdAt: NOW(),
          updatedAt: NOW(),
        },
        ...list,
      ]);

      resetAddForm();
      setOpenAdd(false);
      alert.success("Ingredient added");
    } catch (e) {
      console.error("[ingredients] create failed:", e);
      alert.error(e?.message || "Create failed");
    }
  };

  // Stock In/Out
  const [openStock, setOpenStock] = useState(false);
  const [stockForm, setStockForm] = useState({
    ingId: "", name: "", cat: "", type: DEFAULT_UNIT, direction: "IN", qty: "",
    current: 0, low: "", price: "", date: todayDate(), reason: "",
  });
  const [initialStockForm, setInitialStockForm] = useState(null);
  const [stockFormChanged, setStockFormChanged] = useState(false);
  const [showStockConfirm, setShowStockConfirm] = useState(false);

  const canSave = useMemo(() => {
    if (!stockForm.ingId || !stockForm.cat || !stockForm.type) return false;

    const wantsRename = normalize(stockForm.name) !== normalize(initialStockForm?.name || "");
    if (wantsRename && !isValidName(normalize(stockForm.name))) return false;

    const qtyStr = String(stockForm.qty ?? "").trim();
    const hasQty = qtyStr !== "" && !Number.isNaN(Number(qtyStr));
    const qn = hasQty ? Number(qtyStr) : 0;

    if (hasQty) {
      if (qn <= 0) return false;
      if (stockForm.direction === "OUT" && qn > Number(stockForm.current || 0)) return false;
      return true; // movement OK
    }

    if (!initialStockForm) return false;
    const catChanged   = stockForm.cat   !== initialStockForm.cat;
    const typeChanged  = stockForm.type  !== initialStockForm.type;
    const priceChanged = String(stockForm.price ?? "") !== String(initialStockForm.price ?? "");

    return catChanged || typeChanged || priceChanged || wantsRename;
  }, [stockForm, initialStockForm]);

  const handleStockFormChange = (newForm) => {
    if (!stockFormChanged && initialStockForm) {
      const hasChanges = JSON.stringify(newForm) !== JSON.stringify(initialStockForm);
      if (hasChanges) setStockFormChanged(true);
    }
  };

  const resetStockForm = () => {
    setStockForm({
      ingId: "",
      cat: "",
      type: DEFAULT_UNIT,
      direction: "IN",
      qty: "",
      current: 0,
      low: "",
      price: "",
      date: todayDate(),
      reason: "",
    });
    setInitialStockForm(null);
    setStockFormChanged(false);
    setShowStockConfirm(false);
  };

  const dropdownMenuProps = {
    MenuListProps: { disablePadding: true },

    PaperProps: {
      className: "scroll-x",
      sx: (theme) => ({
        maxHeight: 320,

        // kill extra List padding just in case
        "& .MuiList-root": { py: 0 },

        // full-bleed highlight while keeping text inset
        "& .MuiMenuItem-root": {
          px: 1.5,                // keep your text indent
          mx: -1.5,               // bleed background to the paper edges
          borderRadius: 0,        // ensure highlight hits the edge cleanly
        },

        // make the header item behave the same
        "& .MuiMenuItem-root.Mui-disabled": {
          px: 1.5,
          mx: -1.5,
          opacity: 1,
          color: "text.secondary",
          fontStyle: "italic",
        },
      }),
    },
  };

  const openStockDialog = () => {
    const initialForm = {
      ingId: "", name: "", cat: "", type: DEFAULT_UNIT, direction: "IN", qty: "",
      current: 0, low: "", price: "", cost: 0, date: todayDate(), reason: "",
    };
    setStockForm(initialForm);
    setInitialStockForm(initialForm);
    setStockFormChanged(false);
    setShowStockConfirm(false);
    stockTouchedRef.current = false;
    setOpenStock(true);
  };

  const onPickIngredient = (id) => {
    const ing = ingredients.find((i) => i.id === id);
    const type = ing?.type || DEFAULT_UNIT;
    const newForm = {
      ...stockForm,
      ingId: id,
      name: ing?.name || "",
      cat: ing?.category || "",
      type,
      current: ing?.currentStock || 0,
      price: ing?.price || "",
      low: ing?.lowStock ?? "",
    };
    setStockForm(newForm);
    setInitialStockForm(newForm);
    setStockFormChanged(false);
  };

  const handleRowClick = (ing) => {
    const newForm = {
      ingId: ing.id,
      name: ing.name || "",
      cat: ing.category || "",
      type: ing.type || "",
      direction: "IN",
      qty: "",
      current: ing.currentStock || 0,
      low: ing.lowStock || "",
      price: ing.price || "",
      cost: 0,
      date: todayDate(),
      reason: "",
    };
    setStockForm(newForm);
    setInitialStockForm(newForm);
    setStockFormChanged(false);
    setShowStockConfirm(false);
    stockTouchedRef.current = false;
    setOpenStock(true);
  };

  const moveIdToFront = (arr, id) => {
    const idx = arr.findIndex((x) => x.id === id);
    if (idx < 0) return arr;
    const item = arr[idx];
    return [item, ...arr.slice(0, idx), ...arr.slice(idx + 1)];
  };

  const handleStockSave = async () => {
    try {
      const io = stockForm.direction === "IN" ? "In" : "Out";
      const picked = ingredients.find((i) => i.id === stockForm.ingId);
      if (!picked) return;

      // allow edit-only: qty blank or <= 0
      const qtyStr = String(stockForm.qty ?? "").trim();
      const hasQty = qtyStr !== "" && !Number.isNaN(Number(qtyStr));
      const qty = hasQty ? Number(qtyStr) : 0;

      if (!stockForm.cat) {
        alert.error("Please select a category.");
        return;
      }

      const wantsRename =
        normalize(stockForm.name) !== normalize(picked.name);
      if (wantsRename && !isValidName(normalize(stockForm.name))) {
        alert.error("Invalid name format.");
        return;
      }

      /* ================================
         EDIT-ONLY MODE (NO MOVEMENT)
         ================================ */
      if (!hasQty || qty <= 0) {
        // Only unit conversion + optional rename/price change
        let newCurrent = picked.currentStock || 0;

        const unitChanged = stockForm.type !== picked.type;
        if (unitChanged) {
          newCurrent = convertStockByUnitChange(
            newCurrent,
            picked.type,
            stockForm.type
          );
        }

        const patchBody = {
          category: stockForm.cat,
          type: stockForm.type,
          currentStock: newCurrent,
          ...(wantsRename ? { name: normalize(stockForm.name) } : {}),
        };

        // Optional: allow manual price edit in edit-only mode
        let nextPrice = picked.price;
        if (
          stockForm.price !== "" &&
          !Number.isNaN(Number(stockForm.price))
        ) {
          const priceNum = Number(stockForm.price);
          patchBody.price = priceNum;
          nextPrice = priceNum;
        }

        const r = await fetch(`${ING_API}/${picked.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.ok !== true) {
          if (r.status === 409 && j?.code === "name_taken") {
            alert.error(j.error || "Name already exists.");
            return;
          }
          throw new Error(j?.error || `HTTP ${r.status}`);
        }

        // reflect in UI (NO movement, but maybe unit/price changed)
        setIngredients((arr) => {
          const next = arr.map((i) =>
            i.id === picked.id
              ? {
                  ...i,
                  name: wantsRename ? normalize(stockForm.name) : i.name,
                  currentStock: newCurrent,
                  price: nextPrice,
                  category: stockForm.cat,
                  type: stockForm.type,
                  updatedAt: NOW(),
                }
              : i
          );
          return moveIdToFront(next, picked.id);
        });
        setPageState((s) => ({ ...s, page: 0 }));

        setOpenStock(false);
        resetStockForm();
        alert.success("Details updated");
        return;
      }

      /* ================================
         MOVEMENT PATH (HAS QTY)
         ================================ */

      if (io === "Out" && qty > (picked.currentStock || 0)) {
        alert.error("You cannot stock out more than the current stock.");
        return;
      }

      // price rules:
      // - IN: use total entered price, convert to per-unit
      // - OUT: keep activity’s price informative by falling back to current price when blank
      const totalEntered = Number(stockForm.price || 0);
      let price = 0; // per-unit price

      if (io === "In") {
        price = qty > 0 ? totalEntered / qty : 0;
      } else {
        price = Number(
          (stockForm.price !== "" ? stockForm.price : picked.price) || 0
        );
      }

      // 1) Create activity
      const res = await fetch(INV_ACTIVITY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee: "Chef",
          reason: stockForm.reason || (io === "In" ? "Stock In" : "Stock Out"),
          io,
          qty,
          price, // per-unit price
          ingredientId: picked.id,
          ingredientName: wantsRename
            ? normalize(stockForm.name)
            : picked.name,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true)
        throw new Error(data?.error || `HTTP ${res.status}`);

      // 2) Update activity list
      const r = data.row || {};
      setActivity((a) => [
        {
          id: data.id || r.id || `a-${Date.now()}`,
          ts: r.ts || NOW(),
          ingredientId: r.ingredientId || picked.id,
          ingredientName: r.ingredientName || picked.name,
          employee: r.employee || "Chef",
          reason: r.reason || (io === "In" ? "Stock In" : "Stock Out"),
          io,
          qty,
          price,
        },
        ...a,
      ]);

      // 3) Update ingredient locally (currentStock + maybe price on IN)
      const newCurrent = Math.max(
        0,
        (picked.currentStock || 0) + (io === "In" ? qty : -qty)
      );

      setIngredients((arr) => {
        const next = arr.map((i) =>
          i.id === picked.id
            ? {
                ...i,
                name: wantsRename ? normalize(stockForm.name) : i.name,
                currentStock: newCurrent,
                price: io === "In" ? price : i.price, // keep existing price on OUT
                category: stockForm.cat,
                type: stockForm.type,
                updatedAt: NOW(),
              }
            : i
        );
        return moveIdToFront(next, picked.id);
      });
      setPageState((s) => ({ ...s, page: 0 }));

      // 4) Persist via PATCH in background
      const patchBody = {
        category: stockForm.cat,
        type: stockForm.type,
        currentStock: newCurrent,
        ...(wantsRename ? { name: normalize(stockForm.name) } : {}),
      };

      if (io === "In" && !Number.isNaN(price)) {
        patchBody.price = price;
      }

      (async () => {
        try {
          const pr = await fetch(`${ING_API}/${picked.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody),
          });
          const pj = await pr.json().catch(() => ({}));
          if (!pr.ok || pj?.ok !== true) {
            if (pr.status === 409 && pj?.code === "name_taken") {
              alert.error(pj.error || "Name already exists.");
              // rollback rename (keep stock change)
              setIngredients((arr) =>
                arr.map((i) =>
                  i.id === picked.id ? { ...i, name: picked.name } : i
                )
              );
              return;
            }
          }
        } catch {
          // ignore background error, UI already optimistic
        }
      })();

      setOpenStock(false);
      resetStockForm();
      alert.success("Stock updated");
    } catch (e) {
      console.error("[inv-activity] save failed:", e);
      alert.error(e?.message || "Save failed");
    }
  };

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
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
                onClick={() => {
                  resetAddForm();
                  addTouchedRef.current = false;
                  setOpenAdd(true);
                }}
                sx={{ flexShrink: 0 }}
              >
                Add Ingredient
              </Button>

              <Box sx={{ flexGrow: 1, minWidth: 0 }} />

              <Tooltip
                title={
                  selected.length
                    ? `Delete ${selected.length} selected ingredient${selected.length > 1 ? "s" : ""}`
                    : "Select ingredients to delete"
                }
              >
                <span>
                  <IconButton
                    aria-label="Delete selected"
                    onClick={handleBulkDelete}
                    disabled={!selected.length}
                    sx={{ flexShrink: 0, mr: 1 }}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </span>
              </Tooltip>

              <TextField
                size="small"
                placeholder="Search ingredient or category"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                sx={{
                  flexGrow: 1,
                  minWidth: 220,
                  maxWidth: 420, // optional
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <FormControl size="small" sx={{ minWidth: 160, flexShrink: 0 }}>
                <InputLabel id="inv-cat-filter-label">Category</InputLabel>
                <Select
                  labelId="inv-cat-filter-label"
                  id="inv-cat-filter"
                  value={categoryFilter}
                  label="Category"
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  MenuProps={dropdownMenuProps}
                >
                  <MenuItem value="all">All</MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 140, flexShrink: 0 }}>
                <InputLabel id="stock-alert-label">Stock alert</InputLabel>
                <Select
                  labelId="stock-alert-label"
                  id="stock-alert"
                  value={stockFilter}
                  label="Stock alert"
                  onChange={(e) => setStockFilter(e.target.value)}
                >
                  <MenuItem value="all">All items</MenuItem>
                  <MenuItem value="low">Low stock</MenuItem>
                  <MenuItem value="out">Out of stock</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Box>

        <Divider />

        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer component={Paper} elevation={0} className="scroll-x" sx={{ width: "100%", maxWidth: "100%" }}>
            <Table stickyHeader sx={{ tableLayout: "fixed", minWidth: 700 }}>
              <colgroup>
                <col style={{ width: 50 }} />   {/* checkbox */}
                <col style={{ width: 200 }} />  {/* Ingredient Name */}
                <col style={{ width: 170 }} />  {/* Categories */}
                <col style={{ width: 110 }} />  {/* Unit */}
                <col style={{ width: 140 }} />  {/* Current Stock */}
                <col style={{ width: 150 }} />  {/* Per Price */}
                <col style={{ width: 80 }} />   {/* Actions */}
              </colgroup>

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
                  <TableCell>
                    <Typography fontWeight={600}>Ingredient Name</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Categories</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Unit</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Current Stock</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Per Price</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Actions</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {paged.map((ing) => {
                  return (
                    <TableRow key={ing.id} hover sx={{ cursor: "pointer" }}>
                      <TableCell
                        padding="checkbox"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selected.includes(ing.id)}
                          onChange={() => toggleOne(ing.id)}
                        />
                      </TableCell>

                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography fontWeight={600}>{ing.name}</Typography>
                      </TableCell>

                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography>{ing.category}</Typography>
                      </TableCell>

                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography>{UNIT_LABEL_MAP[ing.type] || ing.type}</Typography>
                      </TableCell>

                      <TableCell onClick={() => handleRowClick(ing)}>
                        {(() => {
                          const { primary, secondary } = formatStockParts(
                            ing.currentStock,
                            ing.type
                          );
                          return (
                            <>
                              <Typography component="span" fontWeight={700}>
                                {primary}
                              </Typography>
                              {secondary && (
                                <Typography
                                  component="span"
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ ml: 0.5 }}
                                >
                                  ({secondary})
                                </Typography>
                              )}
                            </>
                          );
                        })()}
                      </TableCell>

                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography>{formatPhp(ing.price)}</Typography>
                      </TableCell>

                      <TableCell>
                        <Tooltip title="Delete ingredient">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(ing);
                            }}
                            color="error"
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No records found.
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
            count={filtered.length}
            page={pageState.page}
            onPageChange={(_, p) => setPageState((s) => ({ ...s, page: p }))}
            rowsPerPage={pageState.rowsPerPage}
            onRowsPerPageChange={(e) => setPageState({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })}
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" fontWeight={600}>Delete Ingredient</Typography>
        </DialogTitle>
        <DialogContent>
          {deleteCheckResult?.isUsed ? (
            <Box>
              <Typography color="error" gutterBottom>
                Cannot delete "{ingredientToDelete?.name}"
              </Typography>
              <Typography variant="body2" gutterBottom>
                This ingredient is currently used in the following menu items:
              </Typography>
              <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                {deleteCheckResult.usedInItems.map((itemName, index) => (
                  <Typography component="li" key={index} variant="body2">{itemName}</Typography>
                ))}
                {deleteCheckResult.usedInItems.length >= 5 && (
                  <Typography component="li" variant="body2" fontStyle="italic">...and more</Typography>
                )}
              </Box>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Please remove this ingredient from all menu items before deleting it.
              </Typography>
            </Box>
          ) : (
            <Box>
              <Typography gutterBottom>
                Are you sure you want to delete "{ingredientToDelete?.name}"?
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This action cannot be undone. All stock data for this ingredient will be permanently removed.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            {deleteCheckResult?.isUsed ? "Close" : "Cancel"}
          </Button>
          {!deleteCheckResult?.isUsed && (
            <Button onClick={handleConfirmDelete} color="error" variant="contained" disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add Ingredient Dialog */}
      <Dialog open={openAdd} onClose={handleAddClose} maxWidth="xs" fullWidth>
        <DialogTitle component="div">
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>Add Ingredient</Typography>
          </Stack>
        </DialogTitle>
        <Divider />
          <DialogContent
            onInputCapture={markAddTouched}     // ✅ any keystroke
            onChangeCapture={markAddTouched}    // ✅ any select/switch/file change
          >
          <Stack spacing={2} mt={1}>
            <TextField
              label="Name"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); handleAddFormChange(); }}
              autoFocus
              fullWidth
              error={newName.trim().length > 0 && !isValidName(normalize(newName))}
              helperText={
                newName
                  ? `${normalize(newName).length}/${NAME_MAX}${!isValidName(normalize(newName)) ? " • Allowed: letters, numbers, spaces, - ' & . , ( ) /" : ""}`
                  : `Max ${NAME_MAX} chars`
              }
            />

            <FormControl fullWidth required error={addFormChanged && !normalize(newCat)}>
              <InputLabel id="cat-label">Categories</InputLabel>
              <Select
                labelId="cat-label"
                label="Categories"
                value={newCat}
                onChange={(e) => { setNewCat(e.target.value); handleAddFormChange(); }}
                MenuProps={dropdownMenuProps}
              >
                <MenuItem value="" disabled>
                  <em>Select a category</em>
                </MenuItem>
                {categories.map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={handleAddClose}>CANCEL</Button>
          <Button
            variant="contained"
            onClick={handleAddIngredient}
            disabled={
              !normalize(newName) ||
              !isValidName(normalize(newName)) ||
              !normalize(newCat)
            }
          >
            ADD
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Discard Dialog for Add Ingredient */}
      <Dialog open={showAddConfirm} onClose={handleAddCancelClose} maxWidth="xs" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" fontWeight={600}>Discard Changes?</Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>You have unsaved changes. Are you sure you want to discard them?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={handleAddCancelClose}>CANCEL</Button>
          <Button variant="contained" color="error" onClick={handleAddConfirmClose}>DISCARD</Button>
        </DialogActions>
      </Dialog>

      {/* Stock In/Out Dialog */}
      <Dialog open={openStock} onClose={handleStockClose} maxWidth="md" fullWidth>
        <DialogTitle component="div">
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              {stockForm.direction === "IN" ? "Inventory — Stock In" : "Inventory — Stock Out"}
            </Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent
          onInputCapture={markStockTouched}     // ✅
          onChangeCapture={markStockTouched}    // ✅
        >
          <Stack spacing={2}>
            {/* Direction toggle */}
            <ToggleButtonGroup
              value={stockForm.direction}
              exclusive
              onChange={(_, v) => {
                if (!v) return;
                const newForm = { ...stockForm, direction: v };
                setStockForm(newForm);
                handleStockFormChange(newForm);
              }}
              color={stockForm.direction === "IN" ? "success" : "error"}
              size="small"
              sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
            >
              <ToggleButton value="IN">Stock In</ToggleButton>
              <ToggleButton value="OUT">Stock Out</ToggleButton>
            </ToggleButtonGroup>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="name-label">Name</InputLabel>
                <Select
                  labelId="name-label"
                  label="Name"
                  value={stockForm.ingId ?? ""}
                  onChange={(e) => onPickIngredient(e.target.value)}
                  MenuProps={dropdownMenuProps}
                >
                  {ingredients.map((i) => (
                    <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth required error={stockTouchedRef.current && !stockForm.cat}>
                <InputLabel id="cat2-label">Categories</InputLabel>
                <Select
                  labelId="cat2-label"
                  label="Categories"
                  value={stockForm.cat ?? ""}
                  onChange={(e) => {
                    const newForm = { ...stockForm, cat: e.target.value ?? "" };
                    setStockForm(newForm);
                    handleStockFormChange(newForm);
                  }}
                  MenuProps={dropdownMenuProps}
                >
                  <MenuItem value="" disabled>
                    <em>Select a category</em>
                  </MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
                {stockTouchedRef.current && !stockForm.cat && (
                  <FormHelperText>Category is required</FormHelperText>
                )}
              </FormControl>
            </Stack>
            
            {/* Row 2 — Rename, Quantity, Current, Low */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Rename (optional)"
                value={stockForm.name ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const newForm = { ...stockForm, name: v };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }}
                disabled={!stockForm.ingId}
                error={
                  Boolean(stockForm.ingId) &&
                  stockForm.name.trim().length > 0 &&
                  !isValidName(normalize(stockForm.name))
                }
                helperText={
                  !stockForm.ingId
                    ? "Pick an ingredient to rename"
                    : stockForm.name
                    ? `${normalize(stockForm.name).length}/${NAME_MAX}${
                        !isValidName(normalize(stockForm.name))
                          ? " • Allowed: letters, numbers, spaces, - ' & . , ( ) /"
                          : ""
                      }`
                    : "Leave blank to keep current name"
                }
              />

              <TextField
                label="Quantity"
                value={stockForm.qty ?? ""}
                onChange={(e) => {
                  let v = String(e.target.value ?? "");
                  v = v.replace(/[^0-9.]/g, "");
                  const parts = v.split(".");
                  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
                  const newForm = { ...stockForm, qty: v };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }}
                inputMode="decimal"
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Typography variant="body2" color={stockForm.direction === "IN" ? "success.main" : "error.main"}>
                        {stockForm.direction === "IN" ? "+" : "−"}
                      </Typography>
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Typography variant="body2" color="text.secondary">
                        {UNIT_LABEL_MAP[stockForm.type] || stockForm.type}
                      </Typography>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Current Stock"
                value={formatStockInline(stockForm.current, stockForm.type)}
                InputProps={{ readOnly: true }}
                fullWidth
              />
              <TextField
                label="Low Stock"
                value={stockForm.low ?? ""}
                fullWidth
                InputProps={{ readOnly: true }}
                helperText="Configured in Settings → Inventory"
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Reason"
                value={stockForm.reason ?? ""}
                onChange={(e) => {
                  const newForm = { ...stockForm, reason: e.target.value };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }}
                fullWidth
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Item Price"
                value={stockForm.price ?? ""}
                onChange={(e) => {
                  const price = e.target.value.replace(/[^0-9.]/g, "");
                  const newForm = { ...stockForm, price };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Typography
                        variant="body2"
                        color={stockForm.direction === "OUT" ? "text.disabled" : "text.primary"}
                      >
                        ₱
                      </Typography>
                    </InputAdornment>
                  ),
                }}
                inputMode="decimal"
                fullWidth
                disabled={stockForm.direction === "OUT"}
                helperText={
                  stockForm.direction === "OUT"
                    ? "Not required for Stock Out"
                    : stockForm.qty
                    ? "Per-item price will use (Item Price ÷ Quantity)"
                    : ""
                }
              />

              <TextField
                label="Date"
                type="date"
                value={stockForm.date}
                fullWidth
                InputLabelProps={{ shrink: true }}
                InputProps={{ readOnly: true }}
                disabled
              />
            </Stack>

          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" onClick={handleStockClose}>CANCEL</Button>
          <Button variant="contained" onClick={handleStockSave} disabled={!canSave}>
            SAVE
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Discard Dialog for Stock In/Out */}
      <Dialog open={showStockConfirm} onClose={() => setShowStockConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" fontWeight={600}>Discard Changes?</Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>You have unsaved changes. Are you sure you want to discard them?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setShowStockConfirm(false)}>CANCEL</Button>
          <Button variant="contained" color="error" onClick={() => { setOpenStock(false); resetStockForm(); }}>DISCARD</Button>
        </DialogActions>
      </Dialog>


      {/* Blocked Delete Dialog — match Category dialog exactly */}
      <Dialog
        open={blockedDialog.open}
        onClose={() => setBlockedDialog((d) => ({ ...d, open: false }))}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle component="div" sx={{ pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            {blockedDialog.ingredientName ? "Cannot Delete Ingredient" : "Cannot Delete Ingredients"}
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ pt: 0 }}>
          {/* Top sentence (same tone as Category dialog) */}
          {blockedDialog.ingredientName ? (
            <Typography sx={{ mb: 1.5 }}>
              <strong>{blockedDialog.ingredientName}</strong> is currently in use and can’t be deleted.
            </Typography>
          ) : (
            <Typography sx={{ mb: 1.5 }}>
              Some selected ingredients are currently in use and can’t be deleted.
            </Typography>
          )}

          {/* Linked counts (same label style: "Linked items: X") */}
          {(blockedDialog.countItems > 0 || blockedDialog.countActivity > 0) && (
            <Box sx={{ mb: 1 }}>
              {blockedDialog.countItems > 0 && (
                <Typography variant="body2" sx={{ mb: 0.25 }}>
                  <strong>Linked items:</strong> {blockedDialog.countItems}
                </Typography>
              )}
              {blockedDialog.countActivity > 0 && (
                <Typography variant="body2" sx={{ mb: 0.25 }}>
                  <strong>Linked activity records:</strong> {blockedDialog.countActivity}
                </Typography>
              )}
            </Box>
          )}

          {/* Recent items list (same wording) */}
          {blockedDialog.sampleItems?.length > 0 && (
            <>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Recent items using this ingredient:
              </Typography>
              <Box component="ul" sx={{ pl: 3, mt: 0, mb: 1.5 }}>
                {blockedDialog.sampleItems.map((t, i) => (
                  <li key={`${t}-${i}`}>
                    <Typography variant="body2">{t}</Typography>
                  </li>
                ))}
              </Box>
            </>
          )}

          {/* Short reason line like the Category dialog */}
          {blockedDialog.message && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, whiteSpace: "pre-wrap" }}>
              {blockedDialog.message}
            </Typography>
          )}

          {/* Footer tip (identical wording pattern) */}
          <Typography variant="body2" color="text.secondary">
            To delete this {blockedDialog.ingredientName ? "ingredient" : "ingredient(s)"},
            remove it from all menu items and/or clear related activity records.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ pr: 2.5, pb: 2.25 }}>
          <Button
            onClick={() => setBlockedDialog((d) => ({ ...d, open: false }))}
            variant="contained"
            sx={{ borderRadius: 2 }}
            autoFocus
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}