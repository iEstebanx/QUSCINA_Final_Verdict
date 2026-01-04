// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/Menu.jsx
import { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  FormControl,
  Select,
  MenuItem,
  Card,
  CardContent,
  CardMedia,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Button,
  IconButton,
} from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { Add, Remove } from "@mui/icons-material";
import ViewListIcon from "@mui/icons-material/ViewList";
import ImageIcon from "@mui/icons-material/Image";
import RefreshIcon from "@mui/icons-material/Refresh";
import { alpha } from "@mui/material/styles";
import { useCart } from "@/context/CartContext";
import { API_BASE } from "@/utils/apiBase";
import styles from "./CSS/Menu.module.css";

import { useShift } from "@/context/ShiftContext";
import FloatingShiftModal from "@/components/POS/FloatingShiftModal";
import { openSafely } from "@/components/POS/FloatingShiftModal";

// 🔹 Helper for Backoffice POS menu API
const posMenuApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;
  
  // Local dev: Use direct path since proxy handles /api -> backend
  if (!base) return `/api/pos/menu${clean}`;
  
  // Production: Use full URL
  return `${base}/api/pos/menu${clean}`;
};

// Same sorting options as Cashier POS
const sortingOptions = [
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "price-asc", label: "Price (Low to High)" },
  { value: "price-desc", label: "Price (High to Low)" },
  { value: "bestsellers", label: "Best Sellers" }, // reserved for later
  { value: "newest", label: "Newest Added" }, // reserved for later
];

// CSS vars from theme
const cssVars = (t) => ({
  "--bg": t.palette.background.default,
  "--paper": t.palette.background.paper,
  "--text": t.palette.text.primary,
  "--muted": t.palette.text.secondary,
  "--primary": t.palette.primary.main,
  "--on-primary": t.palette.getContrastText(t.palette.primary.main),
  "--divider": t.palette.divider,
  "--surface": alpha(t.palette.primary.main, 0.08),
  "--surface-alt": alpha(t.palette.primary.main, 0.12),
  "--overlay": alpha(t.palette.text.primary, 0.55),
});

// ✅ Single component. No CartProvider here.
export default function Menu() {
  // If you later add a search box, wire it here
  const [search, setSearch] = useState("");
  const [params] = useSearchParams();
  const q = params.get("q") || "";

  useEffect(() => {
    setSearch(q);
  }, [q]);

  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("name-asc");
  
  const cart = useCart() || {};
  const viewMode = cart.viewMode || "text";
  const setViewMode = cart.setViewMode || (() => {});
  const addItem = cart.addItem || (() => {});

  const { shiftId, refreshLatestShift, openShift } = useShift();
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const nextActionRef = useRef(null);
  const terminalId = "TERMINAL-1"; // keep consistent with Cart.jsx

  const ensureShiftThen = (fn) => {
    if (shiftId) return fn();
    nextActionRef.current = fn;
    openSafely(() => setShiftDialogOpen(true));
  };

  const [availabilityFilter, setAvailabilityFilter] = useState("available");

  // ====== items from backend ======
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  // item dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [dialogQty, setDialogQty] = useState(1);

  const handleViewChange = (_, v) => v !== null && setViewMode(v);
  useEffect(() => {
    setViewMode("text");
  }, [setViewMode]);

  // 🔹 LOAD ITEMS FROM /pos/menu  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  useEffect(() => {
    const controller = new AbortController();

    async function fetchItems() {
      setLoadingItems(true);
      setItemsError(null);

      try {
        const res = await fetch(posMenuApi("/"), {
          credentials: "include",
          signal: controller.signal,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || "Failed to load menu items.");
        }

        const list = Array.isArray(data.items) ? data.items : [];

        // normalize to what Menu.jsx expects
        const normalized = list.map((it) => {
          const price = Number(it.price ?? 0);

          return {
            id: it.id,
            name: it.name,
            description: it.description || "",
            price,
            category: it.category || "Uncategorized",
            image: it.image || it.imageUrl || null,

            // NEW — keep these from backend
            stockMode: it.stockMode || it.stock_mode || "ingredients",
            manualAvailable: Number(it.manualAvailable ?? it.manual_available ?? 1),
            isActive: Number(it.isActive ?? it.active ?? 1),

            inventoryIngredientId:
              it.inventoryIngredientId ?? it.inventory_ingredient_id ?? null,
            inventoryDeductQty:
              Number(it.inventoryDeductQty ?? it.inventory_deduct_qty ?? 1),

            ingredients: Array.isArray(it.ingredients) ? it.ingredients : [],

            // source of truth from backend
            available: !!it.available,

            // OPTIONAL but recommended if backend provides
            stockState: it.stockState || "unknown", // 'ok' | 'low' | 'out' | 'unknown'
            canAddToCart:
              it.canAddToCart !== undefined ? !!it.canAddToCart : !!it.available,
          };
        });

        setItems(normalized);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Menu load failed:", err);
        setItemsError(err.message || "Failed to load menu items.");
      } finally {
        setLoadingItems(false);
      }
    }

    fetchItems();
    return () => controller.abort();
  }, [reloadTick]);

  const handleClearFilters = () => {
    setCategory("");
    setSortBy("name-asc");
    setAvailabilityFilter("available");

    setReloadTick((v) => v + 1);
  };

  // Build category options dynamically from loaded items
  const categoryOptions = Array.from(
    new Set(items.map((i) => i.category).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  // Filter + sort based on real items
  const filteredMenu = items
    .filter((i) =>
      i.name.toLowerCase().includes((search || "").toLowerCase())
    )
    .filter((i) => (category ? i.category === category : true))
    // 🔹 availability filter
    .filter((i) => {
      if (availabilityFilter === "available") return i.available;
      if (availabilityFilter === "unavailable") return !i.available;
      return true; // no filter
    })
    .sort((a, b) => {
      // 1) keep available items first
      if (a.available && !b.available) return -1;
      if (!a.available && b.available) return 1;

      // 2) if both are UNAVAILABLE, items that HAVE a price go first
      if (!a.available && !b.available) {
        const aHasPrice = a.price > 0;
        const bHasPrice = b.price > 0;

        if (aHasPrice && !bHasPrice) return -1; // a before b
        if (!aHasPrice && bHasPrice) return 1; // b before a
        // if both have/no price, fall through to normal sort
      }

      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        default:
          return 0;
      }
    });

  const openDialog = (item) => {
    setSelectedItem(item);
    setDialogQty(1);
    setDialogOpen(true);
  };
  const closeDialog = () => setDialogOpen(false);
  const changeQty = (d) => setDialogQty((q) => Math.max(1, q + d));

  const handleAddToCart = async () => {
    if (!selectedItem) return;

    ensureShiftThen(async () => {
      // quick UI block
      if (adding) return;

      try {
        setAdding(true);

        // 1) Build virtual cart (cart + selected qty)
        const itemsForCheck = buildInventoryCheckItems(selectedItem.id, dialogQty);

        // 2) Call backend pre-check
        const res = await fetch(posOrdersApi("/check-inventory"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ items: itemsForCheck }),
        });

        const data = await res.json().catch(() => ({}));

        // 3) If insufficient inventory, show error and stop
        if (res.status === 409 && data?.code === "INSUFFICIENT_INVENTORY") {
          showError(formatInventoryProblems(data?.problems || []));
          return;
        }

        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || "Inventory check failed.");
        }

        // 4) OK → add to cart
        // If your CartContext supports adding qty in one go, use it.
        // Otherwise keep your loop.
        for (let k = 0; k < dialogQty; k++) {
          addItem({
            id: selectedItem.id,
            name: selectedItem.name,
            price: selectedItem.price,
            image: selectedItem.image || null,
          });
        }

        closeDialog();
      } catch (err) {
        console.error("Add to cart failed:", err);
        showError(err?.message || "Failed to add item to cart.");
      } finally {
        setAdding(false);
      }
    });
  };

  const [errorDialog, setErrorDialog] = useState({
    open: false,
    message: "",
  });

  // --- inventory pre-check (Option A) ---
  const [adding, setAdding] = useState(false);

  // Prefer orders API for this file
  const posOrdersApi = (subPath = "") => {
    const base = API_BASE || "";
    const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;
    if (!base) return `/api/pos/orders${clean}`;
    return `${base}/api/pos/orders${clean}`;
  };

  // Builds [{id, qty}] from cart + the new selection
  const buildInventoryCheckItems = (selectedId, addQty) => {
    // your CartContext commonly exposes `items`
    const cartItems = Array.isArray(cart.items) ? cart.items : [];

    const qtyById = new Map();

    for (const it of cartItems) {
      const id = Number(it?.id);
      const qty = Number(it?.qty ?? it?.quantity ?? 1);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;
      qtyById.set(id, (qtyById.get(id) || 0) + qty);
    }

    const sid = Number(selectedId);
    const aq = Number(addQty);

    if (Number.isFinite(sid) && sid > 0 && Number.isFinite(aq) && aq > 0) {
      qtyById.set(sid, (qtyById.get(sid) || 0) + aq);
    }

    return Array.from(qtyById.entries()).map(([id, qty]) => ({ id, qty }));
  };

const fmt = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  // show integers without .00, keep decimals if needed
  const rounded = Math.round(v * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const formatInventoryProblems = (problems = []) => {
  if (!Array.isArray(problems) || problems.length === 0) {
    return "Cannot add this item — not enough stock.\n\nPlease reduce the quantity or restock inventory.";
  }

  const lines = problems.map((p) => {
    const name = (p?.invName || "").trim() || `Inventory #${p?.invId ?? "?"}`;

    if (p?.reason === "direct_not_product") {
      return `• ${name}: invalid setup (Direct stock must link to a Product)`;
    }

    if (p?.reason === "missing_inventory_row") {
      return `• ${name}: missing inventory record`;
    }

    if (p?.reason === "insufficient_stock") {
      const req = Number(p?.required ?? 0);
      const cur = Number(p?.currentStock ?? 0);
      const short = Math.max(0, req - cur);

      return `• ${name}: available ${fmt(cur)}, required ${fmt(req)} (short ${fmt(short)})`;
    }

    return `• ${name}: ${p?.reason || "problem"}`;
  });

  return [
    "Cannot add to cart — insufficient inventory.",
    "",
    "What’s missing:",
    ...lines,
    "",
    "Reduce the quantity or restock the inventory.",
  ].join("\n");
};

  const showError = (message) =>
    setErrorDialog({ open: true, message: message || "Something went wrong." });

  const closeErrorDialog = () =>
    setErrorDialog((prev) => ({ ...prev, open: false }));

  // 🔹 Toggle manual availability (uses backend manualAvailable)
  const handleToggleAvailability = async (item) => {
    if (!item) return;

    const wantAvailable = !(Number(item.manualAvailable) === 1);

    // If trying to turn ON availability, run some quick validations
    if (wantAvailable) {
      if (item.price <= 0) {
        showError("This item cannot be marked as available because it has no valid price.");
        return;
      }

      if (item.stockMode === "ingredients") {
        if (!item.ingredients || item.ingredients.length === 0) {
          showError("Cannot mark available: recipe (ingredients) is required for this item.");
          return;
        }
      }

      if (item.stockMode === "direct") {
        if (!item.inventoryIngredientId) {
          showError("Cannot mark available: this item is Direct stock but has no linked inventory product.");
          return;
        }
      }
    }

    try {
      const url = posMenuApi("/toggle");

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: item.id,
          available: wantAvailable,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        // backend error (no ingredients, out of stock, etc.)
        throw new Error(data.error || "Failed to update availability");
      }

      // Update list
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, manualAvailable: wantAvailable ? 1 : 0 }
            : it
        )
      );

      // Also update dialog copy if it’s open on this item
      setSelectedItem((prev) =>
        prev && prev.id === item.id ? { ...prev, available: wantAvailable } : prev
      );

      // Always close dialog after a successful toggle
      setDialogOpen(false);
    } catch (err) {
      showError(err.message || "Failed to update availability");
    }
  };

  return (
    <Box className={styles.pageRoot} sx={(t) => cssVars(t)}>
      {/* Top bar */}
      <Box className={styles.topBar}>
        <Box className={styles.filterGroup}>
          <FormControl size="small" className={styles.selectControl}>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              displayEmpty
            >
              <MenuItem value="">
                <em>Category</em>
              </MenuItem>
              {categoryOptions.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" className={styles.selectControl}>
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              displayEmpty
            >
              {sortingOptions.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Availability dropdown */}
          <FormControl size="small" className={styles.selectControl}>
            <Select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              displayEmpty
            >
              <MenuItem value="available">Available</MenuItem>
              <MenuItem value="unavailable">Unavailable</MenuItem>
            </Select>
          </FormControl>

          {/* Clear filters */}
          <IconButton
            onClick={handleClearFilters}
            className={styles.clearButton}
            size="small"
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>

        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewChange}
          size="small"
          className={styles.toggleGroup}
        >
          <ToggleButton value="text">
            <ViewListIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="image">
            <ImageIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box className={styles.menuWrapper}>
        {/* Menu grid / states */}
        {loadingItems ? (
          <Box className={styles.noItems}>
            <Typography variant="h6">Loading menu items…</Typography>
          </Box>
        ) : itemsError ? (
          <Box className={styles.noItems}>
            <Typography variant="h6" color="error">
              {itemsError}
            </Typography>
          </Box>
        ) : filteredMenu.length === 0 ? (
          <Box className={styles.noItems}>
            <Typography variant="h6">
              {search && category
                ? `No menu items found for "${search}" in ${category}.`
                : search
                ? `No menu items match "${search}".`
                : category
                ? `No items available in the ${category} category.`
                : "No menu items available at the moment."}
            </Typography>
          </Box>
        ) : (
          <Box className={styles.list}>
            {filteredMenu.map((item) =>
              viewMode === "image" ? (
                <Box
                  key={item.id}
                  onClick={() => openDialog(item)}
                  className={`${styles.listRow} ${styles.imgRow} ${
                    !item.available ? styles.listRowUnavailable : ""
                  }`}
                >
                  {/* LEFT thumbnail */}
                  <Box className={styles.imgThumb}>
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className={styles.imgThumbImg}
                        loading="lazy"
                      />
                    ) : (
                      <ImageIcon sx={{ opacity: 0.6 }} />
                    )}
                  </Box>

                  {/* MIDDLE details */}
                  <Box className={styles.imgMiddle}>
                    <Typography className={styles.imgTitle} title={item.name}>
                      {item.name}
                    </Typography>
                    <Typography className={styles.imgSub} title={item.category}>
                      {item.category}
                    </Typography>
                  </Box>

                  {/* RIGHT chips + price */}
                  <Box className={styles.listRight}>
                    {!item.available && (
                      <Chip
                        label="Unavailable"
                        size="small"
                        variant="outlined"
                        className={styles.outChip}
                      />
                    )}

                    {item.stockState === "low" && (
                      <Chip label="Low" size="small" variant="outlined" />
                    )}
                    {item.stockState === "out" && (
                      <Chip label="Out" size="small" color="error" variant="outlined" />
                    )}

                    <Typography className={styles.listPrice}>
                      ₱{item.price.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                /* ===== TEXT LIST ROWS (NEW) ===== */
                <Box
                  key={item.id}
                  onClick={() => openDialog(item)}
                  className={`${styles.listRow} ${
                    !item.available ? styles.listRowUnavailable : ""
                  }`}
                >
                  <Box className={styles.listLeft}>
                    <Typography className={styles.listTitle} title={item.name}>
                      {item.name}
                    </Typography>
                    <Typography className={styles.listSub} title={item.category}>
                      {item.category}
                    </Typography>
                  </Box>

                  <Box className={styles.listRight}>
                    {!item.available && (
                      <Chip
                        label="Unavailable"
                        size="small"
                        variant="outlined"
                        className={styles.outChip}
                      />
                    )}

                    {item.stockState === "low" && (
                      <Chip label="Low" size="small" variant="outlined" />
                    )}
                    {item.stockState === "out" && (
                      <Chip label="Out" size="small" color="error" variant="outlined" />
                    )}

                    <Typography className={styles.listPrice}>
                      ₱{item.price.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              )
            )}
          </Box>
        )}

        {/* Item dialog */}
        <Dialog
          open={dialogOpen}
          onClose={closeDialog}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: (t) => ({ ...cssVars(t), backgroundColor: "var(--bg)" }),
          }}
        >
          {selectedItem && (() => {
            const canAdd = !!selectedItem?.canAddToCart;

            return (
              <DialogContent className={styles.dialogContent}>
                {viewMode === "image" && selectedItem.image && (
                  <Box className={styles.dialogImageWrapper}>
                    <img
                      src={selectedItem.image}
                      alt={selectedItem.name}
                      className={styles.dialogImage}
                    />
                  </Box>
                )}

                <Box className={styles.dialogDetails}>
                  <Typography variant="h6" className={styles.dialogTitle}>
                    {selectedItem.name}

                    {!selectedItem.available && (
                      <Chip
                        label="Unavailable"
                        size="small"
                        variant="outlined"
                        className={styles.outChip}
                      />
                    )}

                    {selectedItem.stockState === "low" && (
                      <Chip label="Low stock" size="small" variant="outlined" sx={{ ml: 1 }} />
                    )}
                    {selectedItem.stockState === "out" && (
                      <Chip label="Out of stock" size="small" color="error" variant="outlined" sx={{ ml: 1 }} />
                    )}
                  </Typography>

                  {selectedItem.description && (
                    <Typography variant="body2" className={styles.dialogDesc}>
                      {selectedItem.description}
                    </Typography>
                  )}

                  <Box className={styles.dialogPriceQty}>
                    <Typography variant="h6" className={styles.priceText}>
                      ₱{selectedItem.price.toFixed(2)}
                    </Typography>

                    <Box className={styles.qtyControl}>
                      <IconButton
                        onClick={() => changeQty(-1)}
                        size="small"
                        disabled={!canAdd}
                      >
                        <Remove />
                      </IconButton>

                      <Typography variant="body1" className={styles.qtyText}>
                        {dialogQty}
                      </Typography>

                      <IconButton
                        onClick={() => changeQty(1)}
                        size="small"
                        disabled={!canAdd}
                      >
                        <Add />
                      </IconButton>
                    </Box>
                  </Box>

                  <Box className={styles.dialogActions}>
                    <Button
                      variant="contained"
                      onClick={handleAddToCart}
                      disabled={!canAdd || adding}
                      className={styles.addToCartBtn}
                    >
                      {adding ? "Checking…" : "Add to Cart"}
                    </Button>

                    {selectedItem.price > 0 && (
                      <Button
                        variant="outlined"
                        onClick={() => handleToggleAvailability(selectedItem)}
                      >
                        {Number(selectedItem.manualAvailable) === 1
                          ? "Mark as Unavailable"
                          : "Mark as Available"}
                      </Button>
                    )}

                    <Button onClick={closeDialog} className={styles.cancelBtn}>
                      Cancel
                    </Button>
                  </Box>
                </Box>
              </DialogContent>
            );
          })()}
        </Dialog>

        {/* Error dialog for availability problems */}
        <Dialog open={errorDialog.open} onClose={closeErrorDialog}>
          <DialogTitle>Cannot Proceed</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
              {errorDialog.message}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeErrorDialog} autoFocus>
              OK
            </Button>
          </DialogActions>
        </Dialog>
      </Box>

              {shiftDialogOpen && (
        <FloatingShiftModal
          open={shiftDialogOpen}
          terminalId={terminalId}
          refreshLatestShift={refreshLatestShift}
          openShift={openShift}
          onClose={() => {
            setShiftDialogOpen(false);
            nextActionRef.current = null;
          }}
          onShiftOpened={() => {
            setShiftDialogOpen(false);
            if (typeof nextActionRef.current === "function") nextActionRef.current();
            nextActionRef.current = null;
          }}
        />
      )}

    </Box>
  );
}