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
import GridOnIcon from "@mui/icons-material/GridOn";
import { useAuth } from "@/context/AuthContext";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import dayjs from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";
import RefreshIcon from "@mui/icons-material/Refresh";

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

const RANGE_LABELS = {
  days: "Today",
  weeks: "This Week",
  monthly: "This Month",
  quarterly: "This Quarter",
  yearly: "This Year",
  custom: "Custom",
};

const DEFAULT_RANGE = "days"; // Day

const preventDateFieldWheelAndArrows = {
  onWheel: (e) => {
    // Prevent wheel from changing focused date section
    e.preventDefault();
    e.stopPropagation();
  },
  onKeyDown: (e) => {
    // Prevent ↑/↓ from incrementing day/month/year sections
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
    }
  },
};

// put near your other helpers
const hardNoTypeDateField = {
  // blocks text input + paste, but doesn't block clicking to open picker
  onBeforeInput: (e) => e.preventDefault(),
  onPaste: (e) => e.preventDefault(),
  onKeyDown: (e) => {
    // allow navigation keys so DatePicker can still behave normally
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
      // NOTE: ArrowUp/ArrowDown already blocked by preventDateFieldWheelAndArrows
    ]);

    if (allowed.has(e.key)) return;

    // block ANY character typing + edits
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      e.stopPropagation();
    }
  },
};

const startOfWeekMon = (d) => {
  const dow = d.day();
  return d.subtract((dow + 6) % 7, "day").startOf("day");
};

const getWeekRangeMonSun = (base = dayjs()) => {
  const monday = startOfWeekMon(base);
  const sunday = monday.add(6, "day").endOf("day");
  return { from: monday, to: sunday };
};

const getMonthRange = (year, monthIndex) => {
  const from = dayjs().year(year).month(monthIndex).date(1).startOf("day");
  const to = from.endOf("month").endOf("day");
  return { from, to };
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

const getSeriesSectionLabel = (range, customFrom, customTo) => {
  if (range === "custom") {
    const f = customFrom ? dayjs(customFrom).format("MM/DD/YYYY") : "";
    const t = customTo ? dayjs(customTo).format("MM/DD/YYYY") : "";
    return f && t ? `Sales (${f} – ${t})` : "Sales (Custom Range)";
  }

  // reuse your existing RANGE_LABELS mapping
  return `${RANGE_LABELS[range] || "Sales"} Sales`;
};

const getSeriesPeriodHeader = (range) => {
  switch (range) {
    case "weeks":
      return "Week";
    case "monthly":
      return "Month";
    case "quarterly":
      return "Quarter";
    case "yearly":
      return "Year";
    default:
      return "Date";
  }
};

// optional: make week labels nicer if backend returns YEARWEEK like 202601
const formatSeriesLabel = (range, x) => {
  if (range === "weeks") {
    const n = Number(x);
    if (!Number.isFinite(n)) return String(x);
    const year = Math.floor(n / 100);
    const week = String(n % 100).padStart(2, "0");
    return `${year}-W${week}`;
  }

  if (range === "monthly") {
    // x is "YYYY-MM"
    const d = dayjs(`${x}-01`);
    return d.isValid() ? d.format("MMM YYYY") : String(x);
  }

  return String(x);
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

  const [reloadTick, setReloadTick] = useState(0);

  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const blurOnFocus = (e) => {
    // kills the section highlight (MM/DD/YYYY) when MUI focuses the field on open/close
    e.target.blur?.();
  };

  const refreshReports = () => {
    // reset other UI states too
    setSearch("");
    setSelectedOrder(null);
    setBestCatOpen(false);
    setBestCatSelected(null);
    setBestCatTopItems([]);
    setBestCatLoading(false);

    // reset pagination
    setPage1(0);
    setPage2(0);

    // ✅ Reset to default range AND refresh From/To to default
    applyPresetRange(DEFAULT_RANGE);

    // force refetch
    setReloadTick((x) => x + 1);
  };


  const runExport = async () => {
    if (!ensureCustomRangeComplete()) return;

    // ✅ BLOCK EXPORT if no transactions for the selected range
    if (!hasTransactions) {
      alert("No transactions found for this date range. Export is disabled.");
      return;
    }

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
      await buildSalesExcelXlsx({
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

  // 🔹 Range preset (Day/Week/Monthly/etc. + Custom)
  const [range, setRange] = useState("days");

  // 🔹 Custom date range (YYYY-MM-DD from <input type="date" />)
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const exportKeys = useMemo(() => {
    const seriesLabel = `${getSeriesSectionLabel(range, customFrom, customTo)} (Table)`;

    return [
      { key: "dailySales", label: seriesLabel },
      { key: "top5Items", label: "Top 5 Items" },
      { key: "paymentTypes", label: "Sales by Payment Type" },
      { key: "bestSellerCats", label: "Best Seller Categories (Top 5)" },
      { key: "bestSellerItemsPerCat", label: "Best Seller Items per Category (Top 5 each)" },
      { key: "shiftHistory", label: "Shift History" },
    ];
  }, [range, customFrom, customTo]);

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

    const first =
      user.firstName || user.first_name || user.firstname || "";
    const last =
      user.lastName || user.last_name || user.lastname || "";

    const fullName = `${first} ${last}`.trim() || String(user.name || "").trim();

    const loginIdUsed =
      sessionStorage.getItem("qd_login_identifier") ||
      localStorage.getItem("qd_login_identifier") ||
      "";

    if (fullName && loginIdUsed) return `Prepared by: ${fullName} (${loginIdUsed})`;
    if (fullName) return `Prepared by: ${fullName}`;
    if (loginIdUsed) return `Prepared by: ${loginIdUsed}`;

    return `Prepared by: ${user.employeeId || user.username || user.email || "N/A"}`;
  }, [user]);

  const [search, setSearch] = useState("");
  const [page1, setPage1] = useState(0);
  const [rpp1, setRpp1] = useState(10);

  const [page2, setPage2] = useState(0);
  const [rpp2, setRpp2] = useState(10);

  const clampToBounds = (s) => {
    const { min, max } = dateBounds || {};
    let out = s;
    if (min && out < min) out = min;
    if (max && out > max) out = max;
    return out;
  };

  const getIsoWeekRange = (base = dayjs()) => {
    const dow = base.day(); // 0..6 (Sun..Sat)
    const monday = base.subtract((dow + 6) % 7, "day").startOf("day");
    const sunday = monday.add(6, "day").endOf("day");
    return { from: monday, to: sunday };
  };

function applyPresetRange(nextRange) {
  setRange(nextRange);

  const setFromTo = (from, to) => {
    const f = clampToBounds(from.format("YYYY-MM-DD"));
    const t = clampToBounds(to.format("YYYY-MM-DD"));
    setCustomFrom(f);
    setCustomTo(t);
  };

  if (nextRange === "days") {
    setFromTo(dayjs().startOf("day"), dayjs().endOf("day"));
    return;
  }

  if (nextRange === "weeks") {
    const { from, to } = getWeekRangeMonSun(dayjs());
    setWeekYear(dayjs().year());
    setWeekMonth(dayjs().month());
    setWeekKey(from.format("YYYY-MM-DD"));
    setFromTo(from, to);
    return;
  }

  if (nextRange === "monthly") {
    const { from, to } = getMonthRange(dayjs().year(), dayjs().month());
    setMonthYear(dayjs().year());
    setMonthIndex(dayjs().month());
    setFromTo(from, to);
    return;
  }

  if (nextRange === "quarterly") {
    const q = Math.floor(dayjs().month() / 3) * 3;
    const from = dayjs().month(q).date(1).startOf("day");
    const to = from.add(2, "month").endOf("month").endOf("day");
    setFromTo(from, to);
    return;
  }

  if (nextRange === "yearly") {
    setFromTo(
      dayjs().month(0).date(1).startOf("day"),
      dayjs().month(11).endOf("month").endOf("day")
    );
  }
}

useEffect(() => {
  // initialize once, after bounds arrive (so clamping works)
  if (!customFrom && !customTo) {
    applyPresetRange(DEFAULT_RANGE);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [dateBounds.min, dateBounds.max]);

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

const now = dayjs();

// 🔹 Available options (from backend)
const [availableYears, setAvailableYears] = useState([]);
const [availableMonthsByYear, setAvailableMonthsByYear] = useState({});
const [availableWeekKeys, setAvailableWeekKeys] = useState([]);

// 🔹 Week picker
const [weekYear, setWeekYear] = useState(now.year());
const [weekMonth, setWeekMonth] = useState(now.month());
const [weekKey, setWeekKey] = useState(startOfWeekMon(now).format("YYYY-MM-DD"));

// 🔹 Month picker
const [monthYear, setMonthYear] = useState(now.year());
const [monthIndex, setMonthIndex] = useState(now.month());

const yearOptions = availableYears.length ? availableYears : [now.year()];
const weekMonthOptions = availableMonthsByYear[weekYear] || [];
const monthOptions = availableMonthsByYear[monthYear] || [];

useEffect(() => {
  if (!monthOptions.length) return;

  if (!monthOptions.includes(monthIndex)) {
    const nextMonth = monthOptions[0];
    setMonthIndex(nextMonth);
    applySelectedMonth(monthYear, nextMonth);
  }
}, [monthYear, monthOptions]);

const applySelectedWeek = (y, m, key) => {
  const from = dayjs(key).startOf("day");
  const to = from.add(6, "day").endOf("day");

  setRange("weeks");
  setWeekYear(y);
  setWeekMonth(m);
  setWeekKey(key);

  setCustomFrom(from.format("YYYY-MM-DD"));
  setCustomTo(to.format("YYYY-MM-DD"));
};

const applySelectedMonth = (y, m) => {
  const { from, to } = getMonthRange(y, m);

  setRange("monthly");
  setMonthYear(y);
  setMonthIndex(m);

  setCustomFrom(from.format("YYYY-MM-DD"));
  setCustomTo(to.format("YYYY-MM-DD"));
};

const weekOptions = useMemo(() => {
  return (availableWeekKeys || []).map((key, i) => {
    const from = dayjs(key).startOf("day");
    const to = from.add(6, "day").endOf("day");
    return {
      key,
      from,
      to,
      label: `Week ${i + 1} (${from.format("MMM DD")}–${to.format("MMM DD")})`,
    };
  });
}, [availableWeekKeys]);

useEffect(() => {
  if (range !== "weeks") return;

  if (!weekOptions.some((w) => w.key === weekKey)) {
    const first = weekOptions[0];
    if (first) {
      setWeekKey(first.key);
      setCustomFrom(first.from.format("YYYY-MM-DD"));
      setCustomTo(first.to.format("YYYY-MM-DD"));
    } else {
      setWeekKey("");
      setCustomFrom("");
      setCustomTo("");
    }
  }
}, [range, weekOptions]); // (weekKey handled by the check)

useEffect(() => {
  if (weekMonthOptions.length && !weekMonthOptions.includes(weekMonth)) {
    const nextMonth = weekMonthOptions[0];
    setWeekMonth(nextMonth);

    // pick first available week in that month
    const firstKey = weekOptions[0]?.key || "";
    if (firstKey) applySelectedWeek(weekYear, nextMonth, firstKey);
  }
}, [weekYear, weekMonthOptions]);




const buildReportsQS = () => {
  // if we have explicit dates, always use custom
  if (customFrom && customTo) {
    return `range=custom&from=${customFrom}&to=${customTo}`;
  }
  return `range=${range}`;
};

useEffect(() => {
  fetch("/api/dashboard/available-years")
    .then((r) => r.json())
    .then((j) => j?.ok && setAvailableYears(j.years || []))
    .catch(() => setAvailableYears([]));
}, []);

useEffect(() => {
  const years = Array.from(new Set([weekYear, monthYear]));

  years.forEach((y) => {
    fetch(`/api/dashboard/available-months?year=${y}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) return;
        setAvailableMonthsByYear((p) => ({ ...p, [y]: j.months || [] }));
      });
  });
}, [weekYear, monthYear]);

useEffect(() => {
  if (range !== "weeks") return;

  fetch(`/api/dashboard/available-weeks?year=${weekYear}&month=${weekMonth}`)
    .then((r) => r.json())
    .then((j) => setAvailableWeekKeys(j?.weeks || []))
    .catch(() => setAvailableWeekKeys([]));
}, [range, weekYear, weekMonth]);

const bestSellerQS = useMemo(() => {
  const base = buildReportsQS();
  return `${base}&_=${reloadTick}`; // ✅ cache-buster
}, [range, customFrom, customTo, reloadTick]);

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
  }, [range, customFrom, customTo, reloadTick]);

  const activeDaySet = useMemo(
    () => new Set(activeDays),
    [activeDays]
  );

  /* ------------------------ Load REAL data from backend ------------------------ */
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const baseQs = buildReportsQS();

        // cache-buster so Refresh always re-fetches
        const qs = `${baseQs}&_=${reloadTick}`;

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
  }, [range, customFrom, customTo, reloadTick]);

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

  const txCount = useMemo(() => {
    return (payments || []).reduce(
      (sum, p) => sum + Number(p.tx || 0) + Number(p.refundTx || 0),
      0
    );
  }, [payments]);

  const hasTransactions = txCount > 0;

  /* ---------------------- Shared Excel / CSV builder ---------------------- */
  const ensureCustomRangeComplete = () => {
    if (range === "custom" && (!customFrom || !customTo)) {
      alert("Please select both From and To dates for custom range.");
      return false;
    }
    return true;
  };

  const buildSalesExcelXlsx = async ({
    rangeText,
    categoryTop5Data,
    categorySeriesData,
    paymentsData,
    bestSellerData,
    bestSellerDetails,
    staffPerformanceData,
    preparedBy,
  }) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Quscina POS";
    wb.created = new Date();

    // =========================
    // Sheet 1: REPORT (pretty)
    // =========================
    const ws = wb.addWorksheet("Sales Report", {
      views: [{ state: "frozen", ySplit: 6 }], // freeze header area
      pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    // Column widths (feel free to tweak)
    ws.columns = [
      { key: "c1", width: 6 },
      { key: "c2", width: 28 },
      { key: "c3", width: 16 },
      { key: "c4", width: 16 },
      { key: "c5", width: 16 },
      { key: "c6", width: 18 },
      { key: "c7", width: 24 },
    ];

    const moneyFmt = '"₱"#,##0.00';
    const dateFmt = "mmm dd, yyyy";

    const borderAll = {
      top: { style: "thin", color: { argb: "FFD0D0D0" } },
      left: { style: "thin", color: { argb: "FFD0D0D0" } },
      bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
      right: { style: "thin", color: { argb: "FFD0D0D0" } },
    };

    const fillHeader = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    const fillSection = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } }; // dark
    const fontSection = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };

    const setRow = (r, opts = {}) => {
      r.height = opts.height ?? r.height;
      r.eachCell({ includeEmpty: true }, (cell) => {
        if (opts.font) cell.font = opts.font;
        if (opts.fill) cell.fill = opts.fill;
        if (opts.alignment) cell.alignment = opts.alignment;
        if (opts.border) cell.border = opts.border;
      });
    };

    const mergeTitle = (rowNo, text) => {
      ws.mergeCells(`A${rowNo}:F${rowNo}`);
      const cell = ws.getCell(`A${rowNo}`);
      cell.value = text;
      cell.font = { bold: true, size: 18 };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    };

    const sectionTitle = (rowNo, text) => {
      ws.mergeCells(`A${rowNo}:F${rowNo}`);
      const cell = ws.getCell(`A${rowNo}`);
      cell.value = text;
      cell.fill = fillSection;
      cell.font = fontSection;
      cell.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(rowNo).height = 20;
    };

    const keyValue = (rowNo, k, v) => {
      ws.getCell(`A${rowNo}`).value = k;
      ws.getCell(`A${rowNo}`).font = { bold: true };
      ws.getCell(`B${rowNo}`).value = v;
      ws.mergeCells(`B${rowNo}:F${rowNo}`);
    };

    const tableHeader = (rowNo, headers) => {
      const row = ws.getRow(rowNo);
      headers.forEach((h, idx) => {
        const cell = row.getCell(idx + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = fillHeader;
        cell.border = borderAll;
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });
      row.height = 18;
    };

    const tableRow = (rowNo, values, { moneyCols = [], rightCols = [] } = {}) => {
      const row = ws.getRow(rowNo);
      values.forEach((val, idx) => {
        const col = idx + 1;
        const cell = row.getCell(col);
        cell.value = val ?? "";
        cell.border = borderAll;

        if (moneyCols.includes(col)) {
          cell.numFmt = moneyFmt;
          cell.alignment = { vertical: "middle", horizontal: "right" };
        } else if (rightCols.includes(col)) {
          cell.alignment = { vertical: "middle", horizontal: "right" };
        } else {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }
      });
      row.height = 16;
    };

    let r = 1;

    // Title + meta
    mergeTitle(r++, "QUSCINA • SALES REPORT");
    ws.getRow(r).height = 6; r++; // spacer

    keyValue(r++, "Date Range", rangeText || "N/A");
    keyValue(r++, "Generated At", new Date().toLocaleString("en-PH"));
    keyValue(r++, "Branch", "Kawit, Cavite"); // change if dynamic
    ws.getRow(r).height = 6; r++; // spacer

    // --------------------------
    // TOP 5 ITEMS
    // --------------------------
    sectionTitle(r++, "Top 5 Items");
    tableHeader(r++, ["Rank", "Item", "Net Sales"]);
    if ((categoryTop5Data || []).length) {
      categoryTop5Data.forEach((it, idx) => {
        tableRow(r++, [idx + 1, it.name, Number(it.net || 0)], { moneyCols: [3], rightCols: [1] });
      });
    } else {
      tableRow(r++, ["", "No data for this range", ""], {});
    }
    ws.getRow(r).height = 6; r++;

    // --------------------------
    // SALES BY PAYMENT TYPE
    // --------------------------
    sectionTitle(r++, "SALES BY PAYMENT TYPE");
    tableHeader(r++, ["Payment Type", "Payment Tx", "Refund Tx", "Net Amount"]);
    if ((paymentsData || []).length) {
      paymentsData.forEach((p) => {
        tableRow(
          r++,
          [p.type, Number(p.tx || 0), Number(p.refundTx || 0), Number(p.net || 0)],
          { moneyCols: [4], rightCols: [2, 3] }
        );
      });
    } else {
      tableRow(r++, ["No data", "", "", ""], {});
    }
    ws.getRow(r).height = 6; r++;

    // --------------------------
    // BEST SELLER CATEGORIES
    // --------------------------
    sectionTitle(r++, "BEST SELLER CATEGORIES (TOP 5)");
    tableHeader(r++, ["Rank", "Category", "Total Orders", "Total Sales"]);
    if ((bestSellerData || []).length) {
      (bestSellerData || []).slice(0, 5).forEach((c) => {
        tableRow(
          r++,
          [Number(c.rank || 0), c.name, Number(c.orders || 0), Number(c.sales || 0)],
          { moneyCols: [4], rightCols: [1, 3] }
        );
      });
    } else {
      tableRow(r++, ["", "No data for this range", "", ""], {});
    }
    ws.getRow(r).height = 6; r++;

    // --------------------------
    // BEST SELLER ITEMS PER CATEGORY
    // --------------------------
    sectionTitle(r++, "BEST SELLER ITEMS PER CATEGORY (TOP 5 EACH)");
    if ((bestSellerDetails || []).length) {
      (bestSellerDetails || []).slice(0, 5).forEach((cat) => {
        // mini header row for each category (merged)
        ws.mergeCells(`A${r}:F${r}`);
        const cell = ws.getCell(`A${r}`);
        cell.value = `${cat.rank}. ${cat.name}  •  Orders: ${cat.orders}  •  Sales: ₱${Number(cat.sales || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
        cell.font = { bold: true };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        r++;

        tableHeader(r++, ["#", "Item", "Orders", "Qty", "Sales"]);
        const items = cat.topItems || [];
        if (items.length) {
          items.forEach((it) => {
            tableRow(
              r++,
              [Number(it.rank || 0), it.name, Number(it.orders || 0), Number(it.qty || 0), Number(it.sales || 0)],
              { moneyCols: [5], rightCols: [1, 3, 4] }
            );
          });
        } else {
          tableRow(r++, ["", "No data", "", "", ""], {});
        }
        ws.getRow(r).height = 6; r++;
      });
    } else {
      ws.mergeCells(`A${r}:F${r}`);
      ws.getCell(`A${r}`).value = "No data for this range";
      r += 2;
    }

    // --------------------------
    // SHIFT HISTORY
    // --------------------------
    sectionTitle(r++, "SHIFT HISTORY");
    tableHeader(r++, ["Shift No.", "Staff Name", "Date", "Starting Cash", "Count Cash", "Actual Cash", "Remarks"]);
    // widen for this section using extra columns: we’ll use A..G by reusing A..F plus one more column
    // quick hack: write into A..G by direct getCell; ExcelJS allows it even if we set 6 cols
    const writeShiftRow = (rowNo, vals) => {
      const row = ws.getRow(rowNo);
      vals.forEach((val, idx) => {
        const cell = row.getCell(idx + 1);
        cell.value = val ?? "";
        cell.border = borderAll;
        cell.alignment = { vertical: "middle", horizontal: idx >= 3 && idx <= 5 ? "right" : "left" };
        if (idx >= 3 && idx <= 5) cell.numFmt = moneyFmt;
      });
      row.height = 16;
    };

    if ((staffPerformanceData || []).length) {
      (staffPerformanceData || []).forEach((s) => {
        const dt = s.date ? new Date(s.date) : null;
        writeShiftRow(r++, [
          s.shiftNo,
          s.staffName,
          dt ? dt : s.date,
          Number(s.startingCash || 0),
          Number(s.countCash || 0),
          Number(s.actualCash || 0),
          s.remarks || "",
        ]);
        // format date cell
        const dateCell = ws.getCell(`C${r - 1}`);
        if (dt) dateCell.numFmt = dateFmt;
      });
    } else {
      writeShiftRow(r++, ["", "No data for this range", "", "", "", "", ""]);
    }

    ws.getRow(r).height = 8; r++;

    // Footer
    ws.mergeCells(`A${r}:F${r}`);
    ws.getCell(`A${r}`).value = preparedBy || "Prepared by: N/A";
    ws.getCell(`A${r}`).font = { italic: true };
    ws.getCell(`A${r}`).alignment = { horizontal: "left" };

    // =========================
    // Sheet 2: Chart Data
    // =========================
    const ws2 = wb.addWorksheet("Chart Data", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws2.columns = [
      { header: getSeriesPeriodHeader(range), key: "x", width: 18 },
      { header: "Amount", key: "y", width: 16 },
    ];

    ws2.getRow(1).font = { bold: true };
    ws2.getRow(1).fill = fillHeader;

    (categorySeriesData || []).forEach((d) => {
      ws2.addRow({
        x: formatSeriesLabel(range, d.x),
        y: Number(d.y || 0),
      });
    });

    ws2.getColumn(2).numFmt = moneyFmt;

    // Download
    const buffer = await wb.xlsx.writeBuffer();
    const filename = `sales-report-${String(rangeText || "range").replace(/\s+/g, "-")}-${Date.now()}.xlsx`;
    saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
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

    // DAILY / PERIOD SALES
    if (categorySeriesData?.length) {
      doc.setFont(undefined, "bold");
      const seriesTitle = getSeriesSectionLabel(range, customFrom, customTo);
      const periodHeader = getSeriesPeriodHeader(range);

      doc.text(seriesTitle, 72, cursorY);
      cursorY += 8;

      autoTable(doc, {
        startY: cursorY + 8,
        head: [[
          periodHeader,
          "Total Orders",
          "Discounted Orders",
          "Total Revenue (Discount Included)",
          "Total Profit",
        ]],
        body: dailyRows.map((r) => [
          formatSeriesLabel(range, r.date),
          r.totalOrders,
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

              {range === "weeks" && (
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <FormControl size="small" sx={{ minWidth: 110 }}>
                    <InputLabel>Year</InputLabel>
                    <Select value={weekYear} label="Year" 
                      onChange={(e) => {
                        const y = +e.target.value;
                        setWeekYear(y);
                        const firstKey = buildWeeksForMonth(y, weekMonth)[0]?.key || "";
                        if (firstKey) applySelectedWeek(y, weekMonth, firstKey);
                      }}
                    >
                      {yearOptions.map((y) => (
                        <MenuItem key={y} value={y}>{y}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>Month</InputLabel>
                    <Select value={weekMonth} label="Month" onChange={(e) => setWeekMonth(+e.target.value)}>
                      {weekMonthOptions.map((m) => (
                        <MenuItem key={m} value={m}>
                          {dayjs().month(m).format("MMMM")}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Week</InputLabel>
                    <Select
                      value={weekKey}
                      label="Week"
                      onChange={(e) => applySelectedWeek(weekYear, weekMonth, e.target.value)}
                    >
                      {availableWeekKeys.map((k, i) => {
                        const f = dayjs(k);
                        const t = f.add(6, "day");
                        return (
                          <MenuItem key={k} value={k}>
                            Week {i + 1} ({f.format("MMM DD")}–{t.format("MMM DD")})
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                </Stack>
              )}

              {range === "monthly" && (
                <Stack direction="row" spacing={1}>
                  <FormControl size="small" sx={{ minWidth: 110 }}>
                    <InputLabel>Year</InputLabel>
                    <Select value={monthYear} label="Year" onChange={(e) => setMonthYear(+e.target.value)}>
                      {yearOptions.map((y) => (
                        <MenuItem key={y} value={y}>{y}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 160 }}>
                    <InputLabel>Month</InputLabel>
                    <Select
                      value={monthIndex}
                      label="Month"
                      onChange={(e) => applySelectedMonth(monthYear, +e.target.value)}
                    >
                      {monthOptions.map((m) => (
                        <MenuItem key={m} value={m}>
                          {dayjs().month(m).format("MMMM")}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              )}

              {/* 🔸 Custom date range */}
              <DatePicker
                label="From"
                views={["year", "month", "day"]}
                format="MM/DD/YYYY"
                value={customFrom ? dayjs(customFrom) : null}
                open={fromOpen}
                onOpen={() => setFromOpen(true)}
                onClose={() => {
                  setFromOpen(false);
                  requestAnimationFrame(() => document.activeElement?.blur?.());
                }}
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
                  setPage1(0);
                  setPage2(0);
                }}
                minDate={dateBounds.min ? dayjs(dateBounds.min) : undefined}
                maxDate={dateBounds.max ? dayjs(dateBounds.max) : undefined}
                shouldDisableDate={(day) => {
                  if (!activeDaySet.size) return false;
                  return !activeDaySet.has(day.format("YYYY-MM-DD"));
                }}
                slotProps={{
                  field: { readOnly: true },
                  textField: {
                    size: "small",
                    onMouseDown: (e) => {
                      e.preventDefault();
                      setFromOpen(true);
                    },
                    onFocus: blurOnFocus,
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
                  setPage1(0);
                  setPage2(0);
                }}
                minDate={dateBounds.min ? dayjs(dateBounds.min) : undefined}
                maxDate={dateBounds.max ? dayjs(dateBounds.max) : undefined}
                shouldDisableDate={(day) => {
                  if (!activeDaySet.size) return false;
                  return !activeDaySet.has(day.format("YYYY-MM-DD"));
                }}
                slotProps={{
                  field: { readOnly: true },
                  textField: {
                    size: "small",
                    onMouseDown: (e) => {
                      e.preventDefault();
                      setToOpen(true);
                    },
                    onFocus: blurOnFocus,
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

              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={refreshReports}
                sx={{ whiteSpace: "nowrap" }}
              >
                Refresh
              </Button>

              {/* Export Buttons */}
              <Button
                variant="contained"
                color="success"
                startIcon={<GridOnIcon />}
                disabled={!hasTransactions}
                onClick={() => openExportDialog("excel")}
              >
                Excel
              </Button>

              <Button
                variant="contained"
                color="error"
                startIcon={<PictureAsPdfIcon />}
                disabled={!hasTransactions}
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
                disabled={!exportKind || !hasTransactions}
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