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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import SearchIcon from "@mui/icons-material/Search";

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

  const [ingredients, setIngredients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activity, setActivity] = useState([]);

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

  // Load ingredients (names + meta)
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

  // Search / filtered list
  const qLower = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return ingredients.filter((ing) => {
      if (!qLower) return true;
      return (
        ing.name.toLowerCase().includes(qLower) ||
        String(ing.category || "").toLowerCase().includes(qLower)
      );
    });
  }, [ingredients, qLower]);

  useEffect(() => {
    setPageState((s) => ({ ...s, page: 0 }));
  }, [query]);

  const paged = useMemo(() => {
    const start = pageState.page * pageState.rowsPerPage;
    return filtered.slice(start, start + pageState.rowsPerPage);
  }, [filtered, pageState]);

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

  // Add Ingredient dialog state & handlers
  const [openAdd, setOpenAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newUnit, setNewUnit] = useState("");

  const UNIT_OPTIONS = ["KG", "Liter", "Slices", "Pcs", "Grams", "ML", "Bottle"];

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

      // Prepend the new ingredient so it appears immediately in the table.
      setIngredients((list) => [
        { id, name, category, type: unit, currentStock: 0, lowStock: 0, price: 0 },
        ...list,
      ]);

      // reset form
      setNewName("");
      setNewCat("");
      setNewUnit("");
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

  // Open stock dialog (without a chosen ingredient)
  const openStockDialog = (initialIngId) => {
    if (initialIngId) {
      // prefills handled in handleRowClick/onPickIngredient below
      setOpenStock(true);
    } else {
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
      setOpenStock(true);
    }
  };

  // Called when user picks ingredient from the select or via row click
  const onPickIngredient = (id) => {
    const ing = ingredients.find((i) => i.id === id);
    setStockForm((f) => ({
      ...f,
      ingId: id,
      cat: ing?.category || "",
      type: ing?.type || "",
      current: ing?.currentStock || 0,
      price: ing?.price || "",
    }));
  };

  // New handler when clicking a table row to quick-fill the dialog for restock
  const handleRowClick = (ing) => {
    setStockForm({
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
    });
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

      // update ingredient's current stock and price locally
      setIngredients((arr) =>
        arr.map((i) => {
          if (i.id !== picked.id) return i;
          const delta = io === "In" ? qty : -qty;
          return { ...i, currentStock: Math.max(0, (i.currentStock || 0) + delta), price, type: stockForm.type, category: stockForm.cat };
        })
      );

      // Try to persist the unit (type) and category change back to ingredients endpoint if available.
      // This is a best-effort update — if the backend doesn't support PATCH, we ignore errors.
      (async () => {
        try {
          await fetch(`${ING_API}/${picked.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: stockForm.type, category: stockForm.cat }),
          });
        } catch (e) {
          // ignore failures — UI state already updated locally
        }
      })();

      setOpenStock(false);
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
              onClick={() => setOpenAdd(true)}
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
                <col style={{ width: 220 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 140 }} />
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell><Typography fontWeight={600}>Ingredient Name</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Categories</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Unit</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Current Stock</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Last Adjustment</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Last Deduction</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Per Price</Typography></TableCell>
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
                      onClick={() => handleRowClick(ing)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell><Typography fontWeight={600}>{ing.name}</Typography></TableCell>
                      <TableCell><Typography>{ing.category}</Typography></TableCell>
                      <TableCell><Typography>{ing.type || "pcs"}</Typography></TableCell>
                      <TableCell><Typography fontWeight={700}>{ing.currentStock}</Typography></TableCell>
                      <TableCell><Typography>{lastInLabel}</Typography></TableCell>
                      <TableCell><Typography>{lastOutLabel}</Typography></TableCell>
                      <TableCell><Typography>{formatPhp(ing.price)}</Typography></TableCell>
                    </TableRow>
                  );
                })}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
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

      {/* Add Ingredient Dialog */}
      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>Add Ingredient</Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus fullWidth />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="cat-label">Categories</InputLabel>
                <Select labelId="cat-label" label="Categories" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                  <MenuItem value=""><em>Existing categories</em></MenuItem>
                  {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel id="unit-label">Unit</InputLabel>
                <Select labelId="unit-label" label="Unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
                  <MenuItem value=""><em>Select unit</em></MenuItem>
                  {UNIT_OPTIONS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setOpenAdd(false)}>CANCEL</Button>
          <Button variant="contained" onClick={handleAddIngredient} disabled={!newName.trim()}>ADD</Button>
        </DialogActions>
      </Dialog>

      {/* Stock In/Out Dialog */}
      <Dialog open={openStock} onClose={() => setOpenStock(false)} maxWidth="md" fullWidth>
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
                <Select labelId="name-label" label="Name" value={stockForm.ingId} onChange={(e) => onPickIngredient(e.target.value)}>
                  {ingredients.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel id="cat2-label">Categories</InputLabel>
                <Select labelId="cat2-label" label="Categories" value={stockForm.cat} onChange={(e) => setStockForm((f) => ({ ...f, cat: e.target.value }))}>
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
                  onChange={(e) => setStockForm((f) => ({ ...f, type: e.target.value }))}
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
                  setStockForm((f) => ({ ...f, qty: v, cost: recalcCost(v, f.price) }));
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
              <TextField label="Remarks" value={stockForm.remarks} onChange={(e) => setStockForm((f) => ({ ...f, remarks: e.target.value }))} fullWidth />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Price per Item"
                value={stockForm.price}
                onChange={(e) => {
                  const price = e.target.value.replace(/[^0-9.]/g, "");
                  setStockForm((f) => ({ ...f, price, cost: recalcCost(f.qty, price) }));
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
          <Button variant="outlined" onClick={() => setOpenStock(false)}>CANCEL</Button>
          <Button variant="contained" onClick={handleStockSave} disabled={!stockForm.ingId || !stockForm.qty}>SAVE</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}