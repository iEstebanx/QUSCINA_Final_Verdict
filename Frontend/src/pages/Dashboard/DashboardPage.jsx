// QUSCINA_BACKOFFICE/Frontend/src/pages/Dashboard/DashboardPage.jsx
import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  List,
  ListItem,
  ListItemText,
  useTheme,
  FormControl,
  InputLabel,
  useMediaQuery,
  Stack,
  Button,
  Chip,
  Card,
  CardContent,
} from "@mui/material";
import {
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import InventoryIcon from "@mui/icons-material/Inventory";
import PaymentIcon from "@mui/icons-material/Payment";
import PeopleIcon from "@mui/icons-material/People";
import { useNavigate } from "react-router-dom";
import { subscribeUsers } from "@/services/Users/users";
import { joinApi } from "@/utils/apiBase";

import dayjs from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// small date formatter for Last Login
const formatDateTime = (iso) => {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-PH", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }) +
      " • " +
      d.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  } catch {
    return "-";
  }
};

const startOfWeekMon = (d) => {
  const dow = d.day(); // 0..6 (Sun..Sat)
  return d.subtract((dow + 6) % 7, "day").startOf("day"); // Monday
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

// Returns [{ key: "YYYY-MM-DD", from: dayjsMonday, to: dayjsSunday, label: "Week 1 (Jan 01–Jan 07)" }, ...]
const buildWeeksForMonth = (year, monthIndex) => {
  const monthStart = dayjs().year(year).month(monthIndex).date(1).startOf("day");
  const monthEnd = monthStart.endOf("month").endOf("day");

  let cursor = startOfWeekMon(monthStart);
  const weeks = [];
  let i = 1;

  while (cursor.isBefore(monthEnd) || cursor.isSame(monthEnd, "day")) {
    const from = cursor;
    const to = cursor.add(6, "day").endOf("day");

    const label = `Week ${i} (${from.format("MMM DD")}–${to.format("MMM DD")})`;
    weeks.push({
      key: from.format("YYYY-MM-DD"), // monday key
      from,
      to,
      label,
    });

    cursor = cursor.add(7, "day");
    i += 1;

    // safety cap (should never hit)
    if (i > 6) break;
  }

  return weeks;
};

// Quick Stats Component (responsive: row on desktop, wrap on small screens)
// Quick Stats Component (center content inside cards)
const QuickStats = ({ metrics }) => (
  <Stack
    direction="row"
    spacing={1.5}
    useFlexGap
    flexWrap="wrap"
    justifyContent={{ xs: "flex-start", lg: "flex-end" }}
    alignItems="stretch"
    sx={{ height: "100%" }}
  >
    {/* Total Sales */}
    <Card
      sx={{
        minWidth: 140,
        flex: "1 1 140px",
        display: "flex",
      }}
    >
      <CardContent
        sx={{
          flex: 1,
          p: 1.25,
          "&:last-child": { pb: 1.25 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 0.25,
        }}
      >
        <Typography variant="h6" fontWeight="bold" color="primary">
          {peso(metrics.totalSales)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Total Sales
        </Typography>
      </CardContent>
    </Card>

    {/* Total Orders */}
    <Card
      sx={{
        minWidth: 140,
        flex: "1 1 140px",
        display: "flex",
      }}
    >
      <CardContent
        sx={{
          flex: 1,
          p: 1.25,
          "&:last-child": { pb: 1.25 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 0.25,
        }}
      >
        <Typography variant="h6" fontWeight="bold" color="secondary">
          {metrics.totalOrders}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Total Orders
        </Typography>
      </CardContent>
    </Card>

    {/* Total User Accounts */}
    <Card
      sx={{
        minWidth: 160,
        flex: "1 1 160px",
        display: "flex",
      }}
    >
      <CardContent
        sx={{
          flex: 1,
          p: 1.25,
          "&:last-child": { pb: 1.25 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 0.25,
        }}
      >
        <Typography variant="h6" fontWeight="bold" color="info.main">
          {metrics.customerCount}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Total User Accounts
        </Typography>
      </CardContent>
    </Card>
  </Stack>
);

export default function DashboardPage() {
  const theme = useTheme();
  const navigate = useNavigate();

  const isXs = useMediaQuery(theme.breakpoints.down("sm"));

  const [employees, setEmployees] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [lowStockErr, setLowStockErr] = useState("");

  // ------------------------ Date Range State ------------------------
  const [range, setRange] = useState("days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const [availableYears, setAvailableYears] = useState([]);
const [availableMonthsByYear, setAvailableMonthsByYear] = useState({});

// ------------------------ Best Seller (Dashboard inline) ------------------------
const [bestItemCategory, setBestItemCategory] = useState("all"); // "all" | "m:<id>" | "inv:<id>"
const [bestItemLimit, setBestItemLimit] = useState("10");       // "all" | "5" | "10" | "20"
const [bestItemSort, setBestItemSort] = useState("orders_desc");

const [bestSellerItems, setBestSellerItems] = useState([]);
const [bestSellerCategoryOptions, setBestSellerCategoryOptions] = useState([]);

const [reloadTick, setReloadTick] = useState(0); // optional, cache-buster

useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const resp = await fetch(joinApi("api/reports/best-seller-categories"), { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      if (!alive) return;

      const rows = json?.ok ? (json.data || []) : [];

      // Optional cleanup like your ReportsPage
      const cleaned = rows.filter((c) => {
        const name = String(c?.name ?? "").trim().toLowerCase();
        if (!name) return false;
        if (name === "uncategorized") return false;
        return true;
      });

      setBestSellerCategoryOptions(cleaned);
    } catch (e) {
      if (!alive) return;
      setBestSellerCategoryOptions([]);
    }
  })();

  return () => { alive = false; };
}, []);

useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const qs =
        customFrom && customTo
          ? `range=custom&from=${customFrom}&to=${customTo}`
          : `range=${range}`;

      const url =
        joinApi(`api/reports/best-seller-items?${qs}`) +
        `&categoryId=${encodeURIComponent(bestItemCategory)}` +
        `&limit=${encodeURIComponent(bestItemLimit)}` +
        `&_=${reloadTick}`;

      const resp = await fetch(url, { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      if (!alive) return;

      setBestSellerItems(json?.ok ? (json.data || []) : []);
    } catch (e) {
      if (!alive) return;
      setBestSellerItems([]);
    }
  })();

  return () => { alive = false; };
}, [range, customFrom, customTo, bestItemCategory, bestItemLimit, reloadTick]);

const sortedBestSellerItems = useMemo(() => {
  const arr = [...(bestSellerItems || [])];
  const num = (v) => Number(v || 0);

  const tieBreak = (a, b) => {
    const o = num(b.orders) - num(a.orders);
    if (o !== 0) return o;

    const s = num(b.sales) - num(a.sales);
    if (s !== 0) return s;

    return String(a.name || "").localeCompare(String(b.name || ""));
  };

  const cmpMap = {
    orders_desc: (a, b) => (num(b.orders) - num(a.orders)) || tieBreak(a, b),
    orders_asc:  (a, b) => (num(a.orders) - num(b.orders)) || tieBreak(a, b),
    sales_desc:  (a, b) => (num(b.sales) - num(a.sales)) || tieBreak(a, b),
    sales_asc:   (a, b) => (num(a.sales) - num(b.sales)) || tieBreak(a, b),
  };

  arr.sort(cmpMap[bestItemSort] || cmpMap.orders_desc);
  return arr;
}, [bestSellerItems, bestItemSort]);

const now = dayjs();

// Week picker state
const [weekYear, setWeekYear] = useState(now.year());
const [weekMonth, setWeekMonth] = useState(now.month()); // 0..11
const [weekKey, setWeekKey] = useState(startOfWeekMon(now).format("YYYY-MM-DD"));

// Month picker state
const [monthYear, setMonthYear] = useState(now.year());
const [monthIndex, setMonthIndex] = useState(now.month()); // 0..11

const [availableWeekKeys, setAvailableWeekKeys] = useState([]); // ["YYYY-MM-DD", ...]

const [activePieIndex, setActivePieIndex] = useState(-1);

const [txnMinDate, setTxnMinDate] = useState(null);
const [txnMaxDate, setTxnMaxDate] = useState(null);
const [activeDaysSet, setActiveDaysSet] = useState(() => new Set());

useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const [bRes, dRes] = await Promise.all([
        fetch(joinApi("api/dashboard/date-bounds"), { cache: "no-store" }),
        fetch(joinApi("api/dashboard/active-days"), { cache: "no-store" }),
      ]);

      const bData = await bRes.json().catch(() => ({}));
      const dData = await dRes.json().catch(() => ({}));

      if (!alive) return;

      if (bRes.ok && bData?.ok) {
        setTxnMinDate(bData.minDate ? dayjs(bData.minDate) : null);
        setTxnMaxDate(bData.maxDate ? dayjs(bData.maxDate) : null);
      }

      if (dRes.ok && dData?.ok) {
        const s = new Set((dData.days || []).map(String));
        setActiveDaysSet(s);
      }
    } catch (e) {
      console.error("[dashboard] active-days/date-bounds:", e);
      if (!alive) return;
      setTxnMinDate(null);
      setTxnMaxDate(null);
      setActiveDaysSet(new Set());
    }
  })();

  return () => {
    alive = false;
  };
}, []);

const shouldDisableTxnDate = (date) => {
  // Only enforce disabling when user is using CUSTOM picking
  if (range !== "custom") return false;

  if (!date || !dayjs(date).isValid()) return false;
  if (!activeDaysSet || activeDaysSet.size === 0) return false;

  const key = dayjs(date).format("YYYY-MM-DD");
  return !activeDaysSet.has(key);
};

const weekMonthOptions = availableMonthsByYear[weekYear] || [];
const monthOptions = availableMonthsByYear[monthYear] || [];

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

const yearOptions = availableYears.length ? availableYears : [dayjs().year()];

useEffect(() => {
  let alive = true;
  (async () => {
    try {
      const res = await fetch(joinApi("api/dashboard/available-years"), {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);

      if (!alive) return;

      const years = Array.isArray(data.years) ? data.years : [];
      setAvailableYears(years);

      // Optional: if current selected year isn't available, auto-fallback to newest
      if (years.length) {
        setWeekYear((cur) => (years.includes(cur) ? cur : years[0]));
        setMonthYear((cur) => (years.includes(cur) ? cur : years[0]));
      }
    } catch (e) {
      console.error("[dashboard] available-years:", e);
      if (!alive) return;
      setAvailableYears([]); // fallback: empty list
    }
  })();

  return () => {
    alive = false;
  };
}, []);

useEffect(() => {
  if (range !== "weeks") return;

  // if current weekKey isn't valid, auto-pick first available week
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
}, [range, weekOptions]);

useEffect(() => {
  let alive = true;

  const loadMonths = async (year) => {
    const res = await fetch(joinApi(`api/dashboard/available-months?year=${year}`), {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
    return Array.isArray(data.months) ? data.months : [];
  };

  (async () => {
    try {
      const yearsToLoad = Array.from(new Set([weekYear, monthYear]));

      const results = await Promise.all(
        yearsToLoad.map(async (y) => [y, await loadMonths(y)])
      );

      if (!alive) return;

      setAvailableMonthsByYear((prev) => {
        const next = { ...prev };
        for (const [y, months] of results) next[y] = months;
        return next;
      });
    } catch (e) {
      console.error("[dashboard] available-months:", e);
      if (!alive) return;
      // don’t wipe everything—just keep what you already have
    }
  })();

  return () => {
    alive = false;
  };
}, [weekYear, monthYear]);

useEffect(() => {
  if (weekMonthOptions.length && !weekMonthOptions.includes(weekMonth)) {
    const nextMonth = weekMonthOptions[0];
    setWeekMonth(nextMonth);

    const firstKey = buildWeeksForMonth(weekYear, nextMonth)[0]?.key || "";
    applySelectedWeek(weekYear, nextMonth, firstKey);
  }
}, [weekYear, weekMonthOptions]);

useEffect(() => {
  if (monthOptions.length && !monthOptions.includes(monthIndex)) {
    const nextMonth = monthOptions[0];
    setMonthIndex(nextMonth);
    applySelectedMonth(monthYear, nextMonth);
  }
}, [monthYear, monthOptions]);

useEffect(() => {
  let alive = true;

  // only when in weeks mode
  if (range !== "weeks") return;

  (async () => {
    try {
      const res = await fetch(
        joinApi(`api/dashboard/available-weeks?year=${weekYear}&month=${weekMonth}`),
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);

      if (!alive) return;
      setAvailableWeekKeys(Array.isArray(data.weeks) ? data.weeks : []);
    } catch (e) {
      console.error("[dashboard] available-weeks:", e);
      if (!alive) return;
      setAvailableWeekKeys([]);
    }
  })();

  return () => {
    alive = false;
  };
}, [range, weekYear, weekMonth]);

const applyPresetRange = (nextRange) => {
  setRange(nextRange);

  const setFromTo = (fromD, toD) => {
    setCustomFrom(fromD.format("YYYY-MM-DD"));
    setCustomTo(toD.format("YYYY-MM-DD"));
  };

  if (nextRange === "days") {
    const from = dayjs().startOf("day");
    const to = dayjs().endOf("day");
    setFromTo(from, to);
    return;
  }

  if (nextRange === "weeks") {
    // default to "current week" but user can change via selectors
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
    const qStartMonth = Math.floor(dayjs().month() / 3) * 3;
    const from = dayjs().month(qStartMonth).date(1).startOf("day");
    const to = from.add(2, "month").endOf("month").endOf("day");
    setFromTo(from, to);
    return;
  }

  if (nextRange === "yearly") {
    const from = dayjs().month(0).date(1).startOf("day");
    const to = dayjs().month(11).endOf("month").endOf("day");
    setFromTo(from, to);
    return;
  }
};

const applySelectedWeek = (y, m, key) => {
  const chosen = weekOptions.find((w) => w.key === key);
  if (!chosen) return;

  setRange("weeks");
  setWeekYear(y);
  setWeekMonth(m);
  setWeekKey(key);

  setCustomFrom(chosen.from.format("YYYY-MM-DD"));
  setCustomTo(chosen.to.format("YYYY-MM-DD"));
};

const applySelectedMonth = (y, m) => {
  const { from, to } = getMonthRange(y, m);

  setRange("custom"); // ✅ IMPORTANT: so backend uses from/to
  setMonthYear(y);
  setMonthIndex(m);

  setCustomFrom(from.format("YYYY-MM-DD"));
  setCustomTo(to.format("YYYY-MM-DD"));
};

const preventDateFieldWheelAndArrows = {
  onWheel: (e) => {
    // do NOT call preventDefault (wheel is passive in many cases)
    e.currentTarget.blur?.(); // optional: stop scroll-wheel "value change" style behavior
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

      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };

  const blurOnFocus = (e) => {
    e.target.blur?.();
  };

  useEffect(() => {
    // reuse the same live list as UserManagement
    const unsub = subscribeUsers(
      ({ rows }) => {
        const list = (rows || []).map((e) => ({
          id: e.employeeId,
          name: `${e.firstName || ""} ${e.lastName || ""}`.trim(),
          role: e.role,
          status: e.status,
          createdAt: e.createdAt,
          lastLoginAt: e.lastLoginAt,
        }));
        setEmployees(list);
      },
      {
        intervalMs: 10000, // or 5000, same as UserManagement
        onError: (msg) => {
          console.error("[dashboard] users list error:", msg);
          setEmployees([]);
        },
      }
    );

    return () => {
      // stop polling when dashboard unmounts
      if (typeof unsub === "function") unsub();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          joinApi("api/inventory/ingredients/low-stock"),
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok !== true) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        if (!alive) return;
        setLowStockItems(Array.isArray(data.items) ? data.items : []);
        setLowStockErr("");
      } catch (e) {
        console.error("[dashboard] low-stock:", e);
        if (!alive) return;
        setLowStockItems([]);
        setLowStockErr(e?.message || "Failed to load low stock");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ------------------------ LIVE DASHBOARD DATA (REAL) ------------------------
  const [salesSeries, setSalesSeries] = useState([]); // currently unused, reserved for future chart
  const [paymentData, setPaymentData] = useState([]);
  const [metrics, setMetrics] = useState({
    totalSales: 0,
    totalOrders: 0,
    averageOrder: 0,
  });

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const qs =
        customFrom && customTo
          ? `range=custom&from=${customFrom}&to=${customTo}`
          : `range=${range}`;

      try {
        // metrics
        const mRes = await fetch(
          joinApi(`api/dashboard/metrics?${qs}`) // ✅ use joinApi
        );
        const mData = await mRes.json();
        if (alive && mData.ok) setMetrics(mData.metrics);

        // sales series
        const sRes = await fetch(
          joinApi(`api/dashboard/sales-series?${qs}`) // ✅ use joinApi
        );
        const sData = await sRes.json();
        if (alive && sData.ok) setSalesSeries(sData.series);

        // payments
        const pRes = await fetch(
          joinApi(`api/dashboard/payments?${qs}`) // ✅ use joinApi
        );
        const pData = await pRes.json();
        if (alive && pData.ok) setPaymentData(pData.payments);
      } catch (err) {
        console.error("[dashboard load failed]", err);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [range, customFrom, customTo]);

  const metricsWithAccounts = {
    ...metrics,
    customerCount: employees.length,
  };

  /* ------------------------------ Improved Card Styles ------------------------------ */
  const cardSx = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    borderRadius: 2,
    overflow: "hidden",
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
  };

  const cardHeaderSx = {
    px: 2,
    py: 1.5,
    fontWeight: 800,
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
    display: "flex",
    alignItems: "center",
    gap: 1,
  };

const cardContentSx = {
  p: 2,
  flex: 1,
  minHeight: 0, // ✅ IMPORTANT for scroll containers inside
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

  // Reduced card heights for better content density
  const cardHeights = {
    xs: 320,
    sm: 340,
    md: 360,
  };

const tableCellSx = {
  py: 1.15,              // ✅ vertical padding
  px: 2,                 // ✅ horizontal padding
  borderBottom: `1px solid ${theme.palette.divider}`,
};

const tableCellFirstSx = {
  ...tableCellSx,
  pl: 2.5,               // ✅ extra left padding near rounded edge
};

const tableCellLastSx = {
  ...tableCellSx,
  pr: 2.5,               // ✅ extra right padding near rounded edge
};

const isCurrentWeek = () => {
  if (range !== "weeks") return false;
  const mondayKey = startOfWeekMon(dayjs()).format("YYYY-MM-DD");
  return String(weekKey) === String(mondayKey);
};

const isCurrentMonth = () => {
  const { from, to } = getMonthRange(dayjs().year(), dayjs().month());
  return (
    customFrom === from.format("YYYY-MM-DD") &&
    customTo === to.format("YYYY-MM-DD")
  );
};

const isCurrentYear = () => {
  const from = dayjs().month(0).date(1).startOf("day");
  const to = dayjs().month(11).endOf("month").endOf("day");
  return (
    customFrom === from.format("YYYY-MM-DD") &&
    customTo === to.format("YYYY-MM-DD")
  );
};

const rangeLabel = useMemo(() => {
  if (range === "days") return "Today";

  if (range === "weeks") {
    const mondayKey = startOfWeekMon(dayjs()).format("YYYY-MM-DD");
    return String(weekKey) === String(mondayKey) ? "This Week" : "Week";
  }

  if (range === "monthly") return isCurrentMonth() ? "This Month" : "Month";
  if (range === "quarterly") return "Quarter";
  if (range === "yearly") return isCurrentYear() ? "This Year" : "Year";

  return "Custom";
}, [range, weekKey, customFrom, customTo]);

  const EmptyState = ({ icon, title, description, hint }) => (
    <Box
      sx={{
        flex: 1,
        minHeight: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        px: 2,
      }}
    >
      <Box sx={{ maxWidth: 320 }}>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
          {icon}
        </Box>
        <Typography variant="body1" fontWeight={800} sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: hint ? 1 : 0 }}>
          {description}
        </Typography>
        {hint ? (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );

const PaymentTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const p = payload[0]?.payload || {};
  const name = p.name ?? "-";
  const value = p.value ?? 0;
  const amount = p.amount ?? null;
  const txns = p.transactions ?? null;

  return (
    <Box
      sx={{
        bgcolor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.5,
        px: 1.25,
        py: 0.9,
        boxShadow: 6,
        color: theme.palette.text.primary,
        minWidth: 160,
        pointerEvents: "none",
      }}
    >
      <Typography variant="subtitle2" fontWeight={800} noWrap>
        {name}
      </Typography>

      <Typography variant="body2" sx={{ mt: 0.25 }}>
        Share: <b>{Number(value).toFixed(0)}%</b>
      </Typography>

      {amount !== null && (
        <Typography variant="body2">
          Amount: <b>{peso(amount)}</b>
        </Typography>
      )}

      {txns !== null && (
        <Typography variant="body2">
          {Number(txns) === 1 ? "Transaction" : "Transactions"}: <b>{txns}</b>
        </Typography>
      )}
    </Box>
  );
};

  const dropdownMenuProps = {
    MenuListProps: { disablePadding: true },

    PaperProps: {
      className: "scroll-x",
      sx: (theme) => ({
        maxHeight: 320,
        "& .MuiList-root": { py: 0 },
        "& .MuiMenuItem-root": {
          px: 1.5,
          mx: -1.5,
          borderRadius: 0,
        },
        "& .MuiMenuItem-root.Mui-disabled": {
          px: 1.5,
          mx: -1.5,
          opacity: 1,
          color: "text.secondary",
          fontStyle: "italic",
        },
      }),
    },
  };

  return (
    <Box p={2}>
      {/* Top row: Date controls + quick stats BELOW it */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
        {/* Date Range Controls */}
        <Paper sx={{ p: 2 }}>
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
                renderValue={() => rangeLabel}
                onChange={(e) => applyPresetRange(e.target.value)}
              >
                {/* hidden display-only option so MUI never renders blank */}
                <MenuItem value="__custom__" disabled sx={{ display: "none" }}>
                  Custom
                </MenuItem>

                <MenuItem value="days">Today</MenuItem>
                <MenuItem value="weeks">Week</MenuItem>
                <MenuItem value="monthly">Month</MenuItem>
                <MenuItem value="quarterly">Quarter</MenuItem>
                <MenuItem value="yearly">Year</MenuItem>
              </Select>
            </FormControl>

            {/* Extra controls for Week/Month */}
            {range === "weeks" && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <FormControl size="small" sx={{ minWidth: 110 }}>
                  <InputLabel>Year</InputLabel>
                  <Select
                    label="Year"
                    value={weekYear}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      setWeekYear(y);
                    }}
                  >
                    {yearOptions.map((y) => (
                      <MenuItem key={y} value={y}>
                        {y}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Month</InputLabel>
                  <Select
                    label="Month"
                    value={weekMonth}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      setWeekMonth(m);
                    }}
                  >
                    {weekMonthOptions.length === 0 ? (
                      <MenuItem value={weekMonth} disabled>
                        No months with transactions
                      </MenuItem>
                    ) : (
                      weekMonthOptions.map((m) => (
                        <MenuItem key={m} value={m}>
                          {dayjs().month(m).format("MMMM")}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Week</InputLabel>
                  <Select
                    label="Week"
                    value={weekKey}
                    onChange={(e) =>
                      applySelectedWeek(weekYear, weekMonth, e.target.value)
                    }
                  >
                    {weekOptions.length === 0 ? (
                      <MenuItem value="" disabled>
                        No weeks with transactions
                      </MenuItem>
                    ) : (
                      weekOptions.map((w) => (
                        <MenuItem key={w.key} value={w.key}>
                          {w.label}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>
              </Stack>
            )}

            {range === "monthly" && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <FormControl size="small" sx={{ minWidth: 110 }}>
                  <InputLabel>Year</InputLabel>
                  <Select
                    label="Year"
                    value={monthYear}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      setMonthYear(y);
                      applySelectedMonth(y, monthIndex);
                    }}
                  >
                    {yearOptions.map((y) => (
                      <MenuItem key={y} value={y}>
                        {y}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Month</InputLabel>
                  <Select
                    label="Month"
                    value={monthIndex}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      setMonthIndex(m);
                      applySelectedMonth(monthYear, m);
                    }}
                  >
                    {monthOptions.length === 0 ? (
                      <MenuItem value={monthIndex} disabled>
                        No months with transactions
                      </MenuItem>
                    ) : (
                      monthOptions.map((m) => (
                        <MenuItem key={m} value={m}>
                          {dayjs().month(m).format("MMMM")}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>
              </Stack>
            )}

            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="From"
                views={["year", "month", "day"]}
                format="MM/DD/YYYY"
                minDate={txnMinDate}
                maxDate={txnMaxDate}
                shouldDisableDate={shouldDisableTxnDate}
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

                  const s = dayjs(value).format("YYYY-MM-DD");
                  if (range !== "custom") setRange("custom");
                  setCustomFrom(s);
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
                minDate={txnMinDate}
                maxDate={txnMaxDate}
                shouldDisableDate={shouldDisableTxnDate}
                value={customTo ? dayjs(customTo) : null}
                open={toOpen}
                onOpen={() => setToOpen(true)}
                onClose={() => {
                  setToOpen(false);
                  requestAnimationFrame(() => document.activeElement?.blur?.());
                }}
                onChange={(value) => {
                  if (value === null) {
                    setCustomTo("");
                    return;
                  }
                  if (!dayjs(value).isValid()) return;

                  const s = dayjs(value).format("YYYY-MM-DD");
                  if (range !== "custom") setRange("custom");
                  setCustomTo(s);
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
            </LocalizationProvider>
          </Stack>
        </Paper>

        {/* Quick Stats BELOW date controls now */}
        <Box sx={{ px: 0, mt: 0 }}>
          <QuickStats metrics={metricsWithAccounts} />
        </Box>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "stretch",
          gridTemplateColumns: "repeat(12, 1fr)",

          gridAutoRows: `${cardHeights.xs}px`,

          [theme.breakpoints.up("sm")]: {
            gridAutoRows: `${cardHeights.sm}px`,
          },
          [theme.breakpoints.up("md")]: {
            gridAutoRows: `${cardHeights.md}px`,
          },
        }}
      >
        {/* ============================ Best Sellers ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", lg: "span 8" } }}>
          <Paper sx={cardSx}>
            <Box sx={{ ...cardHeaderSx, justifyContent: "space-between" }}>
              <Typography variant="h6" fontWeight={800}>
                Best Sellers
              </Typography>

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <FormControl size="small" sx={{ minWidth: { xs: 160, sm: 220 } }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    label="Category"
                    value={bestItemCategory}
                    onChange={(e) => setBestItemCategory(e.target.value)}
                    MenuProps={dropdownMenuProps}
                  >
                    <MenuItem value="all">All</MenuItem>
                    {bestSellerCategoryOptions.map((c) => (
                      <MenuItem key={String(c.categoryId)} value={String(c.categoryId)}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 90 }}>
                  <InputLabel>Top</InputLabel>
                  <Select
                    label="Top"
                    value={bestItemLimit}
                    onChange={(e) => setBestItemLimit(e.target.value)}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="5">5</MenuItem>
                    <MenuItem value="10">10</MenuItem>
                    <MenuItem value="20">20</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Sort</InputLabel>
                  <Select
                    label="Sort"
                    value={bestItemSort}
                    onChange={(e) => setBestItemSort(e.target.value)}
                  >
                    <MenuItem value="orders_desc">Orders (High → Low)</MenuItem>
                    <MenuItem value="orders_asc">Orders (Low → High)</MenuItem>
                    <MenuItem value="sales_desc">Sales (High → Low)</MenuItem>
                    <MenuItem value="sales_asc">Sales (Low → High)</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </Box>

            <Box sx={cardContentSx}>
              <TableContainer
                className="scroll-x"
                sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ ...tableCellFirstSx, width: 56 }} />
                      <TableCell sx={tableCellSx}>Item Name</TableCell>
                      <TableCell align="right" sx={{ ...tableCellSx, width: 90 }}>
                        Orders
                      </TableCell>
                      <TableCell sx={tableCellLastSx}>Category</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {sortedBestSellerItems.map((item, i) => (
                      <TableRow key={`${item.itemId || item.name}-${i}`} hover>
                        <TableCell sx={tableCellFirstSx}>
                          <Box
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              display: "grid",
                              placeItems: "center",
                              bgcolor: theme.palette.primary.main,
                              color: "#fff",
                              fontWeight: 800,
                              fontSize: 13,
                            }}
                          >
                            {i + 1}
                          </Box>
                        </TableCell>

                        <TableCell sx={tableCellSx}>
                          <Typography variant="body2" fontWeight={700} noWrap>
                            {item.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            ({item.qty} qty • {peso(item.sales)})
                          </Typography>
                        </TableCell>

                        <TableCell align="right" sx={tableCellSx}>
                          <Typography variant="body2" fontWeight={900} noWrap>
                            {item.orders}
                          </Typography>
                        </TableCell>

                        <TableCell sx={tableCellLastSx}>
                          <Typography variant="body2" fontWeight={700} noWrap>
                            {item.category || "-"}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}

                    {sortedBestSellerItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Box py={4} textAlign="center" color="text.secondary">
                            <Typography fontWeight={900}>No best sellers yet</Typography>
                            <Typography variant="body2">
                              No sales recorded for this range.
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>
        </Box>

        {/* ============================ Low Stock ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", sm: "span 6", lg: "span 4" } }}>
          <Paper sx={cardSx}>
            <Box sx={{ ...cardHeaderSx, justifyContent: "space-between" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <InventoryIcon color="primary" />
                <Typography variant="h6" fontWeight={800}>
                  Low Stock Alert
                </Typography>
              </Box>

              {/* Small summary */}
              <Typography variant="body2" color="text.secondary">
                {lowStockItems.length
                  ? `${
                      lowStockItems.filter((i) => i.alert === "critical").length
                    } Critical · ${
                      lowStockItems.filter((i) => i.alert === "warning").length
                    } Warning`
                  : "All good"}
              </Typography>
            </Box>

            <Box
              sx={{
                ...cardContentSx,
                // ⬇️ Cap the content height a bit so the card doesn’t keep growing forever
                maxHeight: { xs: 260, sm: 280, md: 300 },
              }}
            >
              {lowStockErr && (
                <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                  {lowStockErr}
                </Typography>
              )}

              {/* ⬇️ Scrollable area for the list */}
              <Box
                className="scroll-x"
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  overflowX: "hidden",
                  pr: 0.5,
                }}
              >
                <List dense>
                  {lowStockItems.map((item, i) => (
                    <ListItem key={item.id ?? i} disableGutters sx={{ py: 1 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          mr: 2,
                          backgroundColor:
                            item.alert === "critical"
                              ? theme.palette.error.main
                              : theme.palette.warning.main,
                        }}
                      />
                      <ListItemText
                        primary={
                          <Box sx={{ minWidth: 0 }}>
                            {/* Line 1: Inventory name */}
                            <Typography variant="body2" fontWeight={700} noWrap sx={{ minWidth: 0 }}>
                              {item.name}
                            </Typography>

                            {/* Line 2: Current + Minimum */}
                            <Typography variant="caption" color="text.secondary" noWrap>
                              Current: {item.currentStock} • Minimum: {item.lowStock}
                            </Typography>
                          </Box>
                        }
                        sx={{ my: 0 }}
                      />
                      <Chip
                        label={item.alert === "critical" ? "Critical" : "Warning"}
                        color={item.alert === "critical" ? "error" : "warning"}
                        size="small"
                      />
                    </ListItem>
                  ))}

                  {!lowStockErr && lowStockItems.length === 0 && (
                    <ListItem>
                      <ListItemText
                        primary={
                          <Typography variant="body2" color="text.secondary">
                            No items are currently below their low stock thresholds.
                          </Typography>
                        }
                      />
                    </ListItem>
                  )}
                </List>
              </Box>

              <Button
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mt: 1 }}
                onClick={() =>
                  navigate("/inventory?tab=low-stock")
                }
              >
                View Low Stock
              </Button>
            </Box>
          </Paper>
        </Box>

        {/* ============================ User Accounts ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", sm: "span 6", lg: "span 8" } }}>
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <PeopleIcon color="primary" />
              <Typography variant="h6" fontWeight={800}>
                User Accounts
              </Typography>
            </Box>
            <Box
              sx={{
                ...cardContentSx,
                p: 0,     // ✅ remove padding for table area
                gap: 0,
              }}
            >
              <TableContainer
                className="scroll-x"
                sx={{
                  flex: 1,
                  // height tuned so ~4 rows are visible before scroll
                  maxHeight: { xs: 230, sm: 250, md: 270 },
                  overflowY: "auto",
                  overflowX: "hidden",
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={tableCellFirstSx}>Name</TableCell>
                      <TableCell sx={tableCellSx}>Role</TableCell>
                      <TableCell sx={tableCellSx}>Status</TableCell>
                      <TableCell sx={tableCellLastSx}>Last Login</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {employees.slice(0, 5).map((emp) => (
                      <TableRow key={emp.id} hover>
                        <TableCell sx={tableCellFirstSx}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {emp.name || "-"}
                          </Typography>
                        </TableCell>

                        <TableCell sx={tableCellSx}>
                          <Typography variant="body2">{emp.role}</Typography>
                        </TableCell>

                        <TableCell sx={tableCellSx}>
                          <Chip
                            size="small"
                            label={emp.status || "Unknown"}
                            color={emp.status === "Active" ? "success" : "default"}
                            variant={emp.status === "Active" ? "filled" : "outlined"}
                          />
                        </TableCell>

                        <TableCell sx={tableCellLastSx}>
                          <Typography variant="body2" noWrap>
                            {formatDateTime(emp.lastLoginAt || emp.createdAt)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}

                    {employees.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Box py={4} textAlign="center">
                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              No user accounts found.
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* ✅ keep padding only for footer/button */}
              <Box sx={{ p: 2, pt: 1, display: "flex", justifyContent: "flex-end" }}>
                <Button size="small" onClick={() => navigate("/users")}>
                  View All Accounts
                </Button>
              </Box>
            </Box>
          </Paper>
        </Box>

        {/* ============================ Payment Methods ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", md: "span 4" } }}>
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <PaymentIcon color="primary" />
              <Typography variant="h6" fontWeight={800}>
                Payment Methods
              </Typography>
            </Box>
            <Box sx={cardContentSx}>
              {paymentData.length === 0 ? (
                <EmptyState
                  icon={<PaymentIcon color="disabled" sx={{ fontSize: 40 }} />}
                  title="No payment activity"
                  description="No transactions were recorded for the selected period, so there’s nothing to chart yet."
                  hint="Once sales are made, you’ll see the breakdown by payment method here."
                />
              ) : (
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <Box sx={{ height: 200, pointerEvents: "auto" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentData}
                          dataKey="value"
                          nameKey="name"
                          outerRadius="80%"
                          activeIndex={activePieIndex}
                          onMouseEnter={(_, index) => setActivePieIndex(index)}
                          onMouseLeave={() => setActivePieIndex(-1)}
                        >
                          {paymentData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={[
                                theme.palette.primary.main,
                                theme.palette.secondary.main,
                                theme.palette.success.main,
                              ][i % 3]}
                            />
                          ))}
                        </Pie>

                        <Tooltip
                          content={<PaymentTooltip />}
                          cursor={false}
                          wrapperStyle={{ outline: "none", zIndex: 9999 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>

                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {paymentData.map((d, i) => (
                      <Box
                        key={d.name}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Typography variant="body2">
                          <Box
                            component="span"
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              display: "inline-block",
                              backgroundColor:
                                [
                                  theme.palette.primary.main,
                                  theme.palette.secondary.main,
                                  theme.palette.success.main,
                                ][i % 3],
                              mr: 1,
                            }}
                          />
                          {d.name}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {peso(d.amount)} ({d.transactions} {Number(d.transactions) === 1 ? "Transaction" : "Transactions"})
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}