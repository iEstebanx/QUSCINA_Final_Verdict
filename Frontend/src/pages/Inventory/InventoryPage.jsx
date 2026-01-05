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
  ToggleButton,
  ToggleButtonGroup,
  FormHelperText,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { alpha } from "@mui/material/styles";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SearchIcon from "@mui/icons-material/Search";
import { useAlert } from "@/context/Snackbar/AlertContext";
import { useSearchParams } from "react-router-dom";


/** Validation must mirror backend */
const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);

const formatStockParts = (qty, unit) => {
  const n = Number(qty || 0);
  if (!Number.isFinite(n)) return { primary: "0", secondary: "" };

  const base = n.toLocaleString("en-PH", {
    maximumFractionDigits: unit === "pcs" || unit === "pack" ? 0 : 3,
  });

  const unitSuffix =
    unit === "g"
      ? "g"
      : unit === "kg"
      ? "kg"
      : unit === "ml"
      ? "mL"
      : unit === "l"
      ? "L"
      : unit === "pcs"
      ? "pcs"
      : unit === "pack"
      ? "pack"
      : "";

  let primary = unitSuffix ? `${base} ${unitSuffix}` : base;

  if (n <= 0) return { primary, secondary: "" };

  if (unit === "g") {
    const kg = n / 1000;
    return {
      primary,
      secondary: `${kg.toLocaleString("en-PH", {
        maximumFractionDigits: 3,
      })} kg`,
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

  return { primary, secondary: "" };
};

const formatStockInline = (qty, unit) => {
  const { primary, secondary } = formatStockParts(qty, unit);
  return secondary ? `${primary} (${secondary})` : primary;
};

const KIND_OPTIONS = [
  { value: "ingredient", label: "INGREDIENT" },
  { value: "product", label: "PRODUCT" },
];

const KIND_LABEL_MAP = KIND_OPTIONS.reduce((m, k) => {
  m[k.value] = k.label;
  return m;
}, {});

const NOW = () => new Date().toISOString();

const ING_API = "/api/inventory/ingredients";
const INV_ACTIVITY_API = "/api/inventory/inv-activity";
const INV_CATS_API = "/api/inventory/inv-categories";

// 🔹 Unit is fixed to PACK/PCS for everything
const DEFAULT_UNIT = "pack";

const UNIT_OPTIONS = [
  { value: "pack", label: "PACK" },
  { value: "pcs", label: "PCS" },
];

const UNIT_LABEL_MAP = UNIT_OPTIONS.reduce((map, u) => {
  map[u.value] = u.label;
  return map;
}, {});

const parseLowStock = (val) => {
  const trimmed = String(val ?? "").trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

const REASON_TYPE_OPTIONS = [
  // BOTH (can increase or decrease based on counting)
  {
    value: "inventory_count",
    label: "Inventory Count",
    defaultReason: "Inventory count adjustment",
    dirs: ["IN", "OUT"],
  },

  // OUT-only
  {
    value: "production_use",
    label: "Production Use",
    defaultReason: "Used in production",
    dirs: ["OUT"],
  },
  {
    value: "damage",
    label: "Damage",
    defaultReason: "Damaged items",
    dirs: ["OUT"],
  },
  {
    value: "loss",
    label: "Loss / Missing",
    defaultReason: "Lost / missing stock",
    dirs: ["OUT"],
  },
  {
    value: "expired",
    label: "Expired",
    defaultReason: "Expired stock",
    dirs: ["OUT"],
  },

  // always available
  { value: "other", label: "Other", defaultReason: "", dirs: ["IN", "OUT"] },
];

const REASON_TYPE_LABEL = REASON_TYPE_OPTIONS.reduce((m, x) => {
  m[x.value] = x.label;
  return m;
}, {});

const getReasonOptionsFor = (direction) =>
  REASON_TYPE_OPTIONS.filter((x) =>
    (x.dirs || ["IN", "OUT"]).includes(direction)
  );

export default function InventoryPage() {
  const [query, setQuery] = useState("");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const [selected, setSelected] = useState([]); // For bulk selection

  const [ingredients, setIngredients] = useState([]);
  const [categories, setCategories] = useState([]);

  const [searchParams, setSearchParams] = useSearchParams();
  
  const [activity, setActivity] = useState([]);

  const [stockFilter, setStockFilter] = useState("all"); // "all" | "low" | "out"
  const [categoryFilter, setCategoryFilter] = useState("all");

  const alert = useAlert();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ingredientToDelete, setIngredientToDelete] = useState(null);
  const [deleteCheckResult, setDeleteCheckResult] = useState(null); // still here for legacy dialog, but we mainly use blocked modal now
  const [deleting, setDeleting] = useState(false);

  const [kindFilter, setKindFilter] = useState("all");
  const [newKind, setNewKind] = useState("ingredient");

  const addTouchedRef = useRef(false);

  const markAddTouched = () => {
    if (!addTouchedRef.current) addTouchedRef.current = true;
  };

// Load categories (typed)
useEffect(() => {
  let alive = true;
  (async () => {
    try {
      const res = await fetch(INV_CATS_API, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true)
        throw new Error(data?.error || `HTTP ${res.status}`);

      const list = (data.categories ?? [])
        .map((c) => ({
          id: String(c?.id ?? ""),
          name: String(c?.name ?? "").trim(),
          inventoryTypeId: Number(c?.inventoryTypeId || 1),
          active: Number(c?.active || 1),
        }))
        .filter((c) => c.name && c.active === 1);

      // sort by name
      list.sort((a, b) => a.name.localeCompare(b.name));

      if (alive) setCategories(list);
    } catch (e) {
      console.error("[inv-categories] load failed:", e);
      if (alive) setCategories([]);
    }
  })();
  return () => {
    alive = false;
  };
}, []);

  // Load ingredients — backend returns newest-first
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(ING_API, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true)
          throw new Error(data?.error || `HTTP ${res.status}`);

        const list = (data.ingredients ?? []).map((x) => ({
          id: x.id,
          name: x.name || "",
          kind: Number(x.inventoryTypeId || x.inventory_type_id || 1) === 2 ? "product" : "ingredient",
          category: x.category,
          type: x.type,
          currentStock: Number(x.currentStock || 0),
          lowStock: Number(x.lowStock || 0),
          createdAt: x.createdAt || null,
          updatedAt: x.updatedAt || null,
        }));
        if (alive) setIngredients(list);
      } catch (e) {
        console.error("[ingredients] load failed:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load inventory activity (now quantity-only)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${INV_ACTIVITY_API}?limit=1000`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true)
          throw new Error(data?.error || `HTTP ${res.status}`);

        const rows = (data.rows ?? []).map((r) => ({
          id: r.id,
          ts: r.ts,
          ingredientId: r.ingredientId || r.ingredient?.id || r.ingredientId,
          ingredientName:
            r.ingredientName || (r.ingredient && r.ingredient.name) || "",
          employee: r.employee || "Chef",
          reason: r.reason || "",
          io: r.io === "Out" ? "Out" : "In",
          qty: Number(r.qty || 0),
        }));
        if (alive) setActivity(rows);
      } catch (e) {
        console.error("[inv-activity] load failed:", e);
        if (alive) setActivity([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const qLower = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    let filteredList = ingredients.filter((ing) => {
      if (!qLower) return true;
      return (
        ing.name.toLowerCase().includes(qLower) ||
        String(ing.category || "").toLowerCase().includes(qLower)
      );
    });

    if (categoryFilter !== "all") {
      filteredList = filteredList.filter(
        (ing) => String(ing.category || "") === categoryFilter
      );
    }

    if (kindFilter !== "all") {
      filteredList = filteredList.filter(
        (ing) => (ing.kind || "ingredient") === kindFilter
      );
    }

    if (stockFilter === "low") {
      filteredList = filteredList.filter((ing) => {
        const low = Number(ing.lowStock || 0);
        const cur = Number(ing.currentStock || 0);
        if (low <= 0) return false;
        if (cur <= 0) return false;
        return cur <= low;
      });
    } else if (stockFilter === "out") {
      filteredList = filteredList.filter(
        (ing) => Number(ing.currentStock || 0) <= 0
      );
    }

    if (qLower) {
      return filteredList.sort((a, b) => {
        const aName = a.name.toLowerCase().includes(qLower);
        const bName = b.name.toLowerCase().includes(qLower);
        if (aName !== bName) return aName ? -1 : 1;
        return 0;
      });
    }
    return filteredList;
  }, [ingredients, qLower, stockFilter, categoryFilter, kindFilter]);

  useEffect(() => {
    setPageState((s) => ({ ...s, page: 0 }));
  }, [query, stockFilter, categoryFilter, kindFilter]);

  const paged = useMemo(() => {
    const start = pageState.page * pageState.rowsPerPage;
    return filtered.slice(start, start + pageState.rowsPerPage);
  }, [filtered, pageState]);

  const allChecked =
    filtered.length > 0 &&
    filtered.every((ing) => selected.includes(ing.id));
  const someChecked =
    filtered.some((ing) => selected.includes(ing.id)) && !allChecked;

  const toggleAll = () => {
    const ids = filtered.map((ing) => ing.id);
    const everyIncluded = ids.every((id) => selected.includes(id));
    setSelected((s) =>
      everyIncluded
        ? s.filter((id) => !ids.includes(id))
        : Array.from(new Set([...s, ...ids]))
    );
  };

  const toggleOne = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  useEffect(() => {
    const validIds = new Set(ingredients.map((ing) => ing.id));
    setSelected((prev) => prev.filter((id) => validIds.has(id)));
  }, [ingredients]);
  
  useEffect(() => {
    const tab = searchParams.get("tab");

    if (tab === "low-stock") {
      setStockFilter("low");
      setPageState((s) => ({ ...s, page: 0 }));
    }
  }, [searchParams]);

  const convertStockByUnitChange = (value, from, to) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    if (from === to) return n;

    if (from === "g" && to === "kg") return n / 1000;
    if (from === "kg" && to === "g") return n * 1000;

    if (from === "ml" && to === "l") return n / 1000;
    if (from === "l" && to === "ml") return n * 1000;

    return n;
  };

// ===================== EDIT INGREDIENT (metadata only) =====================
const [openEdit, setOpenEdit] = useState(false);
const [editTouched, setEditTouched] = useState(false);
const [showEditConfirm, setShowEditConfirm] = useState(false);

const [editForm, setEditForm] = useState({
  id: "",
  name: "",
  kind: "ingredient", 
  category: "",
  type: DEFAULT_UNIT,
  lowStock: 0,
});

const [initialEditForm, setInitialEditForm] = useState(null);

  const kindToTypeId = (k) => (String(k || "").toLowerCase() === "product" ? 2 : 1);

  const allCategoryNames = useMemo(() => {
    // used by the top filter dropdown (Category: All)
    const set = new Set(categories.map((c) => c.name));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categories]);

  const addCategoryOptions = useMemo(() => {
    const typeId = kindToTypeId(newKind);
    return categories.filter((c) => c.inventoryTypeId === typeId);
  }, [categories, newKind]);

  const editCategoryOptions = useMemo(() => {
    const typeId = kindToTypeId(editForm.kind);
    return categories.filter((c) => c.inventoryTypeId === typeId);
  }, [categories, editForm.kind]);

  // Delete flow
  const handleDeleteClick = async (ingredient) => {
    setIngredientToDelete(ingredient);

    try {
      const res = await fetch(`${ING_API}/${ingredient.id}/usage`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.ok && data.isUsed) {
        const usedInItems = Array.isArray(data.usedInItems) ? data.usedInItems : [];

        const recipeCount = Number(data.usedRecipeCount || 0);
        const directCount = Number(data.usedDirectCount || 0);

        let msg = "Cannot delete inventory record because it is linked to item(s).";
        if (recipeCount > 0 && directCount > 0) msg = "Cannot delete; linked to items via Recipe and Direct mode.";
        else if (recipeCount > 0) msg = "Cannot delete; linked to items via Recipe (ingredients) mode.";
        else if (directCount > 0) msg = "Cannot delete; linked to items via Direct inventory mode.";

        showBlockedModal({
          ingredientName: ingredient.name,
          recipeCount,
          directCount,
          activityCount: 0, // usage endpoint doesn't provide this
          sampleItems: usedInItems.slice(0, 6),
          message: msg,
        });

        setSelected((s) => s.filter((id) => id !== ingredient.id));
        return;
      }

      // not used → proceed to confirm dialog
      setDeleteDialogOpen(true);
    } catch (e) {
      console.error("usage check error:", e);
      setDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!ingredientToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`${ING_API}/${ingredientToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setIngredients((prev) =>
          prev.filter((ing) => ing.id !== ingredientToDelete.id)
        );
        setSelected((prev) =>
          prev.filter((id) => id !== ingredientToDelete.id)
        );
        alert.success(`Inventory item "${ingredientToDelete.name}" deleted successfully`);
        setDeleteDialogOpen(false);
      } else {
        // If backend blocks deletion, show the same blocked modal
        if (res.status === 409 && data?.reason) {
          const reason = data.reason;
          const sample = Array.isArray(data.sample) ? data.sample : [];

          showBlockedModal({
            ingredientName: ingredientToDelete.name,
            recipeCount: reason === "item-linked" ? sample.length : 0,
            directCount: reason === "direct-linked" ? sample.length : 0,
            activityCount: reason === "activity-linked" ? (Number(data.activityCount) || 0) : 0,
            sampleItems: sample.slice(0, 6),
            message: data?.error || "Cannot delete; inventory record is linked.",
          });

          setDeleteDialogOpen(false);
          return;
        }

        alert.error(data?.error || "Failed to delete inventory item");
      }
    } catch (e) {
      console.error("delete error:", e);
      alert.error("Failed to delete inventory item");
    } finally {
      setDeleting(false);
    }
  };

  // Blocked-delete modal (inventory)
  const [blockedDialog, setBlockedDialog] = useState({
    open: false,
    ingredientName: "",
    recipeCount: 0,
    directCount: 0,
    activityCount: 0,
    sampleItems: [],
    message: "",
  });

  function showBlockedModal(payload = {}) {
    const {
      ingredientName = "",
      recipeCount = 0,
      directCount = 0,
      activityCount = 0,
      sampleItems = [],
      message = "",
    } = payload || {};

    setBlockedDialog({
      open: true,
      ingredientName,
      recipeCount: Number.isFinite(recipeCount) ? recipeCount : 0,
      directCount: Number.isFinite(directCount) ? directCount : 0,
      activityCount: Number.isFinite(activityCount) ? activityCount : 0,
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

      // Refresh list
      try {
        const r = await fetch(ING_API, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.ok) {
          const list = (j.ingredients ?? []).map((x) => ({
            id: x.id,
            name: x.name || "",
            kind: x.kind || "ingredient",
            category: x.category || "Uncategorized",
            type: x.type || "",
            currentStock: Number(x.currentStock || 0),
            lowStock: Number(x.lowStock || 0),
          }));
          setIngredients(list);
        }
      } catch {}

      const blocked = Array.isArray(data.blocked) ? data.blocked : [];
      const deleted = Number(data.deleted || 0);

      if (deleted) {
        alert.success(`Deleted ${deleted} inventory item${deleted > 1 ? "s" : ""}`);
      }

      if (blocked.length) {
        const namesById = new Map(
          ingredients.map((i) => [String(i.id), i.name])
        );
        if (blocked.length === 1) {
          const b = blocked[0];
          const name = namesById.get(String(b.id)) || "This ingredient";
          let message = "Cannot delete ingredient; it is currently linked.";
          if (b.reason === "activity-linked") {
            message = `Cannot delete ingredient; ${Number(b.count) || 0} activity record(s) are linked to it and it still has stock.`;
          } else if (b.reason === "item-linked") {
            message = `Cannot delete ingredient; it is used in item recipes.`;
          } else if (b.reason === "direct-linked") {
            message = `Cannot delete ingredient; it is linked to item(s) in Direct mode.`;
          } else if (b.reason === "not-found") {
            message = `Cannot delete ingredient; it was not found.`;
          }

          showBlockedModal({
            ingredientName: name,
            recipeCount: b.reason === "item-linked" ? Number(b.count) || 0 : 0,
            directCount: b.reason === "direct-linked" ? Number(b.count) || 0 : 0,
            activityCount: b.reason === "activity-linked" ? Number(b.count) || 0 : 0,
            sampleItems: Array.isArray(b.sample) ? b.sample : [],
            message,
          });
        } else {
          const preview = blocked
            .slice(0, 5)
            .map(
              (b) => namesById.get(String(b.id)) || `#${b.id}`
            )
            .join(", ");
          const more =
            blocked.length > 5
              ? ` and ${blocked.length - 5} more`
              : "";
          showBlockedModal({
            ingredientName: "",
            message: `Some ingredients were not deleted because they are still linked: ${preview}${more}.`,
          });
        }
      }

      setSelected([]);
    } catch (e) {
      console.error("[ingredients] bulk delete error:", e);
      alert.error(e?.message || "Bulk delete failed");
    }
  };

  // Add Inventory Item dialog
  const [openAdd, setOpenAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newUnit, setNewUnit] = useState(DEFAULT_UNIT);
  const [addFormChanged, setAddFormChanged] = useState(false);
  const [showAddConfirm, setShowAddConfirm] = useState(false);

  const handleAddFormChange = () => {
    if (!addFormChanged) setAddFormChanged(true);
  };
  const resetAddForm = () => {
    setNewName("");
    setNewCat("");
    setNewKind("ingredient");
    setNewUnit(DEFAULT_UNIT);
    setAddFormChanged(false);
    setShowAddConfirm(false);
  };
  const handleAddClose = () => {
    addFormChanged || addTouchedRef.current
      ? setShowAddConfirm(true)
      : (setOpenAdd(false), resetAddForm());
  };
  const handleAddConfirmClose = () => {
    setOpenAdd(false);
    resetAddForm();
  };
  const handleAddCancelClose = () => setShowAddConfirm(false);

  const handleAddIngredient = async () => {
    const name = normalize(newName);
    const category = normalize(newCat);
    const unit = newUnit || DEFAULT_UNIT;

    if (!category) {
      alert.error("Please select a category.");
      return;
    }
    if (!unit) {
      alert.error("Please select a unit.");
      return;
    }

    if (!isValidName(name)) {
      alert.error(
        "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60)."
      );
      return;
    }

    try {
      const kind = newKind || "ingredient";
      
      const res = await fetch(ING_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, type: unit, kind }), 
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true)
        throw new Error(data?.error || `HTTP ${res.status}`);

      const id = data.id || `ing-${Date.now()}`;
      setIngredients((list) => [
        {
          id,
          name,
          kind,
          category,
          type: unit,
          currentStock: 0,
          lowStock: 0,
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

// ===================== STOCK IN/OUT (movement only) =====================
const [openStock, setOpenStock] = useState(false);
const [stockForm, setStockForm] = useState({
  ingId: "",
  name: "",
  cat: "",
  type: DEFAULT_UNIT,
  direction: "IN",
  qty: "",
  current: 0,
  low: "",
  reasonType: "other",
  reason: "",
});
const initialStockFormRef = useRef(null);
const [stockFormChanged, setStockFormChanged] = useState(false);
const [showStockConfirm, setShowStockConfirm] = useState(false);

const canSaveStock = useMemo(() => {
  if (!stockForm.ingId) return false;

  const qtyStr = String(stockForm.qty ?? "").trim();
  if (!qtyStr) return false;

  const qty = Number(qtyStr);
  if (!Number.isFinite(qty) || qty <= 0) return false;

  if (stockForm.direction === "OUT" && qty > Number(stockForm.current || 0))
    return false;

  return true;
}, [stockForm]);

  const reasonOptions = useMemo(
    () => getReasonOptionsFor(stockForm.direction),
    [stockForm.direction]
  );

const resetStockForm = () => {
  setStockForm({
    ingId: "",
    name: "",
    cat: "",
    type: DEFAULT_UNIT,
    direction: "IN",
    qty: "",
    current: 0,
    low: "",
    reasonType: "other",
    reason: "",
  });
  initialStockFormRef.current = null;
  setStockFormChanged(false);
  setShowStockConfirm(false);
};

const handleStockFormChange = (newForm) => {
  const base = initialStockFormRef.current;
  if (!stockFormChanged && base) {
    const hasChanges = JSON.stringify(newForm) !== JSON.stringify(base);
    if (hasChanges) setStockFormChanged(true);
  }
};

const handleStockClose = () => {
  if (stockFormChanged) setShowStockConfirm(true);
  else {
    setOpenStock(false);
    resetStockForm();
  }
};

// Row click → open Stock dialog (movement only)
const handleRowClick = (ing) => {
  const newForm = {
    ingId: ing.id,
    name: ing.name || "",
    cat: ing.category || "",
    type: ing.type || DEFAULT_UNIT,
    direction: "IN",
    qty: "",
    current: Number(ing.currentStock || 0),
    low: ing.lowStock ?? "",
    reasonType: "other",
    reason: "",
  };
  setStockForm(newForm);
  initialStockFormRef.current = newForm;
  setStockFormChanged(false);
  setShowStockConfirm(false);
  setOpenStock(true);
};

function moveIdToFront(arr, id) {
  const idx = arr.findIndex((x) => x.id === id);
  if (idx < 0) return arr;
  const item = arr[idx];
  return [item, ...arr.slice(0, idx), ...arr.slice(idx + 1)];
}

// HANDLE STOCK SAVE
const handleStockSave = async () => {
  try {
    const picked = ingredients.find((i) => i.id === stockForm.ingId);
    if (!picked) return;

    const io = stockForm.direction === "IN" ? "In" : "Out";

    const qtyStr = String(stockForm.qty ?? "").trim();
    const qty = Number(qtyStr);

    if (!Number.isFinite(qty) || qty <= 0) {
      alert.error("Quantity is required.");
      return;
    }

    if (io === "Out" && qty > (picked.currentStock || 0)) {
      alert.error("You cannot stock out more than the current stock.");
      return;
    }

    const typeLabel = REASON_TYPE_LABEL[stockForm.reasonType] || "Other";
    const details = String(stockForm.reason || "").trim();
    const reason = details ? `${typeLabel} — ${details}` : typeLabel;

    const res = await fetch(INV_ACTIVITY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee: "Chef",
        reason,
        io,
        qty,
        ingredientId: picked.id,
        ingredientName: picked.name,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok !== true) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    // Update activity list
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
      },
      ...a,
    ]);

    // Update ingredient locally (currentStock only)
    const newCurrent = Math.max(
      0,
      (picked.currentStock || 0) + (io === "In" ? qty : -qty)
    );

    setIngredients((arr) => {
      const next = arr.map((i) =>
        i.id === picked.id
          ? { ...i, currentStock: newCurrent, updatedAt: NOW() }
          : i
      );
      return moveIdToFront(next, picked.id);
    });
    setPageState((s) => ({ ...s, page: 0 }));

    setOpenStock(false);
    resetStockForm();
    alert.success(io === "In" ? "Stock in saved" : "Stock out saved");
  } catch (e) {
    console.error("[inv-activity] save failed:", e);
    alert.error(e?.message || "Save failed");
  }
};

const editChanged = useMemo(() => {
  if (!initialEditForm) return false;
  return JSON.stringify(editForm) !== JSON.stringify(initialEditForm);
}, [editForm, initialEditForm]);

const canSaveEdit = useMemo(() => {
  if (!editForm.id) return false;
  if (!isValidName(normalize(editForm.name))) return false;
  if (!normalize(editForm.category)) return false;
  if (!editForm.type) return false;
  return true;
}, [editForm]);

const openEditDialog = (ing) => {
  const form = {
    id: ing.id,
    name: ing.name || "",
    kind: ing.kind || "ingredient",
    category: ing.category || "",
    type: ing.type || DEFAULT_UNIT,
    lowStock: Number(ing.lowStock || 0),
  };
  setEditForm(form);
  setInitialEditForm(form);
  setEditTouched(false);
  setShowEditConfirm(false);
  setOpenEdit(true);
};

const handleEditClose = () => {
  if (editChanged || editTouched) setShowEditConfirm(true);
  else {
    setOpenEdit(false);
    setInitialEditForm(null);
    setShowEditConfirm(false);
  }
};

const handleEditSave = async () => {
  try {
    const id = editForm.id;
    if (!id) return;

    const body = {
      name: normalize(editForm.name),
      kind: editForm.kind || "ingredient",
      category: normalize(editForm.category),
      type: editForm.type,
      lowStock: parseLowStock(editForm.lowStock),
    };

    const r = await fetch(`${ING_API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || j?.ok !== true) {
      if (r.status === 409 && j?.code === "name_taken") {
        alert.error(j?.error || "Name already exists.");
        return;
      }
      throw new Error(j?.error || `HTTP ${r.status}`);
    }

    setIngredients((arr) =>
      arr.map((i) =>
        i.id === id
          ? {
              ...i,
              name: body.name,
              kind: body.kind,
              category: body.category,
              type: body.type,
              lowStock: Number(body.lowStock || 0),
              updatedAt: NOW(),
            }
          : i
      )
    );

    alert.success("Ingredient details updated");
    setOpenEdit(false);
    setInitialEditForm(null);
    setShowEditConfirm(false);
  } catch (e) {
    console.error("[ingredients] edit failed:", e);
    alert.error(e?.message || "Update failed");
  }
};

// ===================== dont know =====================

  const dropdownMenuProps = {
    MenuListProps: { disablePadding: true },

    PaperProps: {
      className: "scroll-x",
      sx: (theme) => ({
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
      }),
    },
  };

const readOnlySx = (theme) => ({
  // keep background unchanged
  "& .MuiInputBase-root": {
    bgcolor: "transparent",
  },

  // ✅ border muted
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: theme.palette.divider,
    opacity: 0.55,
  },

  // ✅ no “active” focus look
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: theme.palette.divider,
    opacity: 0.55,
  },

  // ✅ text muted
  "& .MuiInputBase-input": {
    color: theme.palette.text.secondary,
    cursor: "default",
  },

  // ✅ label muted
  "& .MuiInputLabel-root": {
    color: theme.palette.text.secondary,
    opacity: 0.85,
  },
});

const filtersAreDefault = categoryFilter === "all" && stockFilter === "all" && kindFilter === "all";

const handleResetFilters = () => {
  setCategoryFilter("all");
  setKindFilter("all");
  setStockFilter("all");
  setQuery("");

  const next = new URLSearchParams(searchParams);
  next.delete("tab");
  setSearchParams(next, { replace: true });
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
              Add Inventory Item
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

            <Tooltip
              title={
                selected.length
                  ? `Delete ${selected.length} selected inventory item${selected.length > 1 ? "s" : ""}`
                  : "Select inventory items to delete"
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
              placeholder="Search inventory name or category"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{
                flexGrow: 1,
                minWidth: 220,
                maxWidth: 420,
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
                {allCategoryNames.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150, flexShrink: 0 }}>
              <InputLabel id="inv-kind-filter-label">Inventory Type</InputLabel>
              <Select
                labelId="inv-kind-filter-label"
                id="inv-kind-filter"
                value={kindFilter}
                label="Inventory Type"
                onChange={(e) => setKindFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="ingredient">Ingredient</MenuItem>
                <MenuItem value="product">Product</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140, flexShrink: 0 }}>
              <InputLabel id="stock-alert-label">Stock alert</InputLabel>
              <Select
                labelId="stock-alert-label"
                id="stock-alert"
                value={stockFilter}
                label="Stock alert"
                onChange={(e) => {
                  const v = e.target.value;
                  setStockFilter(v);

                  // sync URL
                  const next = new URLSearchParams(searchParams);
                  if (v === "low") next.set("tab", "low-stock");
                  else next.delete("tab");
                  setSearchParams(next, { replace: true });
                }}
              >
                <MenuItem value="all">All items</MenuItem>
                <MenuItem value="low">Low stock</MenuItem>
                <MenuItem value="out">Out of stock</MenuItem>
              </Select>
            </FormControl>

              <Tooltip title="Reset filters (Category: All, Stock alert: All items)">
                <span>
                  <IconButton
                    aria-label="Reset filters"
                    onClick={handleResetFilters}
                    disabled={filtersAreDefault}
                    sx={(t) => ({
                      flexShrink: 0,
                      alignSelf: "center",

                      // ✅ normal (enabled) icon color
                      "& .MuiSvgIcon-root": {
                        color: alpha(t.palette.text.primary, 0.9),
                      },

                      // ✅ disabled icon color (still clearly visible)
                      "&.Mui-disabled .MuiSvgIcon-root": {
                        color: alpha(t.palette.text.primary, 0.6),
                      },
                    })}
                  >
                    <RestartAltIcon />
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
            sx={{ width: "100%", maxWidth: "100%" }}
          >
            <Table stickyHeader sx={{ tableLayout: "fixed", minWidth: 700 }}>
              <colgroup>
                <col style={{ width: 50 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 100 }} />
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
                    <Typography fontWeight={600}>
                      Inventory Name
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography fontWeight={600}>Inventory Type</Typography>
                  </TableCell>

                  <TableCell>
                    <Typography fontWeight={600}>Categories</Typography>
                  </TableCell>

                  <TableCell>
                    <Typography fontWeight={600}>Unit</Typography>
                  </TableCell>

                  <TableCell>
                    <Typography fontWeight={600}>
                      Current Stock
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography fontWeight={600}>Actions</Typography>
                  </TableCell>

                </TableRow>
              </TableHead>

              <TableBody>
                {paged.map((ing) => {
                  const isLow =
                    Number(ing.lowStock || 0) > 0 &&
                    Number(ing.currentStock || 0) > 0 &&
                    Number(ing.currentStock || 0) <= Number(ing.lowStock || 0);
                  return (
                    <TableRow
                      key={ing.id}
                      hover
                      sx={(theme) => ({
                        cursor: "pointer",
                        ...(isLow
                          ? {
                              backgroundColor:
                                theme.palette.mode === "dark"
                                  ? "rgba(244, 67, 54, 0.08)"
                                  : "rgba(244, 67, 54, 0.06)",
                            }
                          : {}),
                      })}
                    >
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
                        <Typography fontWeight={600}>
                          {ing.name}
                        </Typography>
                      </TableCell>

                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography>{KIND_LABEL_MAP[ing.kind] || KIND_LABEL_MAP.ingredient}</Typography>
                      </TableCell>

                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography>{ing.category}</Typography>
                      </TableCell>

                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography>
                          {UNIT_LABEL_MAP[ing.type] || ing.type}
                        </Typography>
                      </TableCell>

                      <TableCell onClick={() => handleRowClick(ing)}>
                        {(() => {
                          const { primary, secondary } = formatStockParts(
                            ing.currentStock,
                            ing.type
                          );
                          return (
                            <>
                              <Typography
                                component="span"
                                fontWeight={700}
                              >
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

                              {isLow && (
                                <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.25 }}>
                                  Low
                                </Typography>
                              )}

                            </>
                          );
                        })()}
                      </TableCell>

                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Edit inventory details">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(ing);
                            }}
                            sx={{ mr: 0.5 }}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Delete inventory item">
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
                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
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
            onPageChange={(_, p) =>
              setPageState((s) => ({ ...s, page: p }))
            }
            rowsPerPage={pageState.rowsPerPage}
            onRowsPerPageChange={(e) =>
              setPageState({
                page: 0,
                rowsPerPage: parseInt(e.target.value, 10),
              })
            }
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>

      {/* Delete Confirmation Dialog (legacy) */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography variant="h6" fontWeight={600}>
            Delete Inventory Item
          </Typography>
        </DialogTitle>
        <DialogContent>
          {deleteCheckResult?.isUsed ? (
            <Box>
              <Typography color="error" gutterBottom>
                Cannot delete "{ingredientToDelete?.name}"
              </Typography>
              <Typography variant="body2" gutterBottom>
                This ingredient is currently used in the following menu
                items:
              </Typography>
              <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                {deleteCheckResult.usedInItems.map(
                  (itemName, index) => (
                    <Typography
                      component="li"
                      key={index}
                      variant="body2"
                    >
                      {itemName}
                    </Typography>
                  )
                )}
                {deleteCheckResult.usedInItems.length >= 5 && (
                  <Typography
                    component="li"
                    variant="body2"
                    fontStyle="italic"
                  >
                    ...and more
                  </Typography>
                )}
              </Box>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Please remove this ingredient from all menu items before
                deleting it.
              </Typography>
            </Box>
          ) : (
            <Box>
              <Typography gutterBottom>
                Are you sure you want to delete "
                {ingredientToDelete?.name}"?
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
              >
                This action cannot be undone. All stock data for this
                ingredient will be permanently removed.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            {deleteCheckResult?.isUsed ? "Close" : "Cancel"}
          </Button>
          {!deleteCheckResult?.isUsed && (
            <Button
              onClick={handleConfirmDelete}
              color="error"
              variant="contained"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add Inventory Item Dialog */}
      <Dialog open={openAdd} onClose={handleAddClose} maxWidth="xs" fullWidth>
        <DialogTitle component="div">
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              Add Inventory Item
            </Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent
          onInputCapture={markAddTouched}
          onChangeCapture={markAddTouched}
        >
          <Stack spacing={2} mt={1}>
            {/* Row 1: Name | Kind */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Inventory Name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  handleAddFormChange();
                }}
                autoFocus
                fullWidth
                error={newName.trim().length > 0 && !isValidName(normalize(newName))}
                helperText={
                  newName
                    ? `${normalize(newName).length}/${NAME_MAX}${
                        !isValidName(normalize(newName))
                          ? " • Allowed: letters, numbers, spaces, - ' & . , ( ) /"
                          : ""
                      }`
                    : `Max ${NAME_MAX} chars`
                }
                sx={{ flex: 1.6 }}
              />

              <FormControl fullWidth required sx={{ flex: 1 }}>
                <InputLabel id="kind-add-label">Inventory Type</InputLabel>
                <Select
                  labelId="kind-add-label"
                  label="Kind"
                  value={newKind}
                  onChange={(e) => {
                    const nextKind = e.target.value;

                    setNewKind(nextKind);

                    // ✅ reset category if switching type
                    setNewCat("");

                    handleAddFormChange();
                  }}
                >
                  {KIND_OPTIONS.map((k) => (
                    <MenuItem key={k.value} value={k.value}>
                      {k.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {/* Row 2: Categories | Unit */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl
                fullWidth
                required
                error={addFormChanged && !normalize(newCat)}
                sx={{ flex: 1.3 }}
              >
                <InputLabel id="cat-label">Categories</InputLabel>
                <Select
                  labelId="cat-label"
                  label="Categories"
                  value={newCat}
                  onChange={(e) => {
                    setNewCat(e.target.value);
                    handleAddFormChange();
                  }}
                  MenuProps={dropdownMenuProps}
                >
                  <MenuItem value="" disabled>
                    <em>Select a category</em>
                  </MenuItem>
                  {addCategoryOptions.map((c) => (
                    <MenuItem key={c.id || c.name} value={c.name}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl
                fullWidth
                required
                error={addFormChanged && !newUnit}
                sx={{ flex: 1 }}
              >
                <InputLabel id="unit-add-label">Unit</InputLabel>
                <Select
                  labelId="unit-add-label"
                  label="Unit"
                  value={newUnit}
                  onChange={(e) => {
                    setNewUnit(e.target.value);
                    handleAddFormChange();
                  }}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <MenuItem key={u.value} value={u.value}>
                      {u.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={handleAddClose}>
            CANCEL
          </Button>
          <Button
            variant="contained"
            onClick={handleAddIngredient}
            disabled={
              !normalize(newName) ||
              !isValidName(normalize(newName)) ||
              !normalize(newCat) ||
              !newUnit
            }
          >
            ADD
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Discard Dialog for Add Inventory Item */}
      <Dialog
        open={showAddConfirm}
        onClose={handleAddCancelClose}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography variant="h6" fontWeight={600}>
            Discard Changes?
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>
            You have unsaved changes. Are you sure you want to discard
            them?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={handleAddCancelClose}>
            CANCEL
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleAddConfirmClose}
          >
            DISCARD
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stock In/Out Dialog */}
      <Dialog
        open={openStock}
        onClose={handleStockClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle component="div">
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              Inventory — Stock In / Out
            </Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2}>
            <ToggleButtonGroup
              value={stockForm.direction}
              exclusive
              onChange={(_, v) => {
                if (!v) return;

                const allowed = getReasonOptionsFor(v);
                const stillValid = allowed.some((x) => x.value === stockForm.reasonType);
                const nextType = stillValid ? stockForm.reasonType : "other";

                const newForm = {
                  ...stockForm,
                  direction: v,
                  reasonType: nextType,
                  // ✅ DO NOT touch stockForm.reason
                };

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

            {/* ✅ Read-only Name / Category / Unit */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Ingredient"
                value={stockForm.name || ""}
                InputProps={{ readOnly: true }}
                sx={readOnlySx}
              />

              <TextField
                fullWidth
                label="Category"
                value={stockForm.cat || ""}
                InputProps={{ readOnly: true }}
                sx={readOnlySx}
              />

              <TextField
                fullWidth
                label="Unit"
                value={UNIT_LABEL_MAP[stockForm.type] || stockForm.type}
                InputProps={{ readOnly: true }}
                sx={readOnlySx}
              />
            </Stack>

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
            >

              <TextField
                label="Quantity"
                value={stockForm.qty ?? ""}
                onChange={(e) => {
                  let v = String(e.target.value ?? "");

                  v = v.replace(/\D/g, "");

                  if (v === "") {
                    const newForm = { ...stockForm, qty: "" };
                    setStockForm(newForm);
                    handleStockFormChange(newForm);
                    return;
                  }

                  v = String(parseInt(v, 10));

                  const newForm = { ...stockForm, qty: v };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }}
                inputMode="numeric"
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Typography
                        variant="body2"
                        color={
                          stockForm.direction === "IN"
                            ? "success.main"
                            : "error.main"
                        }
                      >
                        {stockForm.direction === "IN" ? "+" : "−"}
                      </Typography>
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        {UNIT_LABEL_MAP[stockForm.type] ||
                          stockForm.type}
                      </Typography>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Current Stock"
                value={formatStockInline(
                  stockForm.current,
                  stockForm.type
                )}
                InputProps={{ readOnly: true }}
                sx={readOnlySx}
                fullWidth
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="reason-type-label">Reason Type</InputLabel>
                <Select
                  labelId="reason-type-label"
                  label="Reason Type"
                  value={stockForm.reasonType || "other"}
                  onChange={(e) => {
                    const nextType = e.target.value;

                    const newForm = {
                      ...stockForm,
                      reasonType: nextType,
                      // ✅ DO NOT touch stockForm.reason
                    };

                    setStockForm(newForm);
                    handleStockFormChange(newForm);
                  }}
                  MenuProps={dropdownMenuProps}
                >
                  {reasonOptions.map((x) => (
                    <MenuItem key={x.value} value={x.value}>
                      {x.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Reason"
                value={stockForm.reason ?? ""}
                onChange={(e) => {
                  const newForm = { ...stockForm, reason: e.target.value };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }}
                fullWidth
                placeholder={
                  stockForm.reasonType && stockForm.reasonType !== "other"
                    ? `Optional: add details for ${REASON_TYPE_LABEL[stockForm.reasonType]}`
                    : "Enter reason"
                }
              />
            </Stack>

          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" onClick={handleStockClose}>
            CANCEL
          </Button>
          <Button
            variant="contained"
            onClick={handleStockSave}
            disabled={!canSaveStock}
          >
            SAVE
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Discard Dialog for Stock In/Out */}
      <Dialog
        open={showStockConfirm}
        onClose={() => setShowStockConfirm(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography variant="h6" fontWeight={600}>
            Discard Changes?
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>
            You have unsaved changes. Are you sure you want to discard
            them?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setShowStockConfirm(false)}
          >
            CANCEL
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setOpenStock(false);
              resetStockForm();
            }}
          >
            DISCARD
          </Button>
        </DialogActions>
      </Dialog>

      {/* Blocked Delete Dialog — match Category dialog exactly */}
      <Dialog
        open={blockedDialog.open}
        onClose={() =>
          setBlockedDialog((d) => ({ ...d, open: false }))
        }
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle component="div" sx={{ pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            {blockedDialog.ingredientName
              ? "Cannot Delete Inventory Item"
              : "Cannot Delete Inventory Item"}
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ pt: 0 }}>
          {blockedDialog.ingredientName ? (
            <Typography sx={{ mb: 1.5 }}>
              <strong>{blockedDialog.ingredientName}</strong> is
              currently in use and can’t be deleted.
            </Typography>
          ) : (
            <Typography sx={{ mb: 1.5 }}>
              Some selected ingredients are currently in use and can’t
              be deleted.
            </Typography>
          )}

          {(blockedDialog.recipeCount > 0 ||
            blockedDialog.directCount > 0 ||
            blockedDialog.activityCount > 0) && (
            <Box sx={{ mb: 1 }}>
              {blockedDialog.recipeCount > 0 && (
                <Typography variant="body2" sx={{ mb: 0.25 }}>
                  <strong>Linked recipe items:</strong> {blockedDialog.recipeCount}
                </Typography>
              )}
              {blockedDialog.directCount > 0 && (
                <Typography variant="body2" sx={{ mb: 0.25 }}>
                  <strong>Linked direct items:</strong> {blockedDialog.directCount}
                </Typography>
              )}
              {blockedDialog.activityCount > 0 && (
                <Typography variant="body2" sx={{ mb: 0.25 }}>
                  <strong>Linked activity records:</strong> {blockedDialog.activityCount}
                </Typography>
              )}
            </Box>
          )}

          {blockedDialog.sampleItems?.length > 0 && (
            <>
              <Typography
                variant="body2"
                sx={{ mb: 0.5 }}
              >
                Recent items using this ingredient:
              </Typography>
              <Box
                component="ul"
                sx={{ pl: 3, mt: 0, mb: 1.5 }}
              >
                {blockedDialog.sampleItems.map((t, i) => (
                  <li key={`${t}-${i}`}>
                    <Typography variant="body2">{t}</Typography>
                  </li>
                ))}
              </Box>
            </>
          )}

          {blockedDialog.message && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1.5, whiteSpace: "pre-wrap" }}
            >
              {blockedDialog.message}
            </Typography>
          )}

          <Typography
            variant="body2"
            color="text.secondary"
          >
            To delete this{" "}
            {blockedDialog.ingredientName
              ? "ingredient"
              : "ingredient(s)"}
            , remove it from all menu items and/or clear related
            activity records.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ pr: 2.5, pb: 2.25 }}>
          <Button
            onClick={() =>
              setBlockedDialog((d) => ({ ...d, open: false }))
            }
            variant="contained"
            sx={{ borderRadius: 2 }}
            autoFocus
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Inventory Details Dialog */}
      <Dialog open={openEdit} onClose={handleEditClose} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              Edit Inventory Details
            </Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent
          onInputCapture={() => setEditTouched(true)}
          onChangeCapture={() => setEditTouched(true)}
        >
          <Stack spacing={2} mt={1}>
            {/* Row 1: Name | Category */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Inventory Name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
                fullWidth
                error={
                  editForm.name.trim().length > 0 &&
                  !isValidName(normalize(editForm.name))
                }
                helperText={
                  editForm.name
                    ? `${normalize(editForm.name).length}/${NAME_MAX}${
                        !isValidName(normalize(editForm.name))
                          ? " • Allowed: letters, numbers, spaces, - ' & . , ( ) /"
                          : ""
                      }`
                    : `Max ${NAME_MAX} chars`
                }
              />

              <FormControl
                fullWidth
                required
                error={editTouched && !normalize(editForm.category)}
              >
                <InputLabel id="edit-cat-label">Categories</InputLabel>
                <Select
                  labelId="edit-cat-label"
                  label="Categories"
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, category: e.target.value }))
                  }
                  MenuProps={dropdownMenuProps}
                >
                  <MenuItem value="" disabled>
                    <em>Select a category</em>
                  </MenuItem>
                  {editCategoryOptions.map((c) => (
                    <MenuItem key={c.id || c.name} value={c.name}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
                {editTouched && !normalize(editForm.category) && (
                  <FormHelperText>Category is required</FormHelperText>
                )}
              </FormControl>
            </Stack>

            {/* Row 2: Unit | Low Stock */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>

              <FormControl fullWidth required>
                <InputLabel id="edit-kind-label">Inventory Type</InputLabel>
                <Select
                  labelId="edit-kind-label"
                  label="Inventory Type"
                  value={editForm.kind || "ingredient"}
                  onChange={(e) => {
                    const nextKind = e.target.value;

                    setEditForm((f) => ({
                      ...f,
                      kind: nextKind,
                      // clear category so user must re-pick from the correct list
                      category: "",
                    }));
                  }}
                >
                  {KIND_OPTIONS.map((k) => (
                    <MenuItem key={k.value} value={k.value}>
                      {k.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth required>
                <InputLabel id="edit-unit-label">Unit</InputLabel>
                <Select
                  labelId="edit-unit-label"
                  label="Unit"
                  value={editForm.type || DEFAULT_UNIT}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, type: e.target.value }))
                  }
                >
                  {UNIT_OPTIONS.map((u) => (
                    <MenuItem key={u.value} value={u.value}>
                      {u.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Low Stock"
                type="number"
                value={editForm.lowStock}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, lowStock: e.target.value }))
                }
                fullWidth
                InputProps={{ inputProps: { min: 0 } }}
                helperText="Set 0 to disable low stock alert"
              />
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={handleEditClose}>
            CANCEL
          </Button>
          <Button variant="contained" onClick={handleEditSave} disabled={!canSaveEdit}>
            SAVE
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Discard Dialog for Edit */}
      <Dialog
        open={showEditConfirm}
        onClose={() => setShowEditConfirm(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography variant="h6" fontWeight={600}>
            Discard Changes?
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>
            You have unsaved changes. Are you sure you want to discard them?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setShowEditConfirm(false)}>
            CANCEL
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setOpenEdit(false);
              setEditTouched(false);
              setShowEditConfirm(false);
              setEditForm(initialEditForm || {
                id: "",
                name: "",
                category: "",
                type: DEFAULT_UNIT,
                lowStock: 0,
              });
              setInitialEditForm(null);
            }}
          >
            DISCARD
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}