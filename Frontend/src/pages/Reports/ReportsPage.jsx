// QUSCINA_BACKOFFICE/Frontend/src/pages/Reports/ReportsPage.jsx
import { useMemo, useState, useEffect } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  Divider,
  Button,
  InputAdornment,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Avatar,
  Chip,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormHelperText,
} from "@mui/material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "@mui/material/styles";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SearchIcon from "@mui/icons-material/Search";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReplayIcon from "@mui/icons-material/Replay";
import GridOnIcon from "@mui/icons-material/GridOn"; // Excel icon
import { useAuth } from "@/context/AuthContext";

// 🔹 PDF libs + logo
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "@/assets/LOGO.png";

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

/* ------------------------- Helpers for money formatting ------------------------- */
const formatNumberMoney = (n) =>
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const peso = (n) => `₱${formatNumberMoney(n)}`;

const pdfHeadStyles = {
  fillColor: [230, 230, 230],
  textColor: [0, 0, 0],
  fontStyle: "bold",
};

/* --------------------------------- Page --------------------------------- */
export default function ReportsPage() {
  const { user } = useAuth();

  const preparedBy = useMemo(() => {
    if (!user) return "Prepared by: N/A";

    const loginId =
      user.employeeId || user.username || user.email || user.id || "";

    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (loginId && fullName) {
      return `Prepared by: ${loginId} - ${fullName}`;
    }
    if (loginId) return `Prepared by: ${loginId}`;
    if (fullName) return `Prepared by: ${fullName}`;
    return "Prepared by: N/A";
  }, [user]);

  // 🔹 Range preset (Day/Week/Monthly/etc. + Custom)
  const [range, setRange] = useState("days");

  // 🔹 Custom date range (YYYY-MM-DD from <input type="date" />)
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [search, setSearch] = useState("");
  const [page1, setPage1] = useState(0);
  const [rpp1, setRpp1] = useState(10);

  const [page2, setPage2] = useState(0);
  const [rpp2, setRpp2] = useState(10);

  // 🔹 REAL data from backend
  const [categoryTop5, setCategoryTop5] = useState([]);
  const [categorySeries, setCategorySeries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [bestSeller, setBestSeller] = useState([]);
  const [orders, setOrders] = useState([]);
  const [staffPerformance, setStaffPerformance] = useState([]);

  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("md"));
  const [selectedOrder, setSelectedOrder] = useState(null);

  // 🔹 PDF dialog state
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfMode, setPdfMode] = useState("current");
  const [pdfRange, setPdfRange] = useState("days");
  const [pdfFrom, setPdfFrom] = useState("");
  const [pdfTo, setPdfTo] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  // 🔹 EXCEL dialog state (same behavior as PDF)
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);
  const [excelMode, setExcelMode] = useState("current");
  const [excelRange, setExcelRange] = useState("days");
  const [excelFrom, setExcelFrom] = useState("");
  const [excelTo, setExcelTo] = useState("");
  const [excelError, setExcelError] = useState("");
  const [excelLoading, setExcelLoading] = useState(false);

  // 🔹 Text version of current filter range (used in dialog + PDF/Excel)
  const currentRangeLabel = useMemo(() => {
    if (range === "custom") {
      if (customFrom && customTo) {
        return `${customFrom} – ${customTo}`;
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

  const formatRangePresetLabel = (r) => {
    switch (r) {
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
      case "custom":
      default:
        return "Custom";
    }
  };

  /* ------------------------ Load REAL data from backend ------------------------ */
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const qs =
          range === "custom" && customFrom && customTo
            ? `range=custom&from=${customFrom}&to=${customTo}`
            : `range=${range}`;

        const [c1, c2, p, b, o, sp] = await Promise.all([
          fetch(`/api/reports/category-top5?${qs}`).then((r) => r.json()),
          fetch(`/api/reports/category-series?${qs}`).then((r) => r.json()),
          fetch(`/api/reports/payments?${qs}`).then((r) => r.json()),
          fetch(`/api/reports/best-sellers?${qs}`).then((r) => r.json()),
          fetch(`/api/reports/orders?${qs}`).then((r) => r.json()),
          fetch(`/api/reports/staff-performance?${qs}`).then((r) => r.json()),
        ]);

        if (!alive) return;

        setCategoryTop5(c1?.ok ? c1.data || [] : []);
        setCategorySeries(c2?.ok ? c2.data || [] : []);
        setPayments(p?.ok ? p.data || [] : []);
        setBestSeller(b?.ok ? b.data || [] : []);
        setOrders(o?.ok ? o.data || [] : []);
        setStaffPerformance(sp?.ok ? sp.data || [] : []);
      } catch (err) {
        console.error("[reports] load failed", err);
        if (!alive) return;
        setCategoryTop5([]);
        setCategorySeries([]);
        setPayments([]);
        setBestSeller([]);
        setOrders([]);
        setStaffPerformance([]);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [range, customFrom, customTo]);

  const filteredPayments = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return payments;
    return payments.filter((r) => r.type.toLowerCase().includes(s));
  }, [search, payments]);

  const pagedPayments =
    rpp1 > 0
      ? filteredPayments.slice(page1 * rpp1, page1 * rpp1 + rpp1)
      : filteredPayments;

  // 🔹 Orders are already filtered by range/from/to in backend
  const filteredOrders = useMemo(() => orders, [orders]);

  const pagedOrders =
    rpp2 > 0
      ? filteredOrders.slice(page2 * rpp2, page2 * rpp2 + rpp2)
      : filteredOrders;

  function onRowClick(order) {
    setSelectedOrder(order);
  }

  /* ---------------------- Shared Excel / CSV builder ---------------------- */
  const buildSalesExcelCsv = ({
    rangeText,
    categoryTop5Data,
    categorySeriesData,
    paymentsData,
    bestSellerData,
    staffPerformanceData,
    ordersData,
    preparedBy,
  }) => {
    const reportInfo = {
      title: "Sales Report",
      dateRange: rangeText,
      generatedAt: new Date().toLocaleString(),
    };

    const convertToCSV = (data, headers) => {
      if (!data || data.length === 0) return "";
      const csvHeaders = headers.map((h) => `"${h.label}"`).join(",");
      const csvRows = data.map((row) =>
        headers
          .map((h) => {
            const value = row[h.key] ?? "";
            return `"${String(value).replace(/"/g, '""')}"`;
          })
          .join(",")
      );
      return [csvHeaders, ...csvRows].join("\n");
    };

    const categoryCSV = convertToCSV(
      categoryTop5Data.map((row, idx) => ({
        rank: idx + 1,
        name: row.name,
        net: row.net,
      })),
      [
        { label: "Rank", key: "rank" },
        { label: "Category", key: "name" },
        { label: "Net Sales", key: "net" },
      ]
    );

    const paymentsCSV = convertToCSV(paymentsData, [
      { label: "Payment Type", key: "type" },
      { label: "Payment Transactions", key: "tx" },
      { label: "Refund Transactions", key: "refundTx" },
      { label: "Net Amount", key: "net" },
    ]);

    const bestSellerCSV = convertToCSV(bestSellerData, [
      { label: "Rank", key: "rank" },
      { label: "Item Name", key: "name" },
      { label: "Total Orders", key: "orders" },
      { label: "Total Sales", key: "sales" },
    ]);

    const ordersCSV = convertToCSV(ordersData, [
      { label: "Receipt No", key: "id" },
      { label: "Date", key: "date" },
      { label: "Employee", key: "employee" },
      { label: "Type", key: "type" },
      { label: "Total", key: "total" },
    ]);

    const staffCSV = convertToCSV(staffPerformanceData, [
      { label: "Shift No.", key: "shiftNo" },
      { label: "Staff Name", key: "staffName" },
      { label: "Date", key: "date" },
      { label: "Starting Cash", key: "startingCash" },
      { label: "Cash In/Out", key: "cashInOut" },
      { label: "Count Cash", key: "countCash" },
      { label: "Actual Cash", key: "actualCash" },
      { label: "Remarks", key: "remarks" },
    ]);

    const chartCSV =
      categorySeriesData && categorySeriesData.length > 0
        ? categorySeriesData.map((item) => `"${item.x}","${item.y}"`).join("\n")
        : "";

    const fullCSV = `Sales Report - ${reportInfo.dateRange}
    Generated: ${reportInfo.generatedAt}

    TOP 5 CATEGORIES
    ${categoryCSV || "No data"}

    SALES BY PAYMENT TYPE
    ${paymentsCSV || "No data"}

    BEST SELLERS
    ${bestSellerCSV || "No data"}

    ORDERS
    ${ordersCSV || "No data"}

    STAFF PERFORMANCE
    ${staffCSV || "No data"}

    SALES CHART DATA
    Date,Amount
    ${chartCSV || ""}

    ${preparedBy || "Prepared by: N/A"}`;

    return fullCSV;
  };

  const triggerExcelDownload = (csv, label) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `sales-report-${label.replace(/\s+/g, "-")}-${Date.now()}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* -------------------------- Excel Export (current) -------------------------- */
  const handleExcelExportCurrent = () => {
    const csv = buildSalesExcelCsv({
      rangeText: currentRangeLabel,
      categoryTop5Data: categoryTop5,
      categorySeriesData: categorySeries,
      paymentsData: payments,
      bestSellerData: bestSeller,
      staffPerformanceData: staffPerformance,
      ordersData: filteredOrders,
      preparedBy,
    });

    triggerExcelDownload(csv, currentRangeLabel);
  };

  /* ---------------------- Excel Export (custom from dialog) ---------------------- */
  const handleExcelExportRange = async () => {
    if (excelRange === "custom" && (!excelFrom || !excelTo)) {
      setExcelError("Please select both From and To dates.");
      return;
    }

    setExcelError("");
    setExcelLoading(true);

    try {
      const qs =
        excelRange === "custom"
          ? `range=custom&from=${excelFrom}&to=${excelTo}`
          : `range=${excelRange}`;

      const [c1, c2, p, b, o, sp] = await Promise.all([
        fetch(`/api/reports/category-top5?${qs}`).then((r) => r.json()),
        fetch(`/api/reports/category-series?${qs}`).then((r) => r.json()),
        fetch(`/api/reports/payments?${qs}`).then((r) => r.json()),
        fetch(`/api/reports/best-sellers?${qs}`).then((r) => r.json()),
        fetch(`/api/reports/orders?${qs}`).then((r) => r.json()),
        fetch(`/api/reports/staff-performance?${qs}`).then((r) => r.json()),
      ]);

      const categoryTop5Data = c1?.ok ? c1.data || [] : [];
      const categorySeriesData = c2?.ok ? c2.data || [] : [];
      const paymentsData = p?.ok ? p.data || [] : [];
      const bestSellerData = b?.ok ? b.data || [] : [];
      const ordersData = o?.ok ? o.data || [] : [];
      const staffPerformanceData = sp?.ok ? sp.data || [] : [];

      const label =
        excelRange === "custom"
          ? `${excelFrom} – ${excelTo}`
          : formatRangePresetLabel(excelRange);

      const csv = buildSalesExcelCsv({
        rangeText: label,
        categoryTop5Data,
        categorySeriesData,
        paymentsData,
        bestSellerData,
        staffPerformanceData,
        ordersData,
        preparedBy,
      });

      triggerExcelDownload(csv, label);
      setExcelDialogOpen(false);
    } catch (err) {
      console.error("[reports] custom excel failed", err);
      setExcelError("Failed to generate Excel. Please try again.");
    } finally {
      setExcelLoading(false);
    }
  };

  const handleExcelDialogConfirm = async () => {
    if (excelMode === "current") {
      setExcelDialogOpen(false);
      handleExcelExportCurrent();
    } else {
      await handleExcelExportRange();
    }
  };

  /* ------------------ Shared PDF builder (uses passed data) ------------------ */
  const buildSalesPdf = async ({
    rangeText,
    categoryTop5Data,
    categorySeriesData,
    paymentsData,
    bestSellerData,
    staffPerformanceData,
    preparedBy,
  }) => {
    const totalSales = paymentsData.reduce((sum, p) => sum + (p.net || 0), 0);
    const totalOrders = paymentsData.reduce((sum, p) => sum + (p.tx || 0), 0);
    const bestItem = bestSellerData[0];
    const customerCount = totalOrders * 2 + 18; // placeholder

    const dailyRows = categorySeriesData.map((d, idx) => {
      const avgOrdersPerDay =
        categorySeriesData.length > 0
          ? Math.round(totalOrders / categorySeriesData.length)
          : 0;
      const retail = d.y;
      const discountedOrders = idx === 0 ? 2 : idx === 2 ? 5 : 0; // still mock
      const totalRevenue = d.y;
      const totalProfit = d.y * 0.4;

      return {
        date: d.x,
        totalOrders: avgOrdersPerDay,
        retail,
        discountedOrders,
        totalRevenue,
        totalProfit,
      };
    });

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    let cursorY = 48;

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

    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.text("Quscina", pageWidth / 2, cursorY, { align: "center" });
    cursorY += 26;

    doc.setFont("times", "normal");
    doc.setFontSize(20);
    doc.text("Sales report", pageWidth / 2, cursorY, { align: "center" });
    cursorY += 32;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    doc.setFont(undefined, "bold");
    doc.text("Report Date range:", 72, cursorY);
    doc.setFont(undefined, "normal");
    doc.text(rangeText, 180, cursorY);
    cursorY += 16;

    doc.setFont(undefined, "bold");
    doc.text("Branch:", 72, cursorY);
    doc.setFont(undefined, "normal");
    doc.text("Kawit, Cavite", 120, cursorY);
    cursorY += 22;

    doc.setFont(undefined, "bold");
    doc.text("Sales Summary", 72, cursorY);
    cursorY += 14;

    doc.setFont(undefined, "normal");
    doc.text(`Total Sales: ${peso(totalSales)}`, 72, cursorY);
    cursorY += 14;
    doc.text(`Total Orders: ${totalOrders} Orders`, 72, cursorY);
    cursorY += 14;
    if (bestItem) {
      doc.text(
        `Best Selling Item: ${bestItem.name} (${bestItem.qty} Sold)`,
        72,
        cursorY
      );
      cursorY += 14;
    }
    doc.text(`Customer Count: ${customerCount} Customers`, 72, cursorY);
    cursorY += 26;

    doc.setFont(undefined, "bold");
    doc.text("Daily sales", 72, cursorY);
    cursorY += 8;

    autoTable(doc, {
      startY: cursorY + 8,
      head: [
        [
          "Date",
          "Total Orders",
          "Discounted Orders",
          "Total Revenue(Discount Included)",
          "Total Profit",
        ],
      ],
      body: dailyRows.map((r) => [
        r.date,
        r.totalOrders,
        formatNumberMoney(r.retail),
        r.discountedOrders,
        formatNumberMoney(r.totalRevenue),
        formatNumberMoney(r.totalProfit),
      ]),
      theme: "grid",
      styles: {
        fontSize: 9,
        cellPadding: 4,
      },
      headStyles: pdfHeadStyles,
      margin: { left: 72, right: 40 },
    });
    cursorY = doc.lastAutoTable.finalY + 24;

    doc.setFont("helvetica", "bold");
    doc.text("Sales Categories", 72, cursorY);
    cursorY += 8;

    autoTable(doc, {
      startY: cursorY + 8,
      head: [["Category", "Sales"]],
      body: categoryTop5Data.map((c) => [c.name, formatNumberMoney(c.net)]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: pdfHeadStyles,
      margin: { left: 72, right: 200 },
    });
    cursorY = doc.lastAutoTable.finalY + 24;

    doc.setFont("helvetica", "bold");
    doc.text("Payment Type", 72, cursorY);
    cursorY += 8;

    autoTable(doc, {
      startY: cursorY + 8,
      head: [["Payment Method", "Orders", "Refund Orders", "Net Sales"]],
      body: paymentsData.map((p) => [
        p.type,
        p.tx,
        p.refundTx,
        formatNumberMoney(p.net),
      ]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: pdfHeadStyles,
      margin: { left: 72, right: 40 },
    });
    cursorY = doc.lastAutoTable.finalY + 24;

    doc.setFont("helvetica", "bold");
    doc.text("Best Seller", 72, cursorY);
    cursorY += 8;

    autoTable(doc, {
      startY: cursorY + 8,
      head: [["Rank", "Item Name", "Total Orders", "Total Sales"]],
      body: bestSellerData.map((b) => [
        b.rank,
        b.name,
        b.orders,
        formatNumberMoney(b.sales),
      ]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: pdfHeadStyles,
      margin: { left: 72, right: 180 },
    });
    cursorY = doc.lastAutoTable.finalY + 24;

    doc.setFont("helvetica", "bold");
    doc.text("Staff Performance", 72, cursorY);
    cursorY += 8;

    autoTable(doc, {
      startY: cursorY + 8,
      head: [
        [
          "Shift No.",
          "Staff Name",
          "Date",
          "Starting Cash",
          "Cash In/Out",
          "Count Cash",
          "Actual Cash",
          "Remarks",
        ],
      ],
      body: staffPerformanceData.map((s) => {
        const dt = s.date ? new Date(s.date) : null;
        const dateText = dt
          ? dt.toLocaleString("en-PH", {
              month: "short",
              day: "2-digit",
              year: "numeric",
            })
          : s.date;

        return [
          s.shiftNo,
          s.staffName,
          dateText,
          formatNumberMoney(s.startingCash),
          s.cashInOut,
          formatNumberMoney(s.countCash),
          formatNumberMoney(s.actualCash),
          s.remarks,
        ];
      }),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: pdfHeadStyles,
      margin: { left: 72, right: 40 },
    });

    // 🔹 Prepared by footer
    const footerY = doc.lastAutoTable
      ? doc.lastAutoTable.finalY + 32
      : cursorY + 32;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(preparedBy || "Prepared by: N/A", 72, footerY);

    doc.save(`sales-report-${rangeText.replace(/\s+/g, "-")}.pdf`);
  };

  /* ---------------------------- PDF Export (current) ---------------------------- */
  const handlePdfExportCurrent = async () => {
    await buildSalesPdf({
      rangeText: currentRangeLabel,
      categoryTop5Data: categoryTop5,
      categorySeriesData: categorySeries,
      paymentsData: payments,
      bestSellerData: bestSeller,
      staffPerformanceData: staffPerformance,
      preparedBy,
    });
  };

  /* ------------------------ PDF Export (custom from dialog) ------------------------ */
  const handlePdfExportRange = async () => {
    if (pdfRange === "custom" && (!pdfFrom || !pdfTo)) {
      setPdfError("Please select both From and To dates.");
      return;
    }

    setPdfError("");
    setPdfLoading(true);

    try {
      const qs =
        pdfRange === "custom"
          ? `range=custom&from=${pdfFrom}&to=${pdfTo}`
          : `range=${pdfRange}`;

      const [c1, c2, p, b, sp] = await Promise.all([
        fetch(`/api/reports/category-top5?${qs}`).then((r) => r.json()),
        fetch(`/api/reports/category-series?${qs}`).then((r) => r.json()),
        fetch(`/api/reports/payments?${qs}`).then((r) => r.json()),
        fetch(`/api/reports/best-sellers?${qs}`).then((r) => r.json()),
        fetch(`/api/reports/staff-performance?${qs}`).then((r) => r.json()),
      ]);

      const categoryTop5Data = c1?.ok ? c1.data || [] : [];
      const categorySeriesData = c2?.ok ? c2.data || [] : [];
      const paymentsData = p?.ok ? p.data || [] : [];
      const bestSellerData = b?.ok ? b.data || [] : [];
      const staffPerformanceData = sp?.ok ? sp.data || [] : [];

      const label =
        pdfRange === "custom"
          ? `${pdfFrom} – ${pdfTo}`
          : formatRangePresetLabel(pdfRange);

      await buildSalesPdf({
        rangeText: label,
        categoryTop5Data,
        categorySeriesData,
        paymentsData,
        bestSellerData,
        staffPerformanceData,
        preparedBy,
      });

      setPdfDialogOpen(false);
    } catch (err) {
      console.error("[reports] custom pdf failed", err);
      setPdfError("Failed to generate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePdfDialogConfirm = async () => {
    if (pdfMode === "current") {
      setPdfDialogOpen(false);
      await handlePdfExportCurrent();
    } else {
      await handlePdfExportRange();
    }
  };

  return (
    <>
      <Box p={2} display="grid" gap={2} sx={{ overflowX: "hidden" }}>
        {/* Controls */}
        <Paper sx={{ p: 2, overflow: "hidden" }}>
          <Stack
            direction="row"
            useFlexGap
            alignItems="center"
            flexWrap="wrap"
            rowGap={1.5}
            columnGap={2}
          >
            {/* 🔸 Range preset dropdown */}
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="range-label">Range</InputLabel>
              <Select
                labelId="range-label"
                value={range}
                label="Range"
                onChange={(e) => {
                  const value = e.target.value;
                  setRange(value);
                  if (value !== "custom") {
                    setCustomFrom("");
                    setCustomTo("");
                  }
                }}
              >
                <MenuItem value="days">Day</MenuItem>
                <MenuItem value="weeks">Week</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="quarterly">Quarterly</MenuItem>
                <MenuItem value="yearly">Yearly</MenuItem>
                <MenuItem value="custom">Custom</MenuItem>
              </Select>
            </FormControl>

            {/* 🔸 Custom date range */}
            <TextField
              size="small"
              type="date"
              label="From"
              value={customFrom}
              onChange={(e) => {
                const value = e.target.value;
                if (range !== "custom") setRange("custom");
                setCustomFrom(value);
                setPage1(0);
                setPage2(0);
              }}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              size="small"
              type="date"
              label="To"
              value={customTo}
              onChange={(e) => {
                const value = e.target.value;
                if (range !== "custom") setRange("custom");
                setCustomTo(value);
                setPage1(0);
                setPage2(0);
              }}
              InputLabelProps={{ shrink: true }}
            />

            <Box sx={{ flexGrow: 1 }} />

            {/* 🔸 Export Buttons */}
            <Button
              variant="contained"
              color="success"
              startIcon={<GridOnIcon />}
              onClick={() => {
                setExcelError("");
                setExcelMode("current");
                setExcelRange(range);
                setExcelFrom("");
                setExcelTo("");
                setExcelDialogOpen(true);
              }}
            >
              Excel
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={<PictureAsPdfIcon />}
              onClick={() => {
                setPdfError("");
                setPdfMode("current");
                setPdfRange(range);
                setPdfFrom("");
                setPdfTo("");
                setPdfDialogOpen(true);
              }}
            >
              PDF
            </Button>
          </Stack>
        </Paper>

        {/* ================= Sales by Category ================= */}
        <Paper sx={{ p: 2, overflow: "hidden" }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            {/* Left panel */}
            <Box
              sx={{
                flex: { xs: "1 1 100%", md: "0 0 40%" },
                minWidth: { xs: 260, md: 360 },
              }}
            >
              <Typography fontWeight={700} mb={1}>
                Top 5 Category
              </Typography>

              <TableContainer
                component={Paper}
                elevation={0}
                className="scroll-x"
                sx={{
                  width: "100%",
                  borderRadius: 1,
                  overflowX: "auto",
                }}
              >
                <Table
                  stickyHeader
                  size="small"
                  sx={{
                    minWidth: 408,
                    tableLayout: "fixed",
                    ...comfyCells,
                  }}
                >
                  <colgroup>
                    <col style={{ width: 48 }} />
                    <col />
                    <col style={{ width: 140 }} />
                  </colgroup>

                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 48 }}>#</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell align="right">Net Sales</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {categoryTop5.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.name}
                        </TableCell>
                        <TableCell align="right">{peso(r.net)}</TableCell>
                      </TableRow>
                    ))}
                    {categoryTop5.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
                          No data for this range
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            <Divider
              orientation="vertical"
              flexItem
              sx={{ display: { xs: "none", md: "block" } }}
            />

            {/* Right panel: chart */}
            <Box
              sx={{
                flex: { xs: "1 1 100%", md: "0 0 60%" },
                minWidth: 300,
              }}
            >
              <Typography fontWeight={700} mb={1}>
                Sales by Category Chart
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, overflow: "hidden" }}>
                <Box sx={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart
                      data={categorySeries}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="x"
                        tick={{ fill: "#666", fontSize: 12 }}
                        axisLine={{ stroke: "#ccc" }}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          `₱${v.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}`
                        }
                        tick={{ fill: "#666", fontSize: 12 }}
                        axisLine={{ stroke: "#ccc" }}
                      />
                      <Tooltip
                        formatter={(value) =>
                          `₱${Number(value).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        }
                        labelStyle={{ fontWeight: 600 }}
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #ddd",
                          borderRadius: 8,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="y"
                        stroke={theme.palette.primary.main}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Box>
          </Stack>
        </Paper>

        {/* ================= Sales by Payment Type ================= */}
        <Paper sx={{ p: 2, overflow: "hidden" }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            mb={1}
            gap={2}
            flexWrap="wrap"
          >
            <Typography fontWeight={700}>Sales by Payment Type</Typography>
            <TextField
              size="small"
              placeholder="Search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage1(0);
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ width: { xs: "100%", sm: 300 } }}
            />
          </Stack>

          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{ width: "100%", borderRadius: 1, overflowX: "auto" }}
          >
            <Table
              stickyHeader
              sx={{
                minWidth: { xs: 720, sm: 900, md: 1080 },
                ...comfyCells,
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Payment Type</TableCell>
                  <TableCell>Payment Transactions</TableCell>
                  <TableCell>Refund Transactions</TableCell>
                  <TableCell>Net Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedPayments.map((r) => (
                  <TableRow key={r.type}>
                    <TableCell>{r.type}</TableCell>
                    <TableCell>{r.tx}</TableCell>
                    <TableCell>{r.refundTx}</TableCell>
                    <TableCell>{peso(r.net)}</TableCell>
                  </TableRow>
                ))}
                {pagedPayments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      No results
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredPayments.length}
            page={page1}
            onPageChange={(_, p) => setPage1(p)}
            rowsPerPage={rpp1}
            onRowsPerPageChange={(e) => {
              setRpp1(parseInt(e.target.value, 10));
              setPage1(0);
            }}
            rowsPerPageOptions={[5, 10, 25, { label: "All", value: -1 }]}
            labelRowsPerPage="Rows per page:"
          />
        </Paper>

        {/* ================= Best Seller ================= */}
        <Paper sx={{ p: 2, overflow: "hidden" }}>
          <Typography fontWeight={700} mb={1}>
            Best Seller
          </Typography>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{ width: "100%", borderRadius: 1, overflowX: "auto" }}
          >
            <Table
              stickyHeader
              sx={{
                minWidth: { xs: 720, sm: 900, md: 1080 },
                ...comfyCells,
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Rank</TableCell>
                  <TableCell>Item Name</TableCell>
                  <TableCell>Total Orders</TableCell>
                  <TableCell>Total Sales</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bestSeller.map((r) => (
                  <TableRow key={r.rank}>
                    <TableCell>{r.rank}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar
                          variant="rounded"
                          sx={{ width: 28, height: 28, fontSize: 12 }}
                        >
                          {r.name.slice(0, 1).toUpperCase()}
                        </Avatar>
                        <Typography>{r.name}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{r.orders}</TableCell>
                    <TableCell>{peso(r.sales)}</TableCell>
                  </TableRow>
                ))}
                {bestSeller.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      No data for this range
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* ================= Latest Order ================= */}
        {/* <Paper sx={{ p: 2, overflow: "hidden" }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" mb={2}>
            <MetricCard
              icon={<ReceiptLongIcon />}
              label="All Receipts"
              value={filteredOrders.length}
            />
            <MetricCard
              icon={<PaymentsIcon />}
              label="Sales"
              value={filteredOrders.filter((o) => o.type === "Sale").length}
              color="success"
            />
            <MetricCard
              icon={<ReplayIcon />}
              label="Refunds"
              value={filteredOrders.filter((o) => o.type === "Refund").length}
              color="error"
            />
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>

            <Box sx={{ flex: 2, minWidth: 300 }}>
              <TableContainer
                component={Paper}
                elevation={0}
                className="scroll-x"
                sx={{ width: "100%", borderRadius: 1, overflowX: "auto" }}
              >
                <Table
                  stickyHeader
                  sx={{
                    minWidth: { xs: 720, sm: 900, md: 1080 },
                    ...comfyCells,
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>Receipt no.</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Employee</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedOrders.map((r) => {
                      const dt = r.date ? new Date(r.date) : null;
                      const formattedDate = dt
                        ? dt.toLocaleString("en-PH", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : r.date;

                      return (
                        <TableRow
                          key={r.id}
                          hover
                          onClick={() => onRowClick(r)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell>{r.id}</TableCell>
                          <TableCell>{formattedDate}</TableCell>
                          <TableCell>{r.employee}</TableCell>
                          <TableCell>{r.type}</TableCell>
                          <TableCell align="right">{peso(r.total)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {pagedOrders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          No receipts in this range
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component="div"
                count={filteredOrders.length}
                page={page2}
                onPageChange={(_, p) => setPage2(p)}
                rowsPerPage={rpp2}
                onRowsPerPageChange={(e) => {
                  setRpp2(parseInt(e.target.value, 10));
                  setPage2(0);
                }}
                rowsPerPageOptions={[5, 10, 25, { label: "All", value: -1 }]}
                labelRowsPerPage="Rows per page:"
              />

              {isSmall && (
                <Box sx={{ mt: 2 }}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    {selectedOrder ? (
                      <ReceiptPreview order={selectedOrder} />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Select a receipt to view details
                      </Typography>
                    )}
                  </Paper>
                </Box>
              )}
            </Box>

            {!isSmall && (
              <Box sx={{ flex: 1, minWidth: 320 }}>
                <Paper
                  variant="outlined"
                  sx={{ p: 2, height: "100%", borderRadius: 2 }}
                >
                  {selectedOrder ? (
                    <ReceiptPreview order={selectedOrder} />
                  ) : (
                    <Box
                      sx={{
                        color: "text.secondary",
                        display: "grid",
                        placeItems: "center",
                        height: "100%",
                      }}
                    >
                      <Typography variant="body2">
                        Select a receipt to view details
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Box>
            )}
          </Stack>
        </Paper> */}
      </Box>

      {/* ================= PDF Range Dialog ================= */}
      <Dialog
        open={pdfDialogOpen}
        onClose={() => !pdfLoading && setPdfDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Export Sales Report (PDF)</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" mb={1.5}>
            Choose how you want to set the date range for the PDF.
          </Typography>

          <RadioGroup
            value={pdfMode}
            onChange={(e) => {
              setPdfMode(e.target.value);
              setPdfError("");
            }}
          >
            <FormControlLabel
              value="current"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    Use current report range
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {currentRangeLabel}
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              value="customRange"
              control={<Radio />}
              label={
                <Typography variant="body2" fontWeight={600}>
                  Choose date range for PDF
                </Typography>
              }
            />
          </RadioGroup>

          {pdfMode === "customRange" && (
            <>
              <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                <InputLabel id="pdf-range-label">PDF Range</InputLabel>
                <Select
                  labelId="pdf-range-label"
                  value={pdfRange}
                  label="PDF Range"
                  onChange={(e) => {
                    const val = e.target.value;
                    setPdfRange(val);
                    setPdfError("");
                    if (val !== "custom") {
                      setPdfFrom("");
                      setPdfTo("");
                    }
                  }}
                >
                  <MenuItem value="days">Today</MenuItem>
                  <MenuItem value="weeks">This Week</MenuItem>
                  <MenuItem value="monthly">This Month</MenuItem>
                  <MenuItem value="quarterly">This Quarter</MenuItem>
                  <MenuItem value="yearly">This Year</MenuItem>
                  <MenuItem value="custom">Custom Date Range</MenuItem>
                </Select>
              </FormControl>

              {pdfRange === "custom" && (
                <Stack direction="row" spacing={2} mt={1.5}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="From"
                    value={pdfFrom}
                    onChange={(e) => setPdfFrom(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="To"
                    value={pdfTo}
                    onChange={(e) => setPdfTo(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Stack>
              )}
            </>
          )}

          {pdfError && (
            <FormHelperText error sx={{ mt: 1 }}>
              {pdfError}
            </FormHelperText>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => !pdfLoading && setPdfDialogOpen(false)}
            disabled={pdfLoading}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handlePdfDialogConfirm}
            disabled={pdfLoading}
          >
            {pdfLoading ? "Generating..." : "Download PDF"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ================= Excel Range Dialog ================= */}
      <Dialog
        open={excelDialogOpen}
        onClose={() => !excelLoading && setExcelDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Export Sales Report (Excel)</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" mb={1.5}>
            Choose how you want to set the date range for the Excel file.
          </Typography>

          <RadioGroup
            value={excelMode}
            onChange={(e) => {
              setExcelMode(e.target.value);
              setExcelError("");
            }}
          >
            <FormControlLabel
              value="current"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    Use current report range
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {currentRangeLabel}
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              value="customRange"
              control={<Radio />}
              label={
                <Typography variant="body2" fontWeight={600}>
                  Choose date range for Excel
                </Typography>
              }
            />
          </RadioGroup>

          {excelMode === "customRange" && (
            <>
              <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                <InputLabel id="excel-range-label">Excel Range</InputLabel>
                <Select
                  labelId="excel-range-label"
                  value={excelRange}
                  label="Excel Range"
                  onChange={(e) => {
                    const val = e.target.value;
                    setExcelRange(val);
                    setExcelError("");
                    if (val !== "custom") {
                      setExcelFrom("");
                      setExcelTo("");
                    }
                  }}
                >
                  <MenuItem value="days">Today</MenuItem>
                  <MenuItem value="weeks">This Week</MenuItem>
                  <MenuItem value="monthly">This Month</MenuItem>
                  <MenuItem value="quarterly">This Quarter</MenuItem>
                  <MenuItem value="yearly">This Year</MenuItem>
                  <MenuItem value="custom">Custom Date Range</MenuItem>
                </Select>
              </FormControl>

              {excelRange === "custom" && (
                <Stack direction="row" spacing={2} mt={1.5}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="From"
                    value={excelFrom}
                    onChange={(e) => setExcelFrom(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="To"
                    value={excelTo}
                    onChange={(e) => setExcelTo(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Stack>
              )}
            </>
          )}

          {excelError && (
            <FormHelperText error sx={{ mt: 1 }}>
              {excelError}
            </FormHelperText>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => !excelLoading && setExcelDialogOpen(false)}
            disabled={excelLoading}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleExcelDialogConfirm}
            disabled={excelLoading}
          >
            {excelLoading ? "Generating..." : "Download Excel"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ------------------------- Small metric card ------------------------- */
function MetricCard({ icon, label, value, color = "default" }) {
  return (
    <Paper
      elevation={0}
      sx={{
        px: 2,
        py: 1.5,
        minWidth: 200,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Chip
          icon={icon}
          label={label}
          variant="outlined"
          color={color === "default" ? "default" : color}
        />
        <Box flexGrow={1} />
        <Typography fontWeight={800} fontSize="1.25rem">
          {value}
        </Typography>
      </Stack>
    </Paper>
  );
}

/* ------------------------- Receipt detail preview ------------------------- */
function ReceiptPreview({ order }) {
  const items = [{ name: "Pritong Manok", qty: 3, price: 220 }];
  const dt = order.date ? new Date(order.date) : null;

  const timeText = dt
    ? dt.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const dateText = dt
    ? dt.toLocaleString("en-PH", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : order.date;

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800} align="center">
        {peso(order.total)}
      </Typography>
      <Divider />

      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">Customer Name</Typography>
        <Typography variant="body2" fontWeight={700}>
          KYLA
        </Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">Time:</Typography>
        <Typography variant="body2" fontWeight={700}>
          {timeText}
        </Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">Employee:</Typography>
        <Typography variant="body2" fontWeight={700}>
          {order.employee}
        </Typography>
      </Stack>

      <Divider />

      <Typography variant="subtitle2" fontWeight={700}>
        Dine in
      </Typography>
      {items.map((it, idx) => (
        <Stack key={idx} direction="row" justifyContent="space-between">
          <Typography variant="body2">
            {it.name}
            <br />
            <span style={{ opacity: 0.7 }}>
              {it.qty} x {peso(it.price)}
            </span>
          </Typography>
          <Typography variant="body2" fontWeight={700}>
            {peso(it.qty * it.price)}
          </Typography>
        </Stack>
      ))}

      <Divider />

      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2" fontWeight={700}>
          Total
        </Typography>
        <Typography variant="body2" fontWeight={700}>
          {peso(order.total)}
        </Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">Payment:</Typography>
        <Typography variant="body2" fontWeight={700}>
          Cash
        </Typography>
      </Stack>

      <Divider />

      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">{dateText}</Typography>
        <Typography variant="body2">{order.id}</Typography>
      </Stack>
    </Stack>
  );
}