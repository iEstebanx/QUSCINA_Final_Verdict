// Frontend/src/pages/Inventory/InventoryPage.jsx
import { useEffect, useMemo, useState } from "react";
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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import SearchIcon from "@mui/icons-material/Search";
import { useAlert } from "@/context/Snackbar/AlertContext"; // Make sure to import useAlert

const formatPhp = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const NOW = () => new Date().toISOString();
const todayDate = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const ING_API = "/api/inventory/ingredients";
const INV_ACTIVITY_API = "/api/inventory/inv-activity";
const INV_CATS_API = "/api/inventory/inv-categories";

export default function InventoryPage() {
  const [query, setQuery] = useState("");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const [selected, setSelected] = useState([]); // For bulk selection

  const [ingredients, setIngredients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activity, setActivity] = useState([]);

  const alert = useAlert(); // For showing success/error messages

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ingredientToDelete, setIngredientToDelete] = useState(null);
  const [deleteCheckResult, setDeleteCheckResult] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  // Load ingredients (names + meta) - Backend now returns newest first
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
          category: x.category || "Uncategorized",
          type: x.type || "",            // unit/type (e.g., KG, L, PCS) if available
          currentStock: Number(x.currentStock || 0),
          lowStock: Number(x.lowStock || 0),
          price: Number(x.price || 0),
          createdAt: x.createdAt, // Keep for potential client-side sorting
          updatedAt: x.updatedAt, // Keep for potential client-side sorting
        }));
        if (alive) setIngredients(list);
      } catch (e) {
        console.error("[ingredients] load failed:", e);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load activity
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
          remarks: r.remarks || "",
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

  // Search / filtered list - Maintain backend order for non-searched items
  const qLower = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const filteredList = ingredients.filter((ing) => {
      if (!qLower) return true;
      return (
        ing.name.toLowerCase().includes(qLower) ||
        String(ing.category || "").toLowerCase().includes(qLower)
      );
    });

    // When searching, sort by relevance (keep original order for non-searched)
    if (qLower) {
      return filteredList.sort((a, b) => {
        // Exact matches first, then partial matches
        const aNameMatch = a.name.toLowerCase().includes(qLower);
        const bNameMatch = b.name.toLowerCase().includes(qLower);
        const aCatMatch = String(a.category || "").toLowerCase().includes(qLower);
        const bCatMatch = String(b.category || "").toLowerCase().includes(qLower);
        
        // Name matches come before category matches
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
        
        // Both have name matches or both don't - maintain original order
        return 0;
      });
    }
    
    return filteredList; // Return in original order (newest first from backend)
  }, [ingredients, qLower]);

  useEffect(() => {
    setPageState((s) => ({ ...s, page: 0 }));
  }, [query]);

  const paged = useMemo(() => {
    const start = pageState.page * pageState.rowsPerPage;
    return filtered.slice(start, start + pageState.rowsPerPage);
  }, [filtered, pageState]);

  // Selection helpers
  const allChecked = filtered.length > 0 && filtered.every(ing => selected.includes(ing.id));
  const someChecked = filtered.some(ing => selected.includes(ing.id)) && !allChecked;
  
  const toggleAll = () => {
    const ids = filtered.map(ing => ing.id);
    const everyIncluded = ids.every(id => selected.includes(id));
    setSelected(s => (everyIncluded ? s.filter(id => !ids.includes(id)) : Array.from(new Set([...s, ...ids]))));
  };
  
  const toggleOne = (id) => {
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  };

  // Keep selection valid when data changes
  useEffect(() => {
    const validIds = new Set(ingredients.map(ing => ing.id));
    setSelected(prev => prev.filter(id => validIds.has(id)));
  }, [ingredients]);

  // helpers to get last in/out
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

  // Delete functionality
  const handleDeleteClick = async (ingredient) => {
    setIngredientToDelete(ingredient);
    setDeleteCheckResult(null);
    
    try {
      // Check if ingredient is used in any items
      const res = await fetch(`${ING_API}/${ingredient.id}/usage`);
      const data = await res.json().catch(() => ({}));
      
      if (res.ok && data?.ok) {
        setDeleteCheckResult(data);
      } else {
        setDeleteCheckResult({ isUsed: false, usedInItems: [] });
      }
    } catch (error) {
      console.error("Error checking ingredient usage:", error);
      setDeleteCheckResult({ isUsed: false, usedInItems: [] });
    }
    
    setDeleteDialogOpen(true);
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
        // Remove from local state
        setIngredients(prev => prev.filter(ing => ing.id !== ingredientToDelete.id));
        // Remove from selection if it was selected
        setSelected(prev => prev.filter(id => id !== ingredientToDelete.id));
        alert.success(`Ingredient "${ingredientToDelete.name}" deleted successfully`);
        setDeleteDialogOpen(false);
      } else {
        alert.error(data?.error || "Failed to delete ingredient");
      }
    } catch (error) {
      console.error("Error deleting ingredient:", error);
      alert.error("Failed to delete ingredient");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.length === 0) return;
    
    // For bulk delete, we'll delete one by one and show results
    let successCount = 0;
    let errorCount = 0;
    
    for (const id of selected) {
      try {
        const res = await fetch(`${ING_API}/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        
        if (res.ok && data?.ok) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Failed to delete ingredient ${id}:`, data?.error);
        }
      } catch (error) {
        errorCount++;
        console.error(`Error deleting ingredient ${id}:`, error);
      }
    }
    
    // Reload ingredients to reflect changes
    const res = await fetch(ING_API, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      const list = (data.ingredients ?? []).map((x) => ({
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
    
    setSelected([]);
    
    if (successCount > 0) {
      alert.success(`Successfully deleted ${successCount} ingredient${successCount > 1 ? 's' : ''}`);
    }
    if (errorCount > 0) {
      alert.error(`Failed to delete ${errorCount} ingredient${errorCount > 1 ? 's' : ''}. They may be used in menu items.`);
    }
  };

  // Add Ingredient dialog state & handlers
  const [openAdd, setOpenAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [addFormChanged, setAddFormChanged] = useState(false);
  const [showAddConfirm, setShowAddConfirm] = useState(false);

  const UNIT_OPTIONS = ["KG", "Liter", "Slices", "Pcs", "Grams", "ML", "Bottle"];

  const handleAddFormChange = () => {
    if (!addFormChanged) {
      setAddFormChanged(true);
    }
  };

  const resetAddForm = () => {
    setNewName("");
    setNewCat("");
    setNewUnit("");
    setAddFormChanged(false);
    setShowAddConfirm(false);
  };

  const handleAddClose = () => {
    if (addFormChanged) {
      setShowAddConfirm(true);
    } else {
      setOpenAdd(false);
      resetAddForm();
    }
  };

  const handleAddConfirmClose = () => {
    setOpenAdd(false);
    resetAddForm();
  };

  const handleAddCancelClose = () => {
    setShowAddConfirm(false);
  };

  const handleAddIngredient = async () => {
    const name = String(newName ?? "").trim();
    const category = String(newCat ?? "Uncategorized").trim();
    const unit = newUnit || "Pcs";
    if (!name) return;

    try {
      const res = await fetch(ING_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, type: unit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);

      // If API returned id, use it; otherwise fallback to generated id
      const id = data.id || `ing-${Date.now()}`;

      // Prepend the new ingredient so it appears immediately at the top of the table
      setIngredients((list) => [
        { 
          id, 
          name, 
          category, 
          type: unit, 
          currentStock: 0, 
          lowStock: 0, 
          price: 0,
          createdAt: new Date().toISOString(), // Add client-side timestamp
          updatedAt: new Date().toISOString()
        },
        ...list,
      ]);

      // reset form and close
      resetAddForm();
      setOpenAdd(false);
    } catch (e) {
      console.error("[ingredients] create failed:", e);
      // keep modal open so user can retry — optionally show error to user
    }
  };

  // Stock In/Out dialog state & handlers
  const [openStock, setOpenStock] = useState(false);
  const [stockForm, setStockForm] = useState({
    ingId: "",
    cat: "",
    type: "",           // unit (e.g., KG, Pcs)
    direction: "IN",
    qty: "",
    current: 0,
    low: "",
    price: "",
    cost: 0,
    date: "",
    remarks: "",
  });
  const [initialStockForm, setInitialStockForm] = useState(null);
  const [stockFormChanged, setStockFormChanged] = useState(false);
  const [showStockConfirm, setShowStockConfirm] = useState(false);

  const handleStockFormChange = (newForm) => {
    if (!stockFormChanged && initialStockForm) {
      const hasChanges = JSON.stringify(newForm) !== JSON.stringify(initialStockForm);
      if (hasChanges) {
        setStockFormChanged(true);
      }
    }
  };

  const resetStockForm = () => {
    setStockForm({
      ingId: "",
      cat: "",
      type: "",
      direction: "IN",
      qty: "",
      current: 0,
      low: "",
      price: "",
      cost: 0,
      date: todayDate(),
      remarks: "",
    });
    setInitialStockForm(null);
    setStockFormChanged(false);
    setShowStockConfirm(false);
  };

  const handleStockClose = () => {
    if (stockFormChanged) {
      setShowStockConfirm(true);
    } else {
      setOpenStock(false);
      resetStockForm();
    }
  };

  const handleStockConfirmClose = () => {
    setOpenStock(false);
    resetStockForm();
  };

  const handleStockCancelClose = () => {
    setShowStockConfirm(false);
  };

  // Open stock dialog (without a chosen ingredient)
  const openStockDialog = (initialIngId) => {
    const initialForm = {
      ingId: "",
      cat: "",
      type: "",
      direction: "IN",
      qty: "",
      current: 0,
      low: "",
      price: "",
      cost: 0,
      date: todayDate(),
      remarks: "",
    };
    
    setStockForm(initialForm);
    setInitialStockForm(initialForm);
    setStockFormChanged(false);
    setShowStockConfirm(false);
    setOpenStock(true);
  };

  // Called when user picks ingredient from the select or via row click
  const onPickIngredient = (id) => {
    const ing = ingredients.find((i) => i.id === id);
    const newForm = {
      ...stockForm,
      ingId: id,
      cat: ing?.category || "",
      type: ing?.type || "",
      current: ing?.currentStock || 0,
      price: ing?.price || "",
    };
    setStockForm(newForm);
    handleStockFormChange(newForm);
  };

  // New handler when clicking a table row to quick-fill the dialog for restock
  const handleRowClick = (ing) => {
    const newForm = {
      ingId: ing.id,
      cat: ing.category || "",
      type: ing.type || "",
      direction: "IN", // default quick-restock
      qty: "",
      current: ing.currentStock || 0,
      low: ing.lowStock || "",
      price: ing.price || "",
      cost: 0,
      date: todayDate(), // prefill today's date
      remarks: "",
    };
    setStockForm(newForm);
    setInitialStockForm(newForm);
    setStockFormChanged(false);
    setShowStockConfirm(false);
    setOpenStock(true);
  };

  const recalcCost = (qty, price) => {
    const qn = Number(qty || 0);
    const pn = Number(price || 0);
    return qn * pn;
  };

  const handleStockSave = async () => {
    try {
      const qty = Number(stockForm.qty || 0);
      const price = Number(stockForm.price || 0);
      const io = stockForm.direction === "IN" ? "In" : "Out";
      const picked = ingredients.find((i) => i.id === stockForm.ingId);
      if (!picked) return;

      const res = await fetch(INV_ACTIVITY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ts: stockForm.date ? new Date(stockForm.date).toISOString() : undefined,
          employee: "Chef",
          remarks: stockForm.remarks || (io === "In" ? "Stock In" : "Stock Out"),
          io,
          qty,
          price,
          ingredientId: picked.id,
          ingredientName: picked.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);

      // Prepend to UI activity
      const r = data.row || {};
      const row = {
        id: data.id || r.id || `a-${Date.now()}`,
        ts: r.ts || NOW(),
        ingredientId: r.ingredientId || picked.id,
        ingredientName: r.ingredientName || picked.name,
        employee: r.employee || "Chef",
        remarks: r.remarks || (io === "In" ? "Stock In" : "Stock Out"),
        io,
        qty,
        price,
      };
      setActivity((a) => [row, ...a]);

      // Update ingredient's current stock and price locally
      // Also update the updatedAt timestamp to maintain proper ordering
      setIngredients((arr) =>
        arr.map((i) => {
          if (i.id !== picked.id) return i;
          const delta = io === "In" ? qty : -qty;
          return { 
            ...i, 
            currentStock: Math.max(0, (i.currentStock || 0) + delta), 
            price, 
            type: stockForm.type, 
            category: stockForm.cat,
            updatedAt: new Date().toISOString() // Update timestamp for ordering
          };
        })
      );

      // Try to persist the unit (type) and category change back to ingredients endpoint if available.
      // This is a best-effort update — if the backend doesn't support PATCH, we ignore errors.
      (async () => {
        try {
          await fetch(`${ING_API}/${picked.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              type: stockForm.type, 
              category: stockForm.cat,
              price: price,
              currentStock: Math.max(0, (picked.currentStock || 0) + (io === "In" ? qty : -qty))
            }),
          });
        } catch (e) {
          // ignore failures — UI state already updated locally
        }
      })();

      setOpenStock(false);
      resetStockForm();
    } catch (e) {
      console.error("[inv-activity] save failed:", e);
    }
  };

  // UI
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
                setOpenAdd(true);
              }}
              sx={{ flexShrink: 0 }}
            >
              Add ING
            </Button>

            <Button
              variant="contained"
              color="success"
              startIcon={<Inventory2OutlinedIcon />}
              onClick={() => openStockDialog()}
              sx={{ flexShrink: 0 }}
            >
              STOCK IN/OUT
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

            {/* Bulk Delete Button */}
            <Tooltip title={selected.length ? `Delete ${selected.length} selected ingredient${selected.length > 1 ? 's' : ''}` : "Select ingredients to delete"}>
              <span>
                <IconButton
                  aria-label="Delete selected"
                  onClick={handleBulkDelete}
                  disabled={!selected.length}
                  sx={{ flexShrink: 0 }}
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
              sx={{ width: { xs: "100%", sm: 320 }, flex: { xs: "1 1 220px", sm: "0 0 auto" } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </Box>

        <Divider />

        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer component={Paper} elevation={0} className="scroll-x" sx={{ width: "100%", maxWidth: "100%" }}>
            <Table stickyHeader sx={{ tableLayout: "fixed", minWidth: 900 }}>
              <colgroup>
                <col style={{ width: 50 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 80 }} />
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
                  <TableCell><Typography fontWeight={600}>Ingredient Name</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Categories</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Unit</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Current Stock</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Last Adjustment</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Last Deduction</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Per Price</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Actions</Typography></TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {paged.map((ing) => {
                  const lastIn = lastActivity(ing.id, "In");
                  const lastOut = lastActivity(ing.id, "Out");

                  const lastInLabel = lastIn ? `${formatShortDate(lastIn.ts)} • +${lastIn.qty}` : "-";
                  const lastOutLabel = lastOut ? `${formatShortDate(lastOut.ts)} • -${lastOut.qty}` : "-";

                  return (
                    <TableRow
                      key={ing.id}
                      hover
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
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
                        <Typography>{ing.type || "pcs"}</Typography>
                      </TableCell>
                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography fontWeight={700}>{ing.currentStock}</Typography>
                      </TableCell>
                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography>{lastInLabel}</Typography>
                      </TableCell>
                      <TableCell onClick={() => handleRowClick(ing)}>
                        <Typography>{lastOutLabel}</Typography>
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
                    <TableCell colSpan={9}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">No records found.</Typography>
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
        <DialogTitle>
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
                This ingredient is currently used in the following menu items:
              </Typography>
              <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                {deleteCheckResult.usedInItems.map((itemName, index) => (
                  <Typography component="li" key={index} variant="body2">
                    {itemName}
                  </Typography>
                ))}
                {deleteCheckResult.usedInItems.length >= 5 && (
                  <Typography component="li" variant="body2" fontStyle="italic">
                    ...and more
                  </Typography>
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

      {/* Rest of the dialogs (Add Ingredient, Stock In/Out, Confirm Discard) remain the same */}
      {/* Add Ingredient Dialog */}
      <Dialog 
        open={openAdd} 
        onClose={handleAddClose}
        maxWidth="xs" 
        fullWidth
      >
        <DialogTitle>
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>Add Ingredient</Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
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
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="cat-label">Categories</InputLabel>
                <Select 
                  labelId="cat-label" 
                  label="Categories" 
                  value={newCat} 
                  onChange={(e) => {
                    setNewCat(e.target.value);
                    handleAddFormChange();
                  }}
                >
                  <MenuItem value=""><em>Existing categories</em></MenuItem>
                  {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel id="unit-label">Unit</InputLabel>
                <Select 
                  labelId="unit-label" 
                  label="Unit" 
                  value={newUnit} 
                  onChange={(e) => {
                    setNewUnit(e.target.value);
                    handleAddFormChange();
                  }}
                >
                  <MenuItem value=""><em>Select unit</em></MenuItem>
                  {UNIT_OPTIONS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={handleAddClose}>CANCEL</Button>
          <Button variant="contained" onClick={handleAddIngredient} disabled={!newName.trim()}>ADD</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Discard Dialog for Add Ingredient */}
      <Dialog open={showAddConfirm} onClose={handleAddCancelClose} maxWidth="xs" fullWidth>
        <DialogTitle>
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
      <Dialog 
        open={openStock} 
        onClose={handleStockClose}
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>Inventory (Stock In/Out)</Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="name-label">Name</InputLabel>
                <Select 
                  labelId="name-label" 
                  label="Name" 
                  value={stockForm.ingId} 
                  onChange={(e) => onPickIngredient(e.target.value)}
                >
                  {ingredients.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel id="cat2-label">Categories</InputLabel>
                <Select 
                  labelId="cat2-label" 
                  label="Categories" 
                  value={stockForm.cat} 
                  onChange={(e) => {
                    const newForm = { ...stockForm, cat: e.target.value };
                    setStockForm(newForm);
                    handleStockFormChange(newForm);
                  }}
                >
                  {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>

              {/* NEW: Unit field editable similar to Categories */}
              <FormControl fullWidth>
                <InputLabel id="unit3-label">Unit</InputLabel>
                <Select
                  labelId="unit3-label"
                  label="Unit"
                  value={stockForm.type}
                  onChange={(e) => {
                    const newForm = { ...stockForm, type: e.target.value };
                    setStockForm(newForm);
                    handleStockFormChange(newForm);
                  }}
                >
                  <MenuItem value=""><em>Select unit</em></MenuItem>
                  {UNIT_OPTIONS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Quantity"
                value={stockForm.qty}
                onChange={(e) => {
                  // allow digits and single decimal point (e.g., 3.6)
                  let v = String(e.target.value ?? "");
                  // remove invalid chars (keep digits and dot)
                  v = v.replace(/[^0-9.]/g, "");
                  // ensure only a single dot
                  const parts = v.split(".");
                  if (parts.length > 2) {
                    v = parts[0] + "." + parts.slice(1).join("");
                  }
                  const newForm = { ...stockForm, qty: v, cost: recalcCost(v, stockForm.price) };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }}
                inputMode="decimal"
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Typography variant="body2" color="text.secondary">{stockForm.type || "pcs"}</Typography>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField label="Current Stock" value={stockForm.current} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Low Stock" value={stockForm.low} helperText="Inventory quantity at which you will be notified about low stock" disabled fullWidth />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField 
                label="Remarks" 
                value={stockForm.remarks} 
                onChange={(e) => {
                  const newForm = { ...stockForm, remarks: e.target.value };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }} 
                fullWidth 
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Price per Item"
                value={stockForm.price}
                onChange={(e) => {
                  const price = e.target.value.replace(/[^0-9.]/g, "");
                  const newForm = { ...stockForm, price, cost: recalcCost(stockForm.qty, price) };
                  setStockForm(newForm);
                  handleStockFormChange(newForm);
                }}
                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                inputMode="decimal"
                fullWidth
              />
              <TextField label="Cost" value={formatPhp(stockForm.cost)} InputProps={{ readOnly: true }} fullWidth />
              {/* Date is disabled/readOnly and auto-filled with today's date */}
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
          <Button variant="contained" onClick={handleStockSave} disabled={!stockForm.ingId || !stockForm.qty}>SAVE</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Discard Dialog for Stock In/Out */}
      <Dialog open={showStockConfirm} onClose={handleStockCancelClose} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={600}>Discard Changes?</Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>You have unsaved changes. Are you sure you want to discard them?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={handleStockCancelClose}>CANCEL</Button>
          <Button variant="contained" color="error" onClick={handleStockConfirmClose}>DISCARD</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}