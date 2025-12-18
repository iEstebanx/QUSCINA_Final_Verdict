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

const NOW = () => new Date().toISOString();
const todayDate = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ingredientToDelete, setIngredientToDelete] = useState(null);
  const [deleteCheckResult, setDeleteCheckResult] = useState(null); // still here for legacy dialog, but we mainly use blocked modal now
  const [deleting, setDeleting] = useState(false);

  const addTouchedRef = useRef(false);
  const stockTouchedRef = useRef(false);

  const markAddTouched = () => {
    if (!addTouchedRef.current) addTouchedRef.current = true;
  };
  const markStockTouched = () => {
    if (!stockTouchedRef.current) stockTouchedRef.current = true;
  };

  // Load categories
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(INV_CATS_API, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true)
          throw new Error(data?.error || `HTTP ${res.status}`);
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
  }, [ingredients, qLower, stockFilter, categoryFilter]);

  useEffect(() => {
    setPageState((s) => ({ ...s, page: 0 }));
  }, [query, stockFilter, categoryFilter]);

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

  // Delete flow
  const handleDeleteClick = async (ingredient) => {
    setIngredientToDelete(ingredient);

    try {
      const res = await fetch(`${ING_API}/${ingredient.id}/usage`);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.ok && data.isUsed) {
        showBlockedModal({
          ingredientName: ingredient.name,
          countItems: Array.isArray(data.usedInItems)
            ? data.usedInItems.length
            : 0,
          countActivity: Number.isFinite(data.activityCount)
            ? data.activityCount
            : 0,
          sampleItems: Array.isArray(data.usedInItems)
            ? data.usedInItems.slice(0, 6)
            : [],
          message: "Cannot delete ingredient; item(s) are assigned to it.",
        });

        setSelected((s) => s.filter((id) => id !== ingredient.id));
        return;
      }

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
        alert.success(
          `Ingredient "${ingredientToDelete.name}" deleted successfully`
        );
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

      // Refresh list
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
          }));
          setIngredients(list);
        }
      } catch {}

      const blocked = Array.isArray(data.blocked) ? data.blocked : [];
      const deleted = Number(data.deleted || 0);

      if (deleted) {
        alert.success(`Deleted ${deleted} ingredient${deleted > 1 ? "s" : ""}`);
      }

      if (blocked.length) {
        const namesById = new Map(
          ingredients.map((i) => [String(i.id), i.name])
        );
        if (blocked.length === 1) {
          const b = blocked[0];
          const name = namesById.get(String(b.id)) || "This ingredient";
          const message =
            b.reason === "activity-linked"
              ? `Cannot delete ingredient; ${b.count} activity record(s) are linked to it.`
              : `Cannot delete ingredient; it is currently used in menu item(s).`;
          showBlockedModal({
            ingredientName: name,
            countItems:
              b.reason === "item-linked" ? Number(b.count) || 0 : 0,
            countActivity:
              b.reason === "activity-linked" ? Number(b.count) || 0 : 0,
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

  // Add Ingredient dialog
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
      const res = await fetch(ING_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, type: unit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true)
        throw new Error(data?.error || `HTTP ${res.status}`);

      const id = data.id || `ing-${Date.now()}`;
      setIngredients((list) => [
        {
          id,
          name,
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
  date: todayDate(),
  reason: "",
});
const [initialStockForm, setInitialStockForm] = useState(null);
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
    date: todayDate(),
    reason: "",
  });
  setInitialStockForm(null);
  setStockFormChanged(false);
  setShowStockConfirm(false);
};

const handleStockFormChange = (newForm) => {
  if (!stockFormChanged && initialStockForm) {
    const hasChanges = JSON.stringify(newForm) !== JSON.stringify(initialStockForm);
    if (hasChanges) setStockFormChanged(true);
  }
};

const handleStockClose = () => {
  if (stockFormChanged || stockTouchedRef.current) {
    setShowStockConfirm(true);
  } else {
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

    const res = await fetch(INV_ACTIVITY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee: "Chef",
        reason: (stockForm.reason || "").trim() || (io === "In" ? "Stock In" : "Stock Out"),
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

// ===================== EDIT INGREDIENT (metadata only) =====================
const [openEdit, setOpenEdit] = useState(false);
const [editTouched, setEditTouched] = useState(false);
const [showEditConfirm, setShowEditConfirm] = useState(false);

const [editForm, setEditForm] = useState({
  id: "",
  name: "",
  category: "",
  type: DEFAULT_UNIT,
  currentStock: 0,
  lowStock: 0,
});

const [initialEditForm, setInitialEditForm] = useState(null);

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
    category: ing.category || "",
    type: ing.type || DEFAULT_UNIT,
    currentStock: Number(ing.currentStock || 0),
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

  const moveIdToFront = (arr, id) => {
    const idx = arr.findIndex((x) => x.id === id);
    if (idx < 0) return arr;
    const item = arr[idx];
    return [item, ...arr.slice(0, idx), ...arr.slice(idx + 1)];
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

const filtersAreDefault = categoryFilter === "all" && stockFilter === "all";

const handleResetFilters = () => {
  setCategoryFilter("all");
  setStockFilter("all");
  setQuery("");
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
                  ? `Delete ${selected.length} selected ingredient${
                      selected.length > 1 ? "s" : ""
                    }`
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
                      Ingredient Name
                    </Typography>
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
                        <Tooltip title="Edit ingredient details">
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
                    <TableCell colSpan={6}>
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
            Delete Ingredient
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

      {/* Add Ingredient Dialog */}
      <Dialog open={openAdd} onClose={handleAddClose} maxWidth="xs" fullWidth>
        <DialogTitle component="div">
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              Add Ingredient
            </Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent
          onInputCapture={markAddTouched}
          onChangeCapture={markAddTouched}
        >
          <Stack spacing={2} mt={1}>
            <TextField
              label="Name"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                handleAddFormChange();
              }}
              autoFocus
              fullWidth
              error={
                newName.trim().length > 0 &&
                !isValidName(normalize(newName))
              }
              helperText={
                newName
                  ? `${normalize(newName).length}/${NAME_MAX}${
                      !isValidName(normalize(newName))
                        ? " • Allowed: letters, numbers, spaces, - ' & . , ( ) /"
                        : ""
                    }`
                  : `Max ${NAME_MAX} chars`
              }
            />

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
            >
              <FormControl
                fullWidth
                required
                error={addFormChanged && !normalize(newCat)}
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
                  {categories.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl
                fullWidth
                required
                error={addFormChanged && !newUnit}
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

      {/* Confirm Discard Dialog for Add Ingredient */}
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
        <DialogContent
          onInputCapture={markStockTouched}
          onChangeCapture={markStockTouched}
        >
          <Stack spacing={2}>
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

            {/* ✅ Read-only Name / Category / Unit */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Ingredient"
                value={stockForm.name || ""}
                InputProps={{ readOnly: true }}
              />

              <TextField
                fullWidth
                label="Category"
                value={stockForm.cat || ""}
                InputProps={{ readOnly: true }}
              />

              <TextField
                fullWidth
                label="Unit"
                value={UNIT_LABEL_MAP[stockForm.type] || stockForm.type}
                InputProps={{ readOnly: true }}
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
                fullWidth
              />
            </Stack>

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
            >
              <TextField
                label="Reason"
                value={stockForm.reason ?? ""}
                onChange={(e) => {
                  const newForm = {
                    ...stockForm,
                    reason: e.target.value,
                  };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }}
                fullWidth
              />
            </Stack>

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
            >
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
              ? "Cannot Delete Ingredient"
              : "Cannot Delete Ingredients"}
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

          {(blockedDialog.countItems > 0 ||
            blockedDialog.countActivity > 0) && (
            <Box sx={{ mb: 1 }}>
              {blockedDialog.countItems > 0 && (
                <Typography
                  variant="body2"
                  sx={{ mb: 0.25 }}
                >
                  <strong>Linked items:</strong>{" "}
                  {blockedDialog.countItems}
                </Typography>
              )}
              {blockedDialog.countActivity > 0 && (
                <Typography
                  variant="body2"
                  sx={{ mb: 0.25 }}
                >
                  <strong>Linked activity records:</strong>{" "}
                  {blockedDialog.countActivity}
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

      {/* Edit Ingredient Details Dialog */}
      <Dialog open={openEdit} onClose={handleEditClose} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              Edit Ingredient Details
            </Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent
          onInputCapture={() => setEditTouched(true)}
          onChangeCapture={() => setEditTouched(true)}
        >
          <Stack spacing={2} mt={1}>
            <TextField
              label="Name"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              error={editForm.name.trim().length > 0 && !isValidName(normalize(editForm.name))}
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

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl fullWidth required error={editTouched && !normalize(editForm.category)}>
                <InputLabel id="edit-cat-label">Categories</InputLabel>
                <Select
                  labelId="edit-cat-label"
                  label="Categories"
                  value={editForm.category}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                  MenuProps={dropdownMenuProps}
                >
                  <MenuItem value="" disabled>
                    <em>Select a category</em>
                  </MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
                {editTouched && !normalize(editForm.category) && (
                  <FormHelperText>Category is required</FormHelperText>
                )}
              </FormControl>

              <FormControl fullWidth required>
                <InputLabel id="edit-unit-label">Unit</InputLabel>
                <Select
                  labelId="edit-unit-label"
                  label="Unit"
                  value={editForm.type || DEFAULT_UNIT}
                  onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <MenuItem key={u.value} value={u.value}>
                      {u.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Current Stock"
                value={formatStockInline(editForm.currentStock, editForm.type)}
                InputProps={{ readOnly: true }}
                sx={readOnlySx}
                fullWidth
              />
              <TextField
                label="Low Stock"
                type="number"
                value={editForm.lowStock}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, lowStock: e.target.value }))
                }
                fullWidth
                InputProps={{ inputProps: { min: 0 } }}
                helperText='Set 0 to disable low stock alert'
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
                currentStock: 0,
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