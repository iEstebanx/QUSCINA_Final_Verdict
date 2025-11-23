// Frontend/src/pages/AuditTrail/InventoryHistoryPage.jsx
import { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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

const MOCK_ROWS = [
  {
    id: 1,
    ts: "2025-10-22T20:12:00",
    remarks: "Stock In",
    ingredientName: "Chicken",
    category: "Meat",
    unit: "kg",
    beginStock: 10,
    adjust: 10,
    endStock: 20,
    unitCost: 150,
    totalValue: 3000,
    employee: "Chef",
  },
  {
    id: 2,
    ts: "2025-10-23T09:05:00",
    remarks: "Stock Out",
    ingredientName: "Milk",
    category: "Dairy",
    unit: "ml",
    beginStock: 5000,
    adjust: -1500,
    endStock: 3500,
    unitCost: 30,
    totalValue: 450,
    employee: "Chef",
  },
  {
    id: 3,
    ts: "2025-10-23T13:40:00",
    remarks: "Waste",
    ingredientName: "Sugar",
    category: "Dry Goods",
    unit: "kg",
    beginStock: 20,
    adjust: -3,
    endStock: 17,
    unitCost: 45,
    totalValue: 765,
    employee: "Chef",
  },
];

const formatDateTime = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateOnly = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
};

const formatRangeForHeader = (fromDate, toDate) => {
  if (!fromDate && !toDate) return "All Dates";
  if (fromDate && !toDate) return fromDate;
  if (!fromDate && toDate) return toDate;
  return `${fromDate} – ${toDate}`;
};

const formatNumber = (n) =>
  Number(n || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 3,
  });

const formatNumberMoney = (n) =>
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatPhp = (n) => `₱${formatNumberMoney(n)}`;

export default function InventoryHistoryPage() {
  const [range, setRange] = useState("day"); // day | week | month | custom
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return MOCK_ROWS;

    return MOCK_ROWS.filter((row) => {
      return (
        row.ingredientName.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        row.remarks.toLowerCase().includes(q)
      );
    });
  }, [search]);

  const paged = useMemo(() => {
    const start = pageState.page * pageState.rowsPerPage;
    return filtered.slice(start, start + pageState.rowsPerPage);
  }, [filtered, pageState]);

  const handlePdfExport = async () => {
    const rowsForPdf = filtered.slice().sort((a, b) => {
      return new Date(a.ts) - new Date(b.ts);
    });
    if (rowsForPdf.length === 0) return;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let cursorY = 40;

    // ---- Logo ----
    const img = new Image();
    img.src = logo;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });

    const logoW = 80;
    const logoH = 80;
    const logoX = (pageWidth - logoW) / 2;
    doc.addImage(img, "PNG", logoX, cursorY, logoW, logoH);
    cursorY += logoH + 10;

    // ---- Title ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Inventory Report", pageWidth / 2, cursorY, { align: "center" });
    cursorY += 28;

    // ---- Header info ----
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    let headerRangeText = formatRangeForHeader(fromDate, toDate);
    if (!fromDate && !toDate && rowsForPdf.length > 0) {
      const first = rowsForPdf[0].ts;
      const last = rowsForPdf[rowsForPdf.length - 1].ts;
      headerRangeText = `${formatDateOnly(first)} – ${formatDateOnly(last)}`;
    }

    doc.text(`Date: ${headerRangeText}`, 72, cursorY);
    cursorY += 14;
    doc.text("Categories: All", 72, cursorY);
    cursorY += 26;

    // ---- Group rows by date ----
    const groupedByDate = rowsForPdf.reduce((acc, row) => {
      const label = formatDateOnly(row.ts);
      if (!acc[label]) acc[label] = [];
      acc[label].push(row);
      return acc;
    }, {});

    const sectionHeaderFontSize = 12;

    Object.entries(groupedByDate).forEach(([dateLabel, rows], idx) => {
      if (idx > 0) {
        cursorY += 18;
      }

      // page break if not enough space for heading + table
      if (cursorY > pageHeight - 120) {
        doc.addPage();
        cursorY = 60;
      }

      // ---- Date heading ----
      doc.setFont("helvetica", "bold");
      doc.setFontSize(sectionHeaderFontSize);
      doc.text(dateLabel, 72, cursorY);
      cursorY += 6;

      // ---- Table for that date ----
      autoTable(doc, {
        startY: cursorY + 8,
        head: [
          [
            "Item Name",
            "Employee",
            "Category",
            "Unit",
            "Beg. Stock",
            "Adj.",
            "End Stock",
            "Remarks",
            "Unit Cost",
            "Total Value",
          ],
        ],
        body: rows.map((r) => [
          r.ingredientName,
          r.employee || "",
          r.category,
          r.unit,
          formatNumber(r.beginStock),
          r.adjust >= 0
            ? `+${formatNumber(r.adjust)}`
            : formatNumber(r.adjust),
          formatNumber(r.endStock),
          r.remarks,
          formatNumberMoney(r.unitCost ?? 0),
          formatNumberMoney(r.totalValue),
        ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: 4,
          lineColor: [210, 210, 210],
          lineWidth: 0.5,
        },
        headStyles: {
          fillColor: [245, 245, 245],
          textColor: 40,
          fontStyle: "bold",
        },
        bodyStyles: {
          textColor: 50,
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252],
        },
        margin: { left: 72, right: 40 },
        tableWidth: "auto",
        columnStyles: {
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          8: { halign: "right" },
          9: { halign: "right" },
        },
      });

      cursorY = doc.lastAutoTable.finalY || cursorY;
    });

    doc.save(`inventory-report-${headerRangeText.replace(/\s+/g, "-")}.pdf`);
  };

  return (
    <Box p={2} display="grid" gap={2}>
      <Typography variant="h5" fontWeight={800}>
        Inventory History
      </Typography>

      {/* Filter / Export bar */}
      <Paper
        sx={{
          p: 2,
          borderRadius: 3,
          bgcolor: "#f9f1e7",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "center" }}
          useFlexGap
          flexWrap="wrap"
        >
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="range-label">Range</InputLabel>
            <Select
              labelId="range-label"
              label="Range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <MenuItem value="day">Day</MenuItem>
              <MenuItem value="week">Week</MenuItem>
              <MenuItem value="month">Month</MenuItem>
              <MenuItem value="custom">Custom</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="date"
            label="From"
            InputLabelProps={{ shrink: true }}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />

          <TextField
            size="small"
            type="date"
            label="To"
            InputLabelProps={{ shrink: true }}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />

          <Box sx={{ flexGrow: 1 }} />

          <TextField
            size="small"
            placeholder="Search ingredient, category, remarks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: { xs: "100%", md: 260 }, maxWidth: 360 }}
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
            startIcon={<PictureAsPdfIcon />}
            color="error"
            onClick={handlePdfExport}
          >
            PDF
          </Button>
        </Stack>
      </Paper>

      {/* Table */}
      <Paper sx={{ overflow: "hidden" }}>
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{ width: "100%", maxWidth: "100%" }}
          >
            <Table stickyHeader sx={{ tableLayout: "fixed", minWidth: 1000 }}>
              <colgroup>
                <col style={{ width: 170 }} /> {/* Date & Time */}
                <col style={{ width: 130 }} /> {/* Remarks */}
                <col style={{ width: 170 }} /> {/* Ingredient Name */}
                <col style={{ width: 150 }} /> {/* Categories */}
                <col style={{ width: 110 }} /> {/* Current Stock */}
                <col style={{ width: 120 }} /> {/* Stock Adjustment */}
                <col style={{ width: 110 }} /> {/* New Stock */}
                <col style={{ width: 80 }} /> {/* Unit */}
                <col style={{ width: 130 }} /> {/* Total Value */}
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography fontWeight={600}>Date &amp; Time</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Remarks</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Ingredient Name</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Categories</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Current Stock</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Stock Adjustment</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>New Stock</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Unit</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Total Value</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {paged.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography fontWeight={600}>
                        {formatDateTime(row.ts)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={600}>{row.remarks}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography>{row.ingredientName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography>{row.category}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={700}>
                        {formatNumber(row.beginStock)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        fontWeight={700}
                        color={
                          row.adjust >= 0 ? "success.main" : "error.main"
                        }
                      >
                        {row.adjust >= 0
                          ? `+${formatNumber(row.adjust)}`
                          : formatNumber(row.adjust)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={700}>
                        {formatNumber(row.endStock)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography>{row.unit}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography>{formatPhp(row.totalValue)}</Typography>
                    </TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No history records found.
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
    </Box>
  );
}