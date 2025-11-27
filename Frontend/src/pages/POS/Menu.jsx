// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/Menu.jsx
import { useState, useEffect } from "react";
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
import { Add, Remove } from "@mui/icons-material";
import ViewListIcon from "@mui/icons-material/ViewList";
import ImageIcon from "@mui/icons-material/Image";
import RefreshIcon from "@mui/icons-material/Refresh";
import { alpha } from "@mui/material/styles";
import { useCart } from "@/context/CartContext";
import { API_BASE } from "@/utils/apiBase";
import styles from "./CSS/Menu.module.css";

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
  "--overlay": alpha(t.palette.text.primary, 0.55),
});

// ✅ Single component. No CartProvider here.
export default function Menu() {
  // If you later add a search box, wire it here
  const [search, setSearch] = useState("");

  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("name-asc");
  
  const cart = useCart() || {};
  const viewMode = cart.viewMode || "text";
  const setViewMode = cart.setViewMode || (() => {});
  const addItem = cart.addItem || (() => {});

  const [availabilityFilter, setAvailabilityFilter] = useState("available");

  // ====== items from backend ======
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState(null);

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
          const ingredients = Array.isArray(it.ingredients) ? it.ingredients : [];
          const hasIngredients = ingredients.length > 0;

          // backend flag, with fallback to "has price"
          const backendAvailable =
            it.available !== undefined && it.available !== null
              ? !!it.available
              : price > 0;

          // Frontend safety net: cannot be available without ingredients
          const available = backendAvailable && hasIngredients;

          return {
            id: it.id,
            name: it.name,
            description: it.description || "",
            price,
            category: it.category || "Uncategorized",
            image: it.image || it.imageUrl || null,
            available,
            costOverall: Number(it.costOverall ?? 0),
            profit: Number(it.profit ?? 0),
            ingredients,
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
  }, []);
  const handleClearFilters = () => {
    setCategory("");
    setSortBy("name-asc");
    setAvailabilityFilter("available");
    setSearch("");
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

  const handleAddToCart = () => {
    if (!selectedItem) return;
    for (let k = 0; k < dialogQty; k++) {
      addItem({
        id: selectedItem.id,
        name: selectedItem.name,
        price: selectedItem.price,
        image: selectedItem.image || null,
      });
    }
    closeDialog();
  };

  const [errorDialog, setErrorDialog] = useState({
    open: false,
    message: "",
  });

  const showError = (message) =>
    setErrorDialog({ open: true, message: message || "Something went wrong." });

  const closeErrorDialog = () =>
    setErrorDialog((prev) => ({ ...prev, open: false }));

  // 🔹 Toggle manual availability (uses backend manualAvailable)
  const handleToggleAvailability = async (item) => {
    if (!item) return;

    const wantAvailable = !item.available;

    // If trying to turn ON availability, run some quick validations
    if (wantAvailable) {
      // 1) No price → block & show dialog
      if (item.price <= 0) {
        showError(
          "This item cannot be marked as available because it has no valid price."
        );
        return;
      }

      // 2) No ingredients → block & show dialog
      if (!item.ingredients || item.ingredients.length === 0) {
        showError(
          "This item cannot be marked as available because it has no ingredients set up yet.\n\nGo to Items > Edit and add at least one ingredient first."
        );
        return;
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
          it.id === item.id ? { ...it, available: wantAvailable } : it
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
          <Box className={styles.grid}>
            {filteredMenu.map((item) =>
              viewMode === "image" ? (
                <Card
                  key={item.id}
                  onClick={() => openDialog(item)}
                  className={`${styles.card} ${
                    !item.available ? styles.cardUnavailable : ""
                  }`}
                >
                  <Box className={styles.cardImageWrapper}>
                    {item.image ? (
                      <CardMedia
                        component="img"
                        image={item.image}
                        alt={item.name}
                        className={styles.cardImage}
                        loading="lazy"
                      />
                    ) : (
                      <Box
                        className={styles.cardImageFallback}
                        sx={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0.6,
                        }}
                      >
                        <ImageIcon />
                      </Box>
                    )}

                    {!item.available && (
                      <Box className={styles.overlayCenter}>
                        <Typography
                          variant="h6"
                          className={styles.overlayText}
                        >
                          Unavailable
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <CardContent className={styles.cardContent}>
                    <Typography
                      variant="subtitle2"
                      className={styles.cardTitle}
                      title={item.name}
                    >
                      {item.name}
                    </Typography>
                    <Typography variant="body2">
                      ₱{item.price.toFixed(2)}
                    </Typography>
                  </CardContent>
                </Card>
              ) : (
                <Box
                  key={item.id}
                  onClick={() => openDialog(item)}
                  className={`${styles.textCard} ${
                    !item.available ? styles.textCardUnavailable : ""
                  }`}
                >
                  {!item.available && (
                    <Box className={styles.overlayCenter}>
                      <Typography
                        variant="body1"
                        className={styles.overlayText}
                      >
                        Unavailable
                      </Typography>
                    </Box>
                  )}
                  <Box>
                    <Typography
                      variant="subtitle2"
                      className={styles.textCardTitle}
                      title={item.name}
                    >
                      {item.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      className={styles.textCardCategory}
                    >
                      {item.category}
                    </Typography>
                  </Box>
                  <Box className={styles.textCardFooter}>
                    <Typography
                      variant="body2"
                      className={styles.textCardPrice}
                    >
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
          {selectedItem && (
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
                      disabled={!selectedItem.available}
                    >
                      <Remove />
                    </IconButton>
                    <Typography variant="body1" className={styles.qtyText}>
                      {dialogQty}
                    </Typography>
                    <IconButton
                      onClick={() => changeQty(1)}
                      size="small"
                      disabled={!selectedItem.available}
                    >
                      <Add />
                    </IconButton>
                  </Box>
                </Box>
                <Box className={styles.dialogActions}>
                  <Button
                    variant="contained"
                    onClick={handleAddToCart}
                    disabled={!selectedItem?.available}
                    className={styles.addToCartBtn}
                  >
                    Add to Cart
                  </Button>

                  {/* Only show this if the item actually has a price */}
                  {selectedItem.price > 0 && (
                    <Button
                      variant="outlined"
                      onClick={() => handleToggleAvailability(selectedItem)}
                    >
                      {selectedItem.available
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
          )}
        </Dialog>

        {/* Error dialog for availability problems */}
        <Dialog open={errorDialog.open} onClose={closeErrorDialog}>
          <DialogTitle>Cannot Update Availability</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{errorDialog.message}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeErrorDialog} autoFocus>
              OK
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}