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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  Radio,
  FormControlLabel,
} from "@mui/material";

import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

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

const pdfHeadStyles = {
  fillColor: [230, 230, 230],
  textColor: [0, 0, 0],
  fontStyle: "bold",
};

// helper for YYYY-MM-DD
const dateToYMD = (d) => {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function InventoryHistoryPage() {
  const [ingredients, setIngredients] = useState([]);
  const [activity, setActivity] = useState([]);
  const [search, setSearch] = useState("");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });

  // dialog state
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfMode, setPdfMode] = useState("all");
  const [pdfFrom, setPdfFrom] = useState(null);
  const [pdfTo, setPdfTo] = useState(null);

  const [noDataOpen, setNoDataOpen] = useState(false);
  const [noDataMessage, setNoDataMessage] = useState("");

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

  // all YYYY-MM-DD dates that have at least one history row
  const activeDateSet = useMemo(() => {
    const s = new Set();
    for (const r of computedRows) {
      const d = new Date(r.ts);
      s.add(dateToYMD(d));
    }
    return s;
  }, [computedRows]);

  const isDateDisabled = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return true;
    // if somehow no history at all, don't lock the calendar completely
    if (!activeDateSet.size) return false;
    return !activeDateSet.has(dateToYMD(date));
  };

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
  const handlePdfExport = async ({ mode = "all", from, to } = {}) => {
    // base rows respect search
    let baseRows = filtered;
    let rangeLabel = "All records";

    const now = new Date();
    const todayYMD = dateToYMD(now);

    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0, 0, 0, 0
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23, 59, 59, 999
    );

    if (mode === "today") {
      // 🔹 STRICT today only
      baseRows = filtered.filter((r) => {
        const dt = new Date(r.ts);
        return dateToYMD(dt) === todayYMD;
      });
      rangeLabel = `${todayYMD} (Today)`;
    } else if (mode === "week") {
      const startOfWeek = new Date(startOfToday);
      const day = startOfToday.getDay(); // 0 = Sun, 1 = Mon, ...
      const mondayDiff = (day + 6) % 7; // convert so 0 = Mon
      startOfWeek.setDate(startOfToday.getDate() - mondayDiff);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      baseRows = filtered.filter((r) => {
        const dt = new Date(r.ts);
        return dt >= startOfWeek && dt <= endOfWeek;
      });

      rangeLabel = `${dateToYMD(startOfWeek)} to ${dateToYMD(
        endOfWeek
      )} (This Week)`;
    } else if (mode === "month") {
      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0, 0, 0, 0
      );
      const endOfMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23, 59, 59, 999
      );

      baseRows = filtered.filter((r) => {
        const dt = new Date(r.ts);
        return dt >= startOfMonth && dt <= endOfMonth;
      });

      rangeLabel = `${dateToYMD(startOfMonth)} to ${dateToYMD(
        endOfMonth
      )} (This Month)`;
    } else if (mode === "range" && from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      fromDate.setHours(0, 0, 0, 0);
      toDate.setHours(23, 59, 59, 999);

      baseRows = filtered.filter((r) => {
        const dt = new Date(r.ts);
        return dt >= fromDate && dt <= toDate;
      });

      const fromYMD = dateToYMD(fromDate);
      const toYMD = dateToYMD(toDate);
      rangeLabel = `${fromYMD} to ${toYMD}`;
    } else {
      // "all" → keep all filtered rows
      rangeLabel = "All records (current search results)";
    }

    // ❗ if the chosen range has no data, DO NOT export everything
    if (!baseRows.length) {
      let humanRange = "the selected range";
      if (mode === "today") humanRange = "today";
      else if (mode === "week") humanRange = "this week";
      else if (mode === "month") humanRange = "this month";
      else if (mode === "range") humanRange = "the selected date range";

      setNoDataMessage(
        `No inventory history found for ${humanRange}. There is nothing to export.`
      );
      setNoDataOpen(true);
      return;
    }

    const rows = baseRows.map((r) => [
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

    // small date range text under title
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Date range: ${rangeLabel}`, 300, 188, { align: "center" });

    autoTable(doc, {
      startY: 210,
      head: [
        [
          "Date",
          "Reason",
          "Ingredient",
          "Category",
          "Current Stock",
          "Adjustment",
          "New Stock",
          "Unit"
        ],
      ],
      body: rows,
      theme: "grid",
      styles: {
        fontSize: 9,
      },
      headStyles: pdfHeadStyles,
    });

    doc.save("inventory-history.pdf");
  };

  const handlePdfDialogConfirm = () => {
    if (pdfMode === "range" && (!pdfFrom || !pdfTo)) {
      // no dates selected → do nothing (you can add snackbar here)
      return;
    }

    handlePdfExport({
      mode: pdfMode,
      from: pdfFrom,
      to: pdfTo,
    });

    setPdfOpen(false);
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
            onClick={() => setPdfOpen(true)}
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
                rowsPerPage: parseInt(e.target.value, 10),
              })
            }
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>

      {/* PDF EXPORT DIALOG */}
      <Dialog
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Export Inventory History</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <RadioGroup
              value={pdfMode}
              onChange={(e) => setPdfMode(e.target.value)}
            >
              <FormControlLabel
                value="all"
                control={<Radio />}
                label="All dates (current search results)"
              />
              <FormControlLabel
                value="today"
                control={<Radio />}
                label="Today"
              />
              <FormControlLabel
                value="week"
                control={<Radio />}
                label="This week"
              />
              <FormControlLabel
                value="month"
                control={<Radio />}
                label="This month"
              />
              <FormControlLabel
                value="range"
                control={<Radio />}
                label="Custom date range"
              />
            </RadioGroup>

            {pdfMode === "range" && (
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <DatePicker
                    label="From"
                    value={pdfFrom}
                    onChange={(newVal) => setPdfFrom(newVal)}
                    slotProps={{
                      textField: {
                        size: "small",
                        fullWidth: true,
                      },
                    }}
                    shouldDisableDate={isDateDisabled}
                  />

                  <DatePicker
                    label="To"
                    value={pdfTo}
                    onChange={(newVal) => setPdfTo(newVal)}
                    slotProps={{
                      textField: {
                        size: "small",
                        fullWidth: true,
                      },
                    }}
                    shouldDisableDate={isDateDisabled}
                  />
                </Stack>
              </LocalizationProvider>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPdfOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handlePdfDialogConfirm}
          >
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>

      {/* NO DATA TO EXPORT DIALOG */}
      <Dialog
        open={noDataOpen}
        onClose={() => setNoDataOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>No data to export</DialogTitle>
        <DialogContent dividers>
          <Typography>{noDataMessage}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoDataOpen(false)} autoFocus>
            OK
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}