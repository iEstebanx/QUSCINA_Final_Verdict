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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
} from "@mui/material";

import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import quarterOfYear from "dayjs/plugin/quarterOfYear";

import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { DateField } from "@mui/x-date-pickers/DateField";

import SearchIcon from "@mui/icons-material/Search";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "@/assets/LOGO.png";
import { useAuth } from "@/context/AuthContext";

dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);

const ING_API = "/api/inventory/ingredients";
const ACT_API = "/api/inventory/inv-activity";

const RANGE_LABELS = {
  days: "Today",
  weeks: "This Week",
  monthly: "This Month",
  quarterly: "This Quarter",
  yearly: "This Year",
  custom: "Custom",
};

const DEFAULT_RANGE = "days";

const comfyCells = {
  "& .MuiTableCell-root": { py: 1.25, px: 2 },
  "& thead .MuiTableCell-root": {
    fontWeight: 700,
    position: "sticky",
    top: 0,
    background: "background.paper",
    zIndex: 1,
  },
};

const formatNumber = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-PH", { maximumFractionDigits: 3 });
};

const pdfSafeText = (v) => {
  if (v === null || v === undefined) return "";
  return String(v)
    .replaceAll("₱", "PHP ")
    .replaceAll("±", "PHP ")
    .replaceAll("¤", "PHP ")
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replace(/\s+/g, " ")
    .trim();
};

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

const preventDateFieldWheelAndArrows = {
  onWheel: (e) => {
    e.preventDefault();
    e.stopPropagation();
  },
  onKeyDown: (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
    }
  },
};

const hardNoTypeDateField = {
  onBeforeInput: (e) => e.preventDefault(),
  onPaste: (e) => e.preventDefault(),
  onKeyDown: (e) => {
    const allowed = new Set([
      "Tab",
      "Shift",
      "Control",
      "Alt",
      "Meta",
      "Escape",
      "Enter",
      "ArrowLeft",
      "ArrowRight",
    ]);

    if (allowed.has(e.key)) return;

    // block character typing + edits
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      e.stopPropagation();
    }
  },
};

export default function InventoryHistoryPage() {
  const { user } = useAuth();

const authFetch = (url, opts = {}) => {
  const token =
    localStorage.getItem("qd_token") ||
    localStorage.getItem("token") ||
    ""; // use whatever your app stores

  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include", // safe even if you use headers
  });
};

  const [ingredients, setIngredients] = useState([]);
  const [activity, setActivity] = useState([]);

  const [search, setSearch] = useState("");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });

  const [reloadTick, setReloadTick] = useState(0);

  // ✅ Same setup as ReportsPage: Range preset + Custom From/To (ISO)
  const [range, setRange] = useState("days"); // days | weeks | monthly | quarterly | yearly | custom
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // dialogs
  const [noDataOpen, setNoDataOpen] = useState(false);
  const [noDataMessage, setNoDataMessage] = useState("");

  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const blurOnFocus = (e) => {
    // kill focus so MUI can't highlight MM/DD/YYYY sections
    e.target.blur?.();
  };

  const getIsoWeekRange = (base = dayjs()) => {
    const dow = base.day(); // 0..6 (Sun..Sat)
    const monday = base.subtract((dow + 6) % 7, "day").startOf("day");
    const sunday = monday.add(6, "day").endOf("day");
    return { from: monday, to: sunday };
  };

  const preparedBy = useMemo(() => {
    if (!user) return "Prepared by: N/A";
    const loginId = user.employeeId || user.username || user.email || user.id || "";
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    if (loginId && fullName) return `Prepared by: ${loginId} - ${fullName}`;
    if (loginId) return `Prepared by: ${loginId}`;
    if (fullName) return `Prepared by: ${fullName}`;
    return "Prepared by: N/A";
  }, [user]);

  const refreshHistory = () => {
    setSearch("");
    setPageState({ page: 0, rowsPerPage: 10 });

    // ✅ Reset to default range AND refresh From/To to default
    applyPresetRange(DEFAULT_RANGE);

    setReloadTick((x) => x + 1);
  };

  /* LOAD INGREDIENTS */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await authFetch(ING_API);
        const j = await res.json();
        if (!alive) return;
        if (j?.ok) setIngredients(j.ingredients || []);
      } catch (e) {
        console.error("load ingredients failed:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

/* LOAD INVENTORY ACTIVITY */
useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const res = await authFetch(`${ACT_API}?limit=2000`);

      const text = await res.text();
      let j = null;
      try {
        j = JSON.parse(text);
      } catch {
        // backend returned HTML or non-JSON (important to see)
      }

      if (!res.ok) {
        console.error("inv-activity failed:", res.status, text);
        return;
      }

      if (!j?.ok) return;
      if (!alive) return;

      const rows = (j.rows || []).map((r) => ({
        ...r,
        qty: Number(r.qty || 0),
      }));

      setActivity(rows);
    } catch (e) {
      console.error("load activity failed:", e);
    }
  })();

  return () => {
    alive = false;
  };
}, [reloadTick]);

  /* MERGE + COMPUTE */
  const computedRows = useMemo(() => {
    if (!activity.length) return [];

    // ✅ backend already provides beforeStock/afterStock, so we only need correct ordering
    // ✅ use ts (effective) then id as tie-breaker
    const newestFirst = activity
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.ts).getTime();
        const tb = new Date(b.ts).getTime();
        if (ta !== tb) return tb - ta;
        const ida = String(a.id || "");
        const idb = String(b.id || "");

        // numeric part at the end (act:123 / audit:456)
        const na = Number(ida.split(":").pop());
        const nb = Number(idb.split(":").pop());

        if (Number.isFinite(nb) && Number.isFinite(na)) return nb - na;
        return idb.localeCompare(ida);
      });

    const result = newestFirst.map((r) => {
      const qtyRaw = r.qty;
      const qty = qtyRaw === null || qtyRaw === undefined ? null : Number(qtyRaw);

      const io = String(r.io || "In") === "Out" ? "Out" : "In";

      // ✅ treat meta events as non-movement when qty is 0 (Created/Deleted/Edited Meta)
      const isMetaEvent =
        qty === null ||
        qty === 0 ||
        String(r.reason || "").toLowerCase().includes("created inventory item") ||
        String(r.reason || "").toLowerCase().includes("deleted inventory item");

      const adjust = isMetaEvent ? null : (io === "In" ? qty : -qty);


      // ✅ DO NOT force null → 0 (that creates fake data)
      const beginStock =
        r.beforeStock ?? r.beginStock ?? r.currentStock ?? null;

      const endStock =
        r.afterStock ?? r.endStock ?? r.currentStock ?? null;

      return {
        id: r.id,
        ts: r.ts,
        reason: r.reason || r.remarks || (io === "In" ? "Stock In" : "Stock Out"),
        ingredientName: r.ingredientName || "Unknown",
        category: r.category || "",
        unit: r.unit || "",
        beginStock,
        adjust,
        endStock,
      };
    });

    return result;
  }, [activity]);

  const dateBounds = useMemo(() => {
    if (!computedRows.length) return { min: "", max: "" };
    let minTs = computedRows[0].ts;
    let maxTs = computedRows[0].ts;
    for (const r of computedRows) {
      if (new Date(r.ts) < new Date(minTs)) minTs = r.ts;
      if (new Date(r.ts) > new Date(maxTs)) maxTs = r.ts;
    }
    return {
      min: dayjs(minTs).format("YYYY-MM-DD"),
      max: dayjs(maxTs).format("YYYY-MM-DD"),
    };
  }, [computedRows]);

    // Build “active days” set (used to disable dates in DatePicker like ReportsPage)
  const activeDaySet = useMemo(() => {
    const s = new Set();
    for (const r of computedRows) {
      const key = dayjs(r.ts).format("YYYY-MM-DD");
      s.add(key);
    }
    return s;
  }, [computedRows]);


  const clampToBounds = (s) => {
    const { min, max } = dateBounds || {};
    let out = s;
    if (min && out < min) out = min;
    if (max && out > max) out = max;
    return out;
  };

  function applyPresetRange(preset) {
    const now = dayjs();
    let from = null;
    let to = null;

    if (preset === "custom") {
      setRange("custom");
      return;
    }

    if (preset === "days") {
      from = now.startOf("day");
      to = now.endOf("day");
    } else if (preset === "weeks") {
      // ISO week (Mon-Sun) then clip to current month (same as ReportsPage)
      const w = getIsoWeekRange(now);

      const monthStart = now.startOf("month").startOf("day");
      const monthEnd = now.endOf("month").endOf("day");

      from = w.from.isBefore(monthStart) ? monthStart : w.from;
      to = w.to.isAfter(monthEnd) ? monthEnd : w.to;
    } else if (preset === "monthly") {
      from = now.startOf("month");
      to = now.endOf("month");
    } else if (preset === "quarterly") {
      from = now.startOf("quarter");
      to = now.endOf("quarter");
    } else if (preset === "yearly") {
      from = now.startOf("year");
      to = now.endOf("year");
    }

    if (!from || !to) return;

    const f = clampToBounds(from.format("YYYY-MM-DD"));
    const t = clampToBounds(to.format("YYYY-MM-DD"));

    setRange(preset);
    setCustomFrom(f);
    setCustomTo(t);
    setPageState((s) => ({ ...s, page: 0 }));
  }

  useEffect(() => {
    // initialize once after bounds are known so clamping works
    if (!customFrom && !customTo && dateBounds.min && dateBounds.max) {
      applyPresetRange(DEFAULT_RANGE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateBounds.min, dateBounds.max]);

  const ensureCustomRangeComplete = () => {
    if (range === "custom" && (!customFrom || !customTo)) {
      setNoDataMessage("Please select both From and To dates for custom range.");
      setNoDataOpen(true);
      return false;
    }
    return true;
  };

  const displayDate = (s) => (dayjs(s).isValid() ? dayjs(s).format("MM/DD/YYYY") : s);

  const currentRangeLabel = useMemo(() => {
    if (range === "custom") {
      if (customFrom && customTo) {
        return `${displayDate(customFrom)} – ${displayDate(customTo)}`;
      }
      return "Custom date range";
    }

    switch (range) {
      case "days":
        return "Today";
      case "weeks":
        return "This Week";
      case "monthly":
        return "This Month";
      case "quarterly":
        return "This Quarter";
      case "yearly":
        return "This Year";
      default:
        return "All";
    }
  }, [range, customFrom, customTo]);

  const shouldDisableDate = (d) => {
    if (!activeDaySet.size) return false;
    const key = d.format("YYYY-MM-DD");
    return !activeDaySet.has(key);
  };

const rangeFilteredRows = useMemo(() => {
  if (!computedRows.length) return [];

  const anchor = dateBounds.max ? dayjs(dateBounds.max) : dayjs();
  let from = null;
  let to = null;

  if (range === "custom") {
    if (!customFrom || !customTo) return computedRows;
    from = dayjs(customFrom).startOf("day");
    to = dayjs(customTo).endOf("day");
  } else if (range === "days") {
    from = anchor.startOf("day");
    to = anchor.endOf("day");
  } else if (range === "weeks") {
    const w = getIsoWeekRange(anchor);
    from = w.from;
    to = w.to;
  } else if (range === "monthly") {
    from = anchor.startOf("month");
    to = anchor.endOf("month");
  } else if (range === "quarterly") {
    from = anchor.startOf("quarter");
    to = anchor.endOf("quarter");
  } else if (range === "yearly") {
    from = anchor.startOf("year");
    to = anchor.endOf("year");
  }

  if (!from || !to) return computedRows;

  return computedRows.filter((r) => {
    const dt = dayjs(r.ts);
    return dt.isAfter(from.subtract(1, "millisecond")) && dt.isBefore(to.add(1, "millisecond"));
  });
}, [computedRows, range, customFrom, customTo, dateBounds.max]);


  /* SEARCH (applies after range filter) */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rangeFilteredRows;

    return rangeFilteredRows.filter((row) => {
      return (
        row.ingredientName.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        (row.reason || "").toLowerCase().includes(q)
      );
    });
  }, [search, rangeFilteredRows]);

  // Reset pagination when filters change
  useEffect(() => {
    setPageState((p) => ({ ...p, page: 0 }));
  }, [search, range, customFrom, customTo]);

  const customIncomplete = range === "custom" && (!customFrom || !customTo);

  const canExportPdf = useMemo(() => {
    if (customIncomplete) return false;
    return filtered.length > 0;
  }, [customIncomplete, filtered.length]);

  /* PAGINATION */
  const paged = useMemo(() => {
    const start = pageState.page * pageState.rowsPerPage;
    return filtered.slice(start, start + pageState.rowsPerPage);
  }, [filtered, pageState]);

  /* PDF EXPORT (exports current filters: range + custom + search) */
  const buildInventoryPdf = async () => {
    if (!ensureCustomRangeComplete()) return;

    const baseRows = filtered;

    if (!baseRows.length) {
      setNoDataMessage(`No inventory history found for "${currentRangeLabel}". There is nothing to export.`);
      setNoDataOpen(true);
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 60;

    let cursorY = 48;

    function ensureSpace(requiredHeight = 80) {
      if (cursorY + requiredHeight > pageHeight - bottomMargin) {
        doc.addPage();
        cursorY = 72;
      }
    }

    const pageWidth = doc.internal.pageSize.getWidth();

    // logo
    const img = new Image();
    img.src = logo;

    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });

    const logoW = 72;
    const logoH = 72;
    const logoX = (pageWidth - logoW) / 2;
    doc.addImage(img, "PNG", logoX, cursorY, logoW, logoH);
    cursorY += logoH + 10;

    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.text("Quscina", pageWidth / 2, cursorY, { align: "center" });
    cursorY += 26;

    doc.setFont("times", "normal");
    doc.setFontSize(18);
    doc.text("Inventory history report", pageWidth / 2, cursorY, { align: "center" });
    cursorY += 26;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    doc.setFont(undefined, "bold");
    doc.text("Date range:", 72, cursorY);
    doc.setFont(undefined, "normal");
    doc.text(currentRangeLabel, 150, cursorY);
    cursorY += 16;

    const searchLabel = search.trim() ? `"${search.trim()}"` : "None";
    doc.setFont(undefined, "bold");
    doc.text("Search:", 72, cursorY);
    doc.setFont(undefined, "normal");
    doc.text(searchLabel, 120, cursorY);
    cursorY += 18;

    ensureSpace(120);

    autoTable(doc, {
      startY: cursorY + 8,
      head: [[
        "Date",
        "Reason",
        "Ingredient",
        "Category",
        "Current Stock",
        "Adjustment",
        "New Stock",
        "Unit",
      ]],
      body: baseRows.map((r) => [
        pdfSafeText(formatDateTime(r.ts)),
        pdfSafeText(r.reason),
        pdfSafeText(r.ingredientName),
        pdfSafeText(r.category),
        pdfSafeText(formatNumber(r.beginStock)),
        pdfSafeText(r.adjust >= 0 ? `+${formatNumber(r.adjust)}` : formatNumber(r.adjust)),
        pdfSafeText(formatNumber(r.endStock)),
        pdfSafeText(r.unit),
      ]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: pdfHeadStyles,
      margin: { left: 72, right: 40 },
      pageBreak: "auto",
    });

    const footerY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 28 : cursorY + 28;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(preparedBy || "Prepared by: N/A", 72, footerY);

    doc.save(`inventory-history-${currentRangeLabel.replace(/\s+/g, "-")}.pdf`);
  };

  return (
    <Box p={2} display="grid" gap={2} sx={{ overflowX: "hidden" }}>
      <Typography variant="h5" fontWeight={800}>
        Inventory Reports
      </Typography>

      <LocalizationProvider dateAdapter={AdapterDayjs}>
        {/* Controls: Range + Custom dates + Search + PDF */}
        <Paper sx={{ p: 2, borderRadius: 3, overflow: "hidden" }}>
          <Stack
            direction="row"
            useFlexGap
            alignItems="center"
            flexWrap="wrap"
            rowGap={1.5}
            columnGap={2}
          >
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="range-label">Range</InputLabel>
              <Select
                labelId="range-label"
                label="Range"
                value={range}
                renderValue={(v) => RANGE_LABELS[v] || "Range"}
                onChange={(e) => applyPresetRange(e.target.value)}
              >
                {/* hidden display-only option so MUI never renders blank */}
                <MenuItem value="__custom__" disabled sx={{ display: "none" }}>
                  Custom
                </MenuItem>

                <MenuItem value="days">Today</MenuItem>
                <MenuItem value="weeks">This Week</MenuItem>
                <MenuItem value="monthly">This Month</MenuItem>
                <MenuItem value="quarterly">This Quarter</MenuItem>
                <MenuItem value="yearly">This Year</MenuItem>
              </Select>
            </FormControl>

            <DatePicker
              label="From"
              views={["year", "month", "day"]}
              format="MM/DD/YYYY"
              value={customFrom ? dayjs(customFrom) : null}
              open={fromOpen}
              onOpen={() => setFromOpen(true)}
              onClose={() => setFromOpen(false)}
              onChange={(value) => {
                if (value === null) {
                  setCustomFrom("");
                  return;
                }
                if (!dayjs(value).isValid()) return;

                let s = dayjs(value).format("YYYY-MM-DD");
                const { min, max } = dateBounds;
                if (min && s < min) s = min;
                if (max && s > max) s = max;

                if (range !== "custom") setRange("custom");
                setCustomFrom(s);
              }}
              minDate={dateBounds.min ? dayjs(dateBounds.min) : undefined}
              maxDate={dateBounds.max ? dayjs(dateBounds.max) : undefined}
              shouldDisableDate={(d) => shouldDisableDate(d)}
              slotProps={{
                field: { readOnly: true },
                textField: {
                  size: "small",
                  onMouseDown: (e) => {
                    e.preventDefault();
                    setFromOpen(true);
                  },
                  onFocus: blurOnFocus, // ✅ stops highlight
                  inputProps: {
                    readOnly: true,
                    inputMode: "none",
                    placeholder: "",
                  },
                  ...hardNoTypeDateField,
                  ...preventDateFieldWheelAndArrows,
                },
              }}
            />

            <DatePicker
              label="To"
              views={["year", "month", "day"]}
              format="MM/DD/YYYY"
              value={customTo ? dayjs(customTo) : null}
              open={toOpen}
              onOpen={() => setToOpen(true)}
              onClose={() => setToOpen(false)}
              onChange={(value) => {
                if (value === null) {
                  setCustomTo("");
                  return;
                }
                if (!dayjs(value).isValid()) return;

                let s = dayjs(value).format("YYYY-MM-DD");
                const { min, max } = dateBounds;
                if (min && s < min) s = min;
                if (max && s > max) s = max;

                if (range !== "custom") setRange("custom");
                setCustomTo(s);
              }}
              minDate={dateBounds.min ? dayjs(dateBounds.min) : undefined}
              maxDate={dateBounds.max ? dayjs(dateBounds.max) : undefined}
              shouldDisableDate={(d) => shouldDisableDate(d)}
              slotProps={{
                field: { readOnly: true },
                textField: {
                  size: "small",
                  onMouseDown: (e) => {
                    e.preventDefault();
                    setToOpen(true);
                  },
                  onFocus: blurOnFocus, // ✅ stops highlight
                  inputProps: {
                    readOnly: true,
                    inputMode: "none",
                    placeholder: "",
                  },
                  ...hardNoTypeDateField,
                  ...preventDateFieldWheelAndArrows,
                },
              }}
            />

            <Button variant="outlined" onClick={refreshHistory}>
              Refresh
            </Button>

            <TextField
              size="small"
              placeholder="Search ingredient, category, reason"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: { xs: "100%", sm: 320 } }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

           <Tooltip
              title={
                range === "custom" && (!customFrom || !customTo)
                  ? "Select both From and To dates first."
                  : filtered.length === 0
                    ? "No inventory activity for the selected range/search."
                    : ""
              }
              disableHoverListener={canExportPdf}
            >
              <span>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={buildInventoryPdf}
                  disabled={!canExportPdf}
                >
                  PDF
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Paper>

        {/* Table */}
        <Paper sx={{ overflow: "hidden" }}>
          <Box p={2}>
            <TableContainer className="scroll-x" sx={{ overflowX: "auto" }}>
              <Table
                stickyHeader
                size="small"
                sx={{
                  minWidth: { xs: 900, md: 1100 },
                  ...comfyCells,
                }}
              >
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
                        sx={{
                          color: row.adjust === null ? "text.secondary" : row.adjust >= 0 ? "success.main" : "error.main",
                          fontWeight: row.adjust === null ? 400 : 800,
                        }}
                      >
                        {row.adjust === null
                          ? "—"
                          : row.adjust >= 0
                            ? `+${formatNumber(row.adjust)}`
                            : formatNumber(row.adjust)}
                      </TableCell>

                      <TableCell>{formatNumber(row.endStock)}</TableCell>
                      <TableCell>{row.unit}</TableCell>
                    </TableRow>
                  ))}

                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <Typography color="text.secondary">
                          No history records found for this range/search.
                        </Typography>
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
              onPageChange={(_, p) => setPageState((s) => ({ ...s, page: p }))}
              onRowsPerPageChange={(e) =>
                setPageState({
                  page: 0,
                  rowsPerPage: parseInt(e.target.value, 10),
                })
              }
              rowsPerPageOptions={[5, 10, 25, { label: "All", value: filtered.length || -1 }]}
              labelRowsPerPage="Rows per page:"
            />
          </Box>
        </Paper>

        {/* No data / validation dialog */}
        <Dialog open={noDataOpen} onClose={() => setNoDataOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>No export available</DialogTitle>
          <DialogContent dividers>
            <Typography>{noDataMessage}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNoDataOpen(false)} autoFocus>
              OK
            </Button>
          </DialogActions>
        </Dialog>
      </LocalizationProvider>
    </Box>
  );
}