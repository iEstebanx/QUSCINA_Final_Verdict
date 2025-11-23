// Frontend/src/pages/Settings/InventorySettings/InventorySettingsPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Stack,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
} from "@mui/material";
import { useAlert } from "@/context/Snackbar/AlertContext";

const ING_API = "/api/inventory/ingredients";

const parseLowStock = (val) => {
  const trimmed = String(val ?? "").trim();
  if (!trimmed) return 0; // blank = no notification
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

// 🔹 same helper you use in InventoryPage
const moveIdToFront = (arr, id) => {
  const idx = arr.findIndex((x) => x.id === id);
  if (idx < 0) return arr;
  const item = arr[idx];
  return [item, ...arr.slice(0, idx), ...arr.slice(idx + 1)];
};

export default function InventorySettingsPage() {
  const [ingredients, setIngredients] = useState([]);
  const [draftLow, setDraftLow] = useState({}); // id -> string being edited

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);

  const alert = useAlert();

  // Load ingredients (same source as InventoryPage)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(ING_API, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }

        const list = (data.ingredients ?? []).map((x) => {
          const current = Number(x.currentStock || 0);
          const low = Number(x.lowStock || 0);
          const isLow = low > 0 && current > 0 && current <= low;

          return {
            id: x.id,
            name: x.name || "",
            category: x.category || "",
            type: x.type || "",
            currentStock: current,
            lowStock: low,
            unit: x.type || "",
            isLow,
          };
        });

        if (alive) {
          setIngredients(list);
          setDraftLow({});
        }
      } catch (e) {
        console.error("[inv-settings] load failed:", e);
        if (alive) {
          setIngredients([]);
          alert.error("Failed to load inventory for settings");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [alert]);

  const categories = useMemo(() => {
    const unique = new Set(
      ingredients.map((i) => String(i.category || "").trim()).filter(Boolean)
    );
    return ["all", ...Array.from(unique)];
  }, [ingredients]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return ingredients.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }

      if (term) {
        const haystack = `${item.name} ${item.category} ${item.unit}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      if (showLowOnly) {
        const cur = Number(item.currentStock || 0);
        const low = Number(item.lowStock || 0);
        if (!(low > 0 && cur > 0 && cur <= low)) return false;
      }

      return true;
    });
  }, [ingredients, selectedCategory, search, showLowOnly]);

  const handleLowChange = (id, value) => {
    setDraftLow((prev) => ({ ...prev, [id]: value }));
  };

  const handleLowBlur = async (ing) => {
    const raw = draftLow[ing.id] ?? String(ing.lowStock ?? "");
    const normalized = parseLowStock(raw);

    // if unchanged after normalize, nothing to do
    if (normalized === Number(ing.lowStock || 0)) return;

    try {
      const res = await fetch(`${ING_API}/${ing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lowStock: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      // update UI + 🔹 bump this row to the first row
      setIngredients((list) => {
        const updated = list.map((i) => {
          if (i.id !== ing.id) return i;
          const current = Number(i.currentStock || 0);
          const low = normalized;
          const isLow = low > 0 && current > 0 && current <= low;
          return { ...i, lowStock: low, isLow };
        });
        return moveIdToFront(updated, ing.id);
      });

      setDraftLow((prev) => {
        const next = { ...prev };
        delete next[ing.id];
        return next;
      });

      alert.success(
        normalized > 0
          ? `Low stock for "${ing.name}" set to ${normalized}`
          : `Low stock for "${ing.name}" disabled`
      );
    } catch (e) {
      console.error("[inv-settings] lowStock update failed:", e);
      alert.error(e?.message || "Failed to update low stock");
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1200, mx: "auto", display: "grid", gap: 2 }}>
      <Typography variant="h5" fontWeight={600}>
        Inventory Settings
      </Typography>

      <Paper sx={{ p: 2.5, display: "grid", gap: 2 }}>
        {/* Top controls: category, search, toggle */}
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          justifyContent="space-between"
          sx={{ flexWrap: "wrap", rowGap: 1.5 }}
        >
          <TextField
            select
            size="small"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            sx={{ width: 200, minWidth: 160 }}
            SelectProps={{
              MenuProps: {
                PaperProps: {
                  className: "scroll-x",   // 🔹 reuse your custom scrollbar style
                },
                // optional: cap height so scrolling actually appears
                MenuListProps: {
                  sx: { maxHeight: 280 },
                },
              },
            }}
          >
            {categories.map((cat) => (
              <MenuItem key={cat} value={cat}>
                {cat === "all" ? "All Categories" : cat}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            placeholder="Search name, category, unit"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, minWidth: 220, maxWidth: 480 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={showLowOnly}
                onChange={(e) => setShowLowOnly(e.target.checked)}
              />
            }
            label="Show low only"
            sx={{ ml: "auto" }}
          />
        </Stack>

        {/* Table */}
        <TableContainer className="scroll-x" sx={{ mx: "auto" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Current
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">
                  Low Stock
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="left">
                  Unit
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => {
                const value =
                  draftLow[item.id] ?? String(item.lowStock ?? "");

                return (
                  <TableRow
                    key={item.id}
                    hover
                    sx={(theme) =>
                      item.isLow
                        ? {
                            backgroundColor:
                              theme.palette.mode === "dark"
                                ? "rgba(244, 67, 54, 0.08)"
                                : "rgba(244, 67, 54, 0.06)",
                          }
                        : undefined
                    }>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {item.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.category || "Uncategorized"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {item.currentStock}
                      </Typography>
                      {item.isLow && (
                        <Typography variant="caption" color="error">
                          Low
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <TextField
                        size="small"
                        type="number"
                        value={value}
                        onChange={(e) =>
                          handleLowChange(item.id, e.target.value)
                        }
                        onBlur={() => handleLowBlur(item)}
                        sx={{ width: 90 }}
                        helperText="0 = disabled"
                      />
                    </TableCell>
                    <TableCell align="left">
                      <Typography variant="body2">
                        {item.unit || "-"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      align="center"
                    >
                      No items found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}