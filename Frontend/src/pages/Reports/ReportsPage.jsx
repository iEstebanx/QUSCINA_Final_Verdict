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
import GridOnIcon from "@mui/icons-material/GridOn"; // Excel icon
import { useAuth } from "@/context/AuthContext";

import dayjs from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";

import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

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

const DEFAULT_EXPORT = {
  dailySales: true,
  top5Items: true,
  paymentTypes: true,
  bestSellerCats: true,
  bestSellerItemsPerCat: true,
  shiftHistory: true,
};

/* ------------------------- Helpers for money formatting ------------------------- */
const formatNumberMoney = (n) =>
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const peso = (n) => `₱${formatNumberMoney(n)}`;

// PDF-safe: jsPDF default fonts can't reliably render ₱
const pdfMoney = (n) => `PHP ${formatNumberMoney(n)}`;

// Sanitize any text that may contain unsupported symbols (₱ becomes ± or ¤ in pdf)
const pdfSafeText = (v) => {
  if (v === null || v === undefined) return "";
  return String(v)
    .replaceAll("₱", "PHP ")
    .replaceAll("±", "PHP ")     // what ₱ often becomes in jsPDF
    .replaceAll("¤", "PHP ")
    .replaceAll("−", "-")        // minus variations
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replace(/\s+/g, " ")
    .trim();
};

const pdfHeadStyles = {
  fillColor: [230, 230, 230],
  textColor: [0, 0, 0],
  fontStyle: "bold",
};

/* --------------------------------- Page --------------------------------- */
export default function ReportsPage() {
  const { user } = useAuth();

  const [activeDays, setActiveDays] = useState([]);
  const [dateBounds, setDateBounds] = useState({ min: "", max: "" });

  const [exportOpen, setExportOpen] = useState(false);
  const [exportKind, setExportKind] = useState(null); // "pdf" | "excel"
  const [exportPick, setExportPick] = useState(DEFAULT_EXPORT);
  const [exportAll, setExportAll] = useState(true);

  const runExport = async () => {
    if (!ensureCustomRangeComplete()) return;

    const pick = exportAll ? DEFAULT_EXPORT : exportPick;

    let bestSellerTop5 = [];
    let bestSellerDetails = [];

    if (pick.bestSellerCats || pick.bestSellerItemsPerCat) {
      bestSellerTop5 = (bestSeller || []).slice(0, 5);
    }

    if (pick.bestSellerItemsPerCat) {
      bestSellerDetails = await fetchBestSellerExportDetails(bestSellerTop5);
    }

    if (exportKind === "excel") {
      const csv = buildSalesExcelCsv({
        rangeText: currentRangeLabel,
        categoryTop5Data: pick.top5Items ? categoryTop5 : [],
        categorySeriesData: pick.dailySales ? categorySeries : [],
        paymentsData: pick.paymentTypes ? payments : [],
        bestSellerData: pick.bestSellerCats ? bestSellerTop5 : [],
        bestSellerDetails: pick.bestSellerItemsPerCat ? bestSellerDetails : [],
        staffPerformanceData: pick.shiftHistory ? staffPerformance : [],
        preparedBy,
      });
      triggerExcelDownload(csv, currentRangeLabel);
    }

    if (exportKind === "pdf") {
      await buildSalesPdf({
        rangeText: currentRangeLabel,
        categoryTop5Data: pick.top5Items ? categoryTop5 : [],
        categorySeriesData: pick.dailySales ? categorySeries : [],
        paymentsData: pick.paymentTypes ? payments : [],
        bestSellerData: pick.bestSellerCats ? bestSellerTop5 : [],
        bestSellerDetails: pick.bestSellerItemsPerCat ? bestSellerDetails : [],
        staffPerformanceData: pick.shiftHistory ? staffPerformance : [],
        preparedBy,
      });
    }

    setExportOpen(false);
  };

  const exportKeys = [
    { key: "dailySales", label: "Daily Sales (Table)" },
    { key: "top5Items", label: "Top 5 Items" },
    { key: "paymentTypes", label: "Sales by Payment Type" },
    { key: "bestSellerCats", label: "Best Seller Categories (Top 5)" },
    { key: "bestSellerItemsPerCat", label: "Best Seller Items per Category (Top 5 each)" },
    { key: "shiftHistory", label: "Shift History" },
  ];

  const openExportDialog = (kind) => {
    setExportKind(kind);          // "pdf" | "excel"
    setExportAll(true);           // default = export all
    setExportPick(DEFAULT_EXPORT); // reset checkboxes
    setExportOpen(true);
  };

  const closeExportDialog = () => {
    setExportOpen(false);
  };

  useEffect(() => {
    let alive = true;

    async function loadBounds() {
      try {
        const resp = await fetch("/api/reports/date-bounds");
        const json = await resp.json();
        if (!alive) return;

        if (json?.ok && json.minDate && json.maxDate) {
          setDateBounds({ min: json.minDate, max: json.maxDate });
        }
      } catch (err) {
        console.error("[reports] date-bounds failed", err);
      }
    }

    loadBounds();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadActiveDays() {
      try {
        const resp = await fetch("/api/reports/active-days");
        const json = await resp.json();
        if (!alive) return;

        if (json?.ok && Array.isArray(json.days)) {
          const normalized = json.days
            .filter(Boolean)
            .map((d) => dayjs(d).format("YYYY-MM-DD"));
          setActiveDays(normalized);
        }
      } catch (err) {
        console.error("[reports] active-days failed", err);
      }
    }

    loadActiveDays();
    return () => {
      alive = false;
    };
  }, []);

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

  const [bestCatOpen, setBestCatOpen] = useState(false);
  const [bestCatLoading, setBestCatLoading] = useState(false);
  const [bestCatSelected, setBestCatSelected] = useState(null); // {categoryId, name, ...}
  const [bestCatTopItems, setBestCatTopItems] = useState([]);

  const bestSellerQS = useMemo(() => {
    return range === "custom" && customFrom && customTo
      ? `range=custom&from=${customFrom}&to=${customTo}`
      : `range=${range}`;
  }, [range, customFrom, customTo]);

  // 🔹 Text version of current filter range (used in dialog + PDF/Excel)
  const displayDate = (s) =>
  dayjs(s).isValid() ? dayjs(s).format("MM/DD/YYYY") : s;
  
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

  const activeDaySet = useMemo(
    () => new Set(activeDays),
    [activeDays]
  );

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
          fetch(`/api/reports/items-top5?${qs}`).then((r) => r.json()),
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
    bestSellerDetails,
    staffPerformanceData,
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
      (categoryTop5Data || []).map((row, idx) => ({
        rank: idx + 1,
        name: row.name,
        net: row.net,
      })),
      [
        { label: "Rank", key: "rank" },
        { label: "Item", key: "name" },
        { label: "Net Sales", key: "net" },
      ]
    );

    const paymentsCSV = convertToCSV(paymentsData || [], [
      { label: "Payment Type", key: "type" },
      { label: "Payment Transactions", key: "tx" },
      { label: "Refund Transactions", key: "refundTx" },
      { label: "Net Amount", key: "net" },
    ]);

    const bestSellerCSV = convertToCSV(bestSellerData || [], [
      { label: "Rank", key: "rank" },
      { label: "Category", key: "name" },
      { label: "Total Orders", key: "orders" },
      { label: "Total Sales", key: "sales" },
    ]);

    const bestSellerDetailsCSV = (bestSellerDetails || [])
      .map((cat) => {
        const header = `\nCATEGORY: ${cat.rank}. ${cat.name} | Orders: ${cat.orders} | Sales: ${peso(cat.sales)}\n`;
        const items = cat.topItems || [];

        const itemsCsv = convertToCSV(
          items.map((it) => ({
            rank: it.rank,
            name: it.name,
            orders: it.orders,
            qty: it.qty,
            sales: peso(it.sales),
          })),
          [
            { label: "Rank", key: "rank" },
            { label: "Item", key: "name" },
            { label: "Orders", key: "orders" },
            { label: "Qty", key: "qty" },
            { label: "Sales", key: "sales" },
          ]
        );

        return header + (itemsCsv || "No data");
      })
      .join("\n");

    const staffCSV = convertToCSV(staffPerformanceData || [], [
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

  TOP 5 ITEMS
  ${categoryCSV || "No data"}

  SALES BY PAYMENT TYPE
  ${paymentsCSV || "No data"}

  BEST SELLER CATEGORIES (TOP 5)
  ${bestSellerCSV || "No data"}

  BEST SELLER ITEMS PER CATEGORY (TOP 5 EACH)
  ${bestSellerDetailsCSV || "No data"}

  SHIFT HISTORY
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

  const ensureCustomRangeComplete = () => {
    if (range === "custom" && (!customFrom || !customTo)) {
      alert("Please select both From and To dates for custom range.");
      return false;
    }
    return true;
  };

  /* ------------------ Shared PDF builder (uses passed data) ------------------ */
  const buildSalesPdf = async ({
    rangeText,
    categoryTop5Data,
    categorySeriesData,
    paymentsData,
    bestSellerData,
    bestSellerDetails,
    staffPerformanceData,
    preparedBy,
  }) => {
    const totalSales = paymentsData.reduce((sum, p) => sum + (p.net || 0), 0);
    const totalOrders = paymentsData.reduce((sum, p) => sum + (p.tx || 0), 0);
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

    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 60;

    function ensureSpace(requiredHeight = 80) {
      if (cursorY + requiredHeight > pageHeight - bottomMargin) {
        doc.addPage();
        cursorY = 72;
      }
    }

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
    doc.text(`Total Sales: ${pdfMoney(totalSales)}`, 72, cursorY);
    cursorY += 14;
    doc.text(`Total Orders: ${totalOrders} Orders`, 72, cursorY);
    cursorY += 14;

    const bestItem = (categoryTop5Data || [])[0];

    if (bestItem) {
      doc.text(
        `Best Selling Item: ${bestItem.name} (${pdfMoney(bestItem.net)})`,
        72,
        cursorY
      );
      cursorY += 14;
    }

    doc.text(`Customer Count: ${customerCount} Customers`, 72, cursorY);
    cursorY += 26;

    // DAILY SALES
    if (categorySeriesData?.length) {
      doc.setFont(undefined, "bold");
      doc.text("Daily sales", 72, cursorY);
      cursorY += 8;

      autoTable(doc, {
        startY: cursorY + 8,
        head: [[
          "Date",
          "Total Orders",
          "Discounted Orders",
          "Total Revenue(Discount Included)",
          "Total Profit",
        ]],
        body: dailyRows.map((r) => [
          r.date,
          r.totalOrders,
          formatNumberMoney(r.retail),
          r.discountedOrders,
          formatNumberMoney(r.totalRevenue),
          formatNumberMoney(r.totalProfit),
        ]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: pdfHeadStyles,
        margin: { left: 72, right: 40 },
      });

      cursorY = doc.lastAutoTable.finalY + 24;
    }

    // TOP 5 ITEMS
    if (categoryTop5Data?.length) {
      doc.setFont("helvetica", "bold");
      doc.text("Top 5 Items", 72, cursorY);
      cursorY += 8;

      autoTable(doc, {
        startY: cursorY + 8,
        head: [["Rank", "Item", "Net Sales"]],
        body: (categoryTop5Data || []).map((it, idx) => [
          idx + 1,
          it.name,
          pdfMoney(it.net),
        ]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: pdfHeadStyles,
        margin: { left: 72, right: 180 },
      });

      cursorY = doc.lastAutoTable.finalY + 24;
    }

    /* ===================== INSERT START: BEST SELLERS ===================== */

    // Best Seller Categories (Top 5)
    if (bestSellerData?.length) {
      doc.setFont("helvetica", "bold");
      doc.text("Best Seller Categories (Top 5)", 72, cursorY);
      cursorY += 8;

      autoTable(doc, {
        startY: cursorY + 8,
        head: [["Rank", "Category", "Total Orders", "Total Sales"]],
        body: (bestSellerData || []).slice(0, 5).map((c) => [
          c.rank,
          c.name,
          c.orders,
          pdfMoney(c.sales),
        ]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: pdfHeadStyles,
        margin: { left: 72, right: 40 },
      });

      cursorY = doc.lastAutoTable.finalY + 18;
    }

    // Best Seller Items per Category (Top 5 each)
    if (bestSellerDetails?.length) {
      const bestDetails = (bestSellerDetails || []).slice(0, 5);

      bestDetails.forEach((cat) => {
        ensureSpace(110);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(`${cat.rank}. ${cat.name}`, 72, cursorY);
        cursorY += 14;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Orders: ${cat.orders}   •   Sales: ${pdfMoney(cat.sales)}`, 72, cursorY);
        cursorY += 10;

        autoTable(doc, {
          startY: cursorY,
          head: [["#", "Item", "Orders", "Qty", "Sales"]],
          body: (cat.topItems || []).map((it) => [
            it.rank,
            it.name,
            it.orders,
            it.qty,
            pdfMoney(it.sales),
          ]),
          theme: "grid",
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: pdfHeadStyles,
          margin: { left: 72, right: 40 },
          pageBreak: "auto",
        });

        cursorY = doc.lastAutoTable.finalY + 22;
      });
    }

    // Payments
    if (paymentsData?.length) {
      doc.setFont("helvetica", "bold");
      doc.text("Payment Type", 72, cursorY);
      cursorY += 8;

      autoTable(doc, {
        startY: cursorY + 8,
        head: [["Payment Method", "Orders", "Refund Orders", "Net Sales"]],
        body: paymentsData.map((p) => [p.type, p.tx, p.refundTx, pdfMoney(p.net)]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: pdfHeadStyles,
        margin: { left: 72, right: 40 },
      });

      cursorY = doc.lastAutoTable.finalY + 24;
    }

    // Shift History
    if (staffPerformanceData?.length) {
      doc.setFont("helvetica", "bold");
      doc.text("Shift History", 72, cursorY);
      cursorY += 8;

      autoTable(doc, {
        startY: cursorY + 8,
        head: [[
          "Shift No.",
          "Staff Name",
          "Date",
          "Starting Cash",
          "Cash In/Out",
          "Count Cash",
          "Actual Cash",
          "Remarks",
        ]],
        body: staffPerformanceData.map((s) => {
          const dt = s.date ? new Date(s.date) : null;
          const dateText = dt
            ? dt.toLocaleString("en-PH", { month: "short", day: "2-digit", year: "numeric" })
            : s.date;

          return [
            s.shiftNo,
            s.staffName,
            dateText,
            pdfMoney(s.startingCash),
            pdfSafeText(s.cashInOut),
            pdfMoney(s.countCash),
            pdfMoney(s.actualCash),
            pdfSafeText(s.remarks),
          ];
        }),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: pdfHeadStyles,
        margin: { left: 72, right: 40 },
      });
    }

    // 🔹 Prepared by footer
    const footerY = doc.lastAutoTable
      ? doc.lastAutoTable.finalY + 32
      : cursorY + 32;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(preparedBy || "Prepared by: N/A", 72, footerY);

    doc.save(`sales-report-${rangeText.replace(/\s+/g, "-")}.pdf`);
  };

  async function openBestCategory(row) {
    setBestCatSelected(row);
    setBestCatTopItems([]);
    setBestCatOpen(true);
    setBestCatLoading(true);

    try {
      const resp = await fetch(
        `/api/reports/best-sellers/${row.categoryId}/top-items?${bestSellerQS}`
      );
      const json = await resp.json();
      setBestCatTopItems(json?.ok ? json.data || [] : []);
    } catch (e) {
      console.error("[best category top-items] failed", e);
      setBestCatTopItems([]);
    } finally {
      setBestCatLoading(false);
    }
  }

  function closeBestCategoryDialog() {
    setBestCatOpen(false);
    setBestCatSelected(null);
    setBestCatTopItems([]);
    setBestCatLoading(false);
  }

  async function fetchBestSellerExportDetails(topCats) {
    const top5Cats = (topCats || []).slice(0, 5);

    const results = await Promise.all(
      top5Cats.map(async (cat) => {
        if (!cat || cat.categoryId === undefined || cat.categoryId === null) {
          return { ...cat, topItems: [] };
        }

        try {
          const resp = await fetch(
            `/api/reports/best-sellers/${cat.categoryId}/top-items?${bestSellerQS}`
          );
          const json = await resp.json();
          return { ...cat, topItems: json?.ok ? json.data || [] : [] };
        } catch (e) {
          console.error("[export best-seller top-items] failed", cat, e);
          return { ...cat, topItems: [] };
        }
      })
    );

    return results;
  }

  return (
    <>
      <Box p={2} display="grid" gap={2} sx={{ overflowX: "hidden" }}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
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
              <DatePicker
                label="From"
                views={["year", "month", "day"]}
                format="MM/DD/YYYY"           // 👈 DISPLAY FORMAT (MUI v6+)
                value={customFrom ? dayjs(customFrom) : null}
                onChange={(value) => {
                  if (!value) {
                    setCustomFrom("");
                    return;
                  }

                  // INTERNAL VALUE stays ISO
                  let s = value.format("YYYY-MM-DD");
                  const { min, max } = dateBounds;
                  if (min && s < min) s = min;
                  if (max && s > max) s = max;

                  if (range !== "custom") setRange("custom");
                  setCustomFrom(s);
                  setPage1(0);
                  setPage2(0);
                }}
                minDate={dateBounds.min ? dayjs(dateBounds.min) : undefined}
                maxDate={dateBounds.max ? dayjs(dateBounds.max) : undefined}
                shouldDisableDate={(day) => {
                  if (!activeDaySet.size) return false;
                  const key = day.format("YYYY-MM-DD");
                  return !activeDaySet.has(key);
                }}
                slotProps={{
                  textField: { size: "small" },
                }}
              />

              <DatePicker
                label="To"
                views={["year", "month", "day"]}
                format="MM/DD/YYYY"
                value={customTo ? dayjs(customTo) : null}
                onChange={(value) => {
                  if (!value) {
                    setCustomTo("");
                    return;
                  }

                  // INTERNAL stays ISO
                  let s = value.format("YYYY-MM-DD");
                  const { min, max } = dateBounds;
                  if (min && s < min) s = min;
                  if (max && s > max) s = max;

                  if (range !== "custom") setRange("custom");
                  setCustomTo(s);
                  setPage1(0);
                  setPage2(0);
                }}
                minDate={dateBounds.min ? dayjs(dateBounds.min) : undefined}
                maxDate={dateBounds.max ? dayjs(dateBounds.max) : undefined}
                shouldDisableDate={(day) => {
                  if (!activeDaySet.size) return false;
                  const key = day.format("YYYY-MM-DD");
                  return !activeDaySet.has(key);
                }}
                slotProps={{
                  textField: { size: "small" },
                }}
              />

              <Box sx={{ flexGrow: 1 }} />

              {/* Export Buttons */}
              <Button
                variant="contained"
                color="success"
                startIcon={<GridOnIcon />}
                onClick={() => openExportDialog("excel")}
              >
                Excel
              </Button>

              <Button
                variant="contained"
                color="error"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => openExportDialog("pdf")}
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
                  Top 5 Items
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
                  Sales by Item Chart
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

          {/* ================= Best Seller per Category================= */}
          <Paper sx={{ p: 2, overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1} gap={2}>
              <Typography fontWeight={700}>Best Seller per Category</Typography>
              <Chip size="small" label={`Range: ${currentRangeLabel}`} variant="outlined" />
            </Stack>

            <TableContainer
              component={Paper}
              elevation={0}
              className="scroll-x"
              sx={{ width: "100%", borderRadius: 1, overflowX: "auto" }}
            >
              <Table stickyHeader sx={{ minWidth: { xs: 720, sm: 900, md: 1080 }, ...comfyCells }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Rank</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Total Orders</TableCell>
                    <TableCell>Total Sales</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {bestSeller.map((r) => (
                    <TableRow
                      key={r.rank}
                      hover
                      onClick={() => {
                        if (!r.categoryId) return;
                        openBestCategory(r);
                      }}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{r.rank}</TableCell>

                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Avatar variant="rounded" sx={{ width: 28, height: 28, fontSize: 12 }}>
                            {(r.name || "?").slice(0, 1).toUpperCase()}
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

          {/* ================= Top 5 Items of Best Seller per Category ================= */}
          <Dialog
            open={bestCatOpen}
            onClose={closeBestCategoryDialog}
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={800} noWrap>
                  {bestCatSelected ? bestCatSelected.name : "Category"}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  Top 5 Items • {currentRangeLabel}
                </Typography>
              </Box>

              {bestCatSelected && (
                <Chip size="small" label={`₱${formatNumberMoney(bestCatSelected.sales)}`} />
              )}
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
              {bestCatLoading ? (
                <Box sx={{ p: 3, display: "grid", placeItems: "center" }}>
                  <CircularProgress size={28} />
                </Box>
              ) : (
                <Table size="small" sx={{ ...comfyCells }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 56 }}>#</TableCell>
                      <TableCell>Item</TableCell>
                      <TableCell sx={{ width: 120 }}>Orders</TableCell>
                      <TableCell sx={{ width: 140 }}>Sales</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {bestCatTopItems.map((it) => (
                      <TableRow key={it.rank} hover>
                        <TableCell>{it.rank}</TableCell>
                        <TableCell>
                          <Typography fontWeight={600}>{it.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {it.qty} qty
                          </Typography>
                        </TableCell>
                        <TableCell>{it.orders}</TableCell>
                        <TableCell>{peso(it.sales)}</TableCell>
                      </TableRow>
                    ))}

                    {bestCatTopItems.length === 0 && !bestCatLoading && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 3, color: "text.secondary" }}>
                          No items found for this category in this range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </DialogContent>

            <DialogActions>
              <Button onClick={closeBestCategoryDialog}>Close</Button>
            </DialogActions>
          </Dialog>

          {/* ================= Export Options Dialog ================= */}
          <Dialog open={exportOpen} onClose={closeExportDialog} fullWidth maxWidth="xs">
            <DialogTitle sx={{ fontWeight: 900 }}>
              Export {exportKind === "pdf" ? "PDF" : exportKind === "excel" ? "Excel" : ""}
            </DialogTitle>

            <DialogContent dividers>
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  Range: <b>{currentRangeLabel}</b>
                </Typography>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={exportAll}
                      onChange={(e) => setExportAll(e.target.checked)}
                    />
                  }
                  label="Export all sections"
                />

                <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, opacity: exportAll ? 0.55 : 1 }}>
                  <FormGroup>
                    {exportKeys.map((x) => (
                      <FormControlLabel
                        key={x.key}
                        control={
                          <Checkbox
                            disabled={exportAll}
                            checked={!!exportPick?.[x.key]}
                            onChange={(e) =>
                              setExportPick((prev) => ({
                                ...(prev || DEFAULT_EXPORT),
                                [x.key]: e.target.checked,
                              }))
                            }
                          />
                        }
                        label={x.label}
                      />
                    ))}
                  </FormGroup>

                  {!exportAll && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                      Tip: uncheck section you don’t want included in the export.
                    </Typography>
                  )}
                </Paper>
              </Stack>
            </DialogContent>

            <DialogActions>
              <Button onClick={closeExportDialog}>Cancel</Button>
              <Button
                variant="contained"
                onClick={runExport}
                disabled={!exportKind}
              >
                Export
              </Button>
            </DialogActions>
          </Dialog>

        </LocalizationProvider>
      </Box>
    </>
  );
}