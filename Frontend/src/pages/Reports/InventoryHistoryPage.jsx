// QUSCINA_BACKOFFICE/Frontend/src/pages/AuditTrail/InventoryHistoryPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  TextField,
  InputAdornment,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "@/assets/LOGO.png";

const ING_API = "/api/inventory/ingredients";
const ACT_API = "/api/inventory/inv-activity";

const formatNumber = (n) =>
  Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 3 });

const formatPhp = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function InventoryHistoryPage() {
  const [ingredients, setIngredients] = useState([]);
  const [activity, setActivity] = useState([]);
  const [search, setSearch] = useState("");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });

  /* LOAD INGREDIENTS */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(ING_API);
        const j = await res.json();
        if (j.ok) setIngredients(j.ingredients);
      } catch (e) {
        console.error("load ingredients failed:", e);
      }
    })();
  }, []);

  /* LOAD INVENTORY ACTIVITY */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${ACT_API}?limit=2000`);
        const j = await res.json();
        if (!j.ok) return;

        const rows = (j.rows || []).map((r) => ({
          ...r,
          qty: Number(r.qty || 0),
          price: Number(r.price || 0),
        }));

        setActivity(rows);
      } catch (e) {
        console.error("load activity failed:", e);
      }
    })();
  }, []);

  /* MERGE + COMPUTE */
  const computedRows = useMemo(() => {
    if (!activity.length || !ingredients.length) return [];

    // 1) sort oldest → newest for correct running stock
    const sorted = activity
      .slice()
      .sort((a, b) => new Date(a.ts) - new Date(b.ts));

    const mapLastEnd = new Map();

    const result = sorted.map((r) => {
      const ing = ingredients.find((i) => i.id === r.ingredientId);

      const previousEnd = mapLastEnd.get(r.ingredientId) ?? 0;
      const adjust = r.io === "In" ? r.qty : -r.qty;
      const newEnd = previousEnd + adjust;

      mapLastEnd.set(r.ingredientId, newEnd);

      const reasonText =
        r.reason || r.remarks || (r.io === "In" ? "Stock In" : "Stock Out");

      return {
        id: r.id,
        ts: r.ts,
        reason: reasonText,
        ingredientName: r.ingredientName || ing?.name || "Unknown",
        category: ing?.category || "",
        unit: ing?.type || "",
        beginStock: previousEnd,
        adjust,
        endStock: newEnd,
        unitCost: r.price,
        totalValue: r.price * Math.abs(r.qty),
      };
    });

    // 2) show newest first in the UI and PDF
    return result.slice().reverse();
  }, [activity, ingredients]);

  /* SEARCH */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return computedRows;

    return computedRows.filter((row) => {
      return (
        row.ingredientName.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        (row.reason || "").toLowerCase().includes(q)
      );
    });
  }, [search, computedRows]);

  /* PAGINATION */
  const paged = useMemo(() => {
    const start = pageState.page * pageState.rowsPerPage;
    return filtered.slice(start, start + pageState.rowsPerPage);
  }, [filtered, pageState]);

  /* PDF EXPORT */
  const handlePdfExport = async () => {
    if (!filtered.length) return;

    const rows = filtered.map((r) => [
      formatDateTime(r.ts),
      r.reason,
      r.ingredientName,
      r.category,
      formatNumber(r.beginStock),
      r.adjust >= 0 ? `+${formatNumber(r.adjust)}` : formatNumber(r.adjust),
      formatNumber(r.endStock),
      r.unit,
      formatPhp(r.totalValue),
    ]);

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const img = new Image();
    img.src = logo;

    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });

    doc.addImage(img, "PNG", 240, 20, 120, 120);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Inventory History Report", 300, 170, { align: "center" });

    autoTable(doc, {
      startY: 200,
      head: [
        [
          "Date",
          "Reason",
          "Ingredient",
          "Category",
          "Current Stock",
          "Adjustment",
          "New Stock",
          "Unit",
          "Total Value",
        ],
      ],
      body: rows,
      theme: "grid",
      styles: {
        fontSize: 9,
      },
      headStyles: {
        fillColor: [240, 240, 240],
      },
    });

    doc.save("inventory-history.pdf");
  };

  /* UI */
  return (
    <Box p={2} display="grid" gap={2}>
      <Typography variant="h5" fontWeight={800}>
        Inventory Reports
      </Typography>

      {/* SEARCH + PDF BAR */}
      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            size="small"
            placeholder="Search ingredient, category, reason"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <Button
            variant="contained"
            color="error"
            startIcon={<PictureAsPdfIcon />}
            onClick={handlePdfExport}
          >
            PDF
          </Button>
        </Stack>
      </Paper>

      {/* TABLE */}
      <Paper sx={{ overflow: "hidden" }}>
        <Box p={2}>
          <TableContainer>
            <Table stickyHeader sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Ingredient</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Current Stock</TableCell>
                  <TableCell>Stock Adjustment</TableCell>
                  <TableCell>New Stock</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell>Total Value</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {paged.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDateTime(row.ts)}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{row.ingredientName}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>{formatNumber(row.beginStock)}</TableCell>

                    <TableCell
                      style={{
                        color: row.adjust >= 0 ? "green" : "red",
                        fontWeight: 700,
                      }}
                    >
                      {row.adjust >= 0
                        ? `+${formatNumber(row.adjust)}`
                        : formatNumber(row.adjust)}
                    </TableCell>

                    <TableCell>{formatNumber(row.endStock)}</TableCell>
                    <TableCell>{row.unit}</TableCell>
                    <TableCell>{formatPhp(row.totalValue)}</TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <Typography>No history records found.</Typography>
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
            rowsPerPage={pageState.rowsPerPage}
            onPageChange={(_, p) =>
              setPageState({ ...pageState, page: p })
            }
            onRowsPerPageChange={(e) =>
              setPageState({
                page: 0,
                rowsPerPage: parseInt(e.target.value),
              })
            }
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>
    </Box>
  );
}