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
const AV_DAYS_API = "/api/inventory/inv-activity/available-days";
const AV_MONTHS_API = "/api/inventory/inv-activity/available-months";
const AV_WEEKS_API = "/api/inventory/inv-activity/available-weeks";

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
    // ✅ don't preventDefault (passive listener)
    e.stopPropagation();
    e.currentTarget?.blur?.(); // drop focus so wheel can't nudge sections
  },
  onKeyDown: (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
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

const getQuarterRange = (year, monthIndex) => {
  const qStart = Math.floor(monthIndex / 3) * 3; // 0,3,6,9
  const from = dayjs().year(year).month(qStart).date(1).startOf("day");
  const to = from.add(2, "month").endOf("month").endOf("day");
  return { from, to };
};

const getAnchor = (dateBounds) => (dateBounds?.max ? dayjs(dateBounds.max) : dayjs());

const isThisMonth = (range, yearSel, monthSel, dateBounds) => {
  if (range !== "monthly") return false;
  const a = getAnchor(dateBounds);
  return Number(yearSel) === a.year() && Number(monthSel) === (a.month() + 1);
};

const isThisQuarter = (range, yearSel, monthSel, dateBounds) => {
  if (range !== "quarterly") return false;
  const a = getAnchor(dateBounds);
  const selQ = Math.floor((Number(monthSel) - 1) / 3);
  const aQ = Math.floor(a.month() / 3);
  return Number(yearSel) === a.year() && selQ === aQ;
};

const isThisYear = (range, yearSel, dateBounds) => {
  if (range !== "yearly") return false;
  const a = getAnchor(dateBounds);
  return Number(yearSel) === a.year();
};

const isCurrentDayByRange = (customFrom, customTo, dateBounds) => {
  const anchor = dateBounds?.max ? dayjs(dateBounds.max) : dayjs();
  const from = anchor.startOf("day").format("YYYY-MM-DD");
  const to = anchor.endOf("day").format("YYYY-MM-DD");
  return customFrom === from && customTo === to;
};

const isCurrentQuarterByRange = (customFrom, customTo, dateBounds) => {
  const anchor = dateBounds?.max ? dayjs(dateBounds.max) : dayjs();
  const { from, to } = getQuarterRange(anchor.year(), anchor.month());
  return (
    customFrom === from.format("YYYY-MM-DD") &&
    customTo === to.format("YYYY-MM-DD")
  );
};

const isCurrentWeek = (range, weekSel, availableWeeks, dateBounds) => {
  if (range !== "weeks" || !weekSel) return false;

  const anchor = dateBounds?.max ? dayjs(dateBounds.max) : dayjs();
  const { from, to } = getWeekRangeMonSun(anchor);

  const currentFrom = from.format("YYYY-MM-DD");
  const currentTo = to.format("YYYY-MM-DD");

  const selected = availableWeeks.find((w) => w.key === weekSel);
  if (!selected) return false;

  return selected.from === currentFrom && selected.to === currentTo;
};

const isCurrentMonthByRange = (customFrom, customTo, dateBounds) => {
  const anchor = dateBounds?.max ? dayjs(dateBounds.max) : dayjs();
  const { from, to } = getMonthRange(anchor.year(), anchor.month());
  return (
    customFrom === from.format("YYYY-MM-DD") &&
    customTo === to.format("YYYY-MM-DD")
  );
};

const isCurrentYearByRange = (customFrom, customTo, dateBounds) => {
  const anchor = dateBounds?.max ? dayjs(dateBounds.max) : dayjs();
  const from = anchor.month(0).date(1).startOf("day");
  const to = anchor.month(11).endOf("month").endOf("day");
  return (
    customFrom === from.format("YYYY-MM-DD") &&
    customTo === to.format("YYYY-MM-DD")
  );
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

const [availableDays, setAvailableDays] = useState([]);     // ["YYYY-MM-DD", ...]
const [availableMonths, setAvailableMonths] = useState([]); // ["YYYY-MM", ...]
const [availableWeeks, setAvailableWeeks] = useState([]);   // [{key,from,to,label}, ...]

const [yearSel, setYearSel] = useState(dayjs().year());
const [monthSel, setMonthSel] = useState(dayjs().month() + 1); // 1..12
const [weekSel, setWeekSel] = useState(""); // week.key

const availableYears = useMemo(() => {
  const ys = Array.from(
    new Set((availableMonths || []).map((m) => Number(m.split("-")[0])))
  ).filter(Number.isFinite);

  ys.sort((a, b) => b - a);

  // fallback so the select never looks empty during load
  if (!ys.length) return [yearSel];
  return ys;
}, [availableMonths, yearSel]);

const monthOptionsForYear = useMemo(() => {
  const list = (availableMonths || [])
    .filter((ym) => String(ym).startsWith(`${yearSel}-`))
    .map((ym) => Number(String(ym).split("-")[1])) // 1..12
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);

  return Array.from(new Set(list)).sort((a, b) => a - b);
}, [availableMonths, yearSel]);

useEffect(() => {
  if (!(range === "weeks" || range === "monthly" || range === "quarterly")) return;

  if (!monthOptionsForYear.length) {
    // keep something valid to avoid uncontrolled select
    setMonthSel(1);
    return;
  }

  if (!monthOptionsForYear.includes(monthSel)) {
    setMonthSel(monthOptionsForYear[0]);
  }
}, [range, monthOptionsForYear, monthSel]);

useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const r1 = await authFetch(`${AV_DAYS_API}?limit=5000`);
      const j1 = await r1.json();
      if (alive && j1?.ok) setAvailableDays(j1.days || []);

      const r2 = await authFetch(`${AV_MONTHS_API}?limit=5000`);
      const j2 = await r2.json();
      if (alive && j2?.ok) setAvailableMonths(j2.months || []);
    } catch (e) {
      console.error("load available ranges failed:", e);
    }
  })();

  return () => { alive = false; };
}, [reloadTick]);

useEffect(() => {
  let alive = true;

  (async () => {
    if (range !== "weeks") return;

    try {
      const res = await authFetch(`${AV_WEEKS_API}?year=${yearSel}&month=${monthSel}`);
      const j = await res.json();
      if (!alive) return;
      if (!j?.ok) return;

      const weeks = j.weeks || [];
      setAvailableWeeks(weeks);

      if (!weeks.length) {
        setWeekSel("");
        return;
      }

      const exists = weeks.some((w) => w.key === weekSel);
      if (!weekSel || !exists) setWeekSel(weeks[0].key);
    } catch (e) {
      console.error("load available weeks failed:", e);
    }
  })();

  return () => { alive = false; };
}, [range, yearSel, monthSel, reloadTick]); // eslint-disable-line

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
  if (!availableDays.length) return { min: "", max: "" };
  const min = availableDays[0];
  const max = availableDays[availableDays.length - 1];
  return { min, max };
}, [availableDays]);

    // Build “active days” set (used to disable dates in DatePicker like ReportsPage)
const activeDaySet = useMemo(() => new Set(availableDays), [availableDays]);


  const clampToBounds = (s) => {
    const { min, max } = dateBounds || {};
    let out = s;
    if (min && out < min) out = min;
    if (max && out > max) out = max;
    return out;
  };

function applyPresetRange(nextRange) {
  setRange(nextRange);

  const setFromTo = (from, to) => {
    const f = clampToBounds(from.format("YYYY-MM-DD"));
    const t = clampToBounds(to.format("YYYY-MM-DD"));
    setCustomFrom(f);
    setCustomTo(t);
    setPageState((s) => ({ ...s, page: 0 }));
  };

  // Anchor = latest available day (ReportsPage uses available data bounds)
  const anchor = dateBounds.max ? dayjs(dateBounds.max) : dayjs();

  // Keep year/month selectors aligned to anchor
  setYearSel(anchor.year());
  setMonthSel(anchor.month() + 1);

  if (nextRange === "custom") return;

  if (nextRange === "days") {
    setFromTo(anchor.startOf("day"), anchor.endOf("day"));
    return;
  }

  if (nextRange === "weeks") {
    const { from, to } = getWeekRangeMonSun(anchor);
    setFromTo(from, to);
    return;
  }

  if (nextRange === "monthly") {
    const { from, to } = getMonthRange(anchor.year(), anchor.month());
    setFromTo(from, to);
    return;
  }

  if (nextRange === "quarterly") {
    const q = Math.floor(anchor.month() / 3) * 3;
    const from = anchor.month(q).date(1).startOf("day");
    const to = from.add(2, "month").endOf("month").endOf("day");
    setFromTo(from, to);
    return;
  }

  if (nextRange === "yearly") {
    setFromTo(
      anchor.month(0).date(1).startOf("day"),
      anchor.month(11).endOf("month").endOf("day")
    );
  }
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

const rangeLabel = useMemo(() => {
  if (range === "days") {
    return isCurrentDayByRange(customFrom, customTo, dateBounds) ? "Today" : "Day";
  }

  if (range === "weeks") {
    return isCurrentWeek(range, weekSel, availableWeeks, dateBounds)
      ? "This Week"
      : "Week";
  }

  if (range === "monthly") {
    return isThisMonth(range, yearSel, monthSel, dateBounds) ? "This Month" : "Month";
  }

  if (range === "quarterly") {
    return isThisQuarter(range, yearSel, monthSel, dateBounds) ? "This Quarter" : "Quarter";
  }

  if (range === "yearly") {
    return isThisYear(range, yearSel, dateBounds) ? "This Year" : "Year";
  }

  return "Custom";
}, [range, weekSel, availableWeeks, customFrom, customTo, dateBounds, yearSel, monthSel]);

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

  // ✅ Source of truth is customFrom/customTo
  let from = null;
  let to = null;

  if (range === "days") {
    const anchor = dateBounds.max ? dayjs(dateBounds.max) : dayjs();
    from = anchor.startOf("day");
    to = anchor.endOf("day");
  } else {
    if (!customFrom || !customTo) return [];
    from = dayjs(customFrom).startOf("day");
    to = dayjs(customTo).endOf("day");
  }

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

  // When month/year changes in MONTHLY mode → set From/To to that month
useEffect(() => {
  if (range !== "monthly") return;
  const { from, to } = getMonthRange(yearSel, monthSel - 1);
  setCustomFrom(clampToBounds(from.format("YYYY-MM-DD")));
  setCustomTo(clampToBounds(to.format("YYYY-MM-DD")));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [range, yearSel, monthSel]);

// When weekSel changes in WEEKS mode → set From/To to that week range
useEffect(() => {
  if (range !== "weeks") return;
  const w = availableWeeks.find((x) => x.key === weekSel);
  if (!w) return;
  setCustomFrom(clampToBounds(w.from));
  setCustomTo(clampToBounds(w.to));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [range, weekSel, availableWeeks]);

// Quarterly: use yearSel + monthSel to determine quarter (based on selected month)
useEffect(() => {
  if (range !== "quarterly") return;
  const mIdx = monthSel - 1;
  const qStart = Math.floor(mIdx / 3) * 3;
  const from = dayjs().year(yearSel).month(qStart).date(1).startOf("day");
  const to = from.add(2, "month").endOf("month").endOf("day");
  setCustomFrom(clampToBounds(from.format("YYYY-MM-DD")));
  setCustomTo(clampToBounds(to.format("YYYY-MM-DD")));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [range, yearSel, monthSel]);

// Yearly: use yearSel
useEffect(() => {
  if (range !== "yearly") return;
  const from = dayjs().year(yearSel).month(0).date(1).startOf("day");
  const to = dayjs().year(yearSel).month(11).endOf("month").endOf("day");
  setCustomFrom(clampToBounds(from.format("YYYY-MM-DD")));
  setCustomTo(clampToBounds(to.format("YYYY-MM-DD")));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [range, yearSel]);

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

            {/* Year selector (shown for weeks/monthly/quarterly/yearly) */}
            {range !== "days" && (
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel id="yr-label">Year</InputLabel>
                <Select
                  labelId="yr-label"
                  label="Year"
                  value={yearSel}
                  onChange={(e) => setYearSel(Number(e.target.value))}
                >
                  {availableYears.map((y) => (
                    <MenuItem key={y} value={y}>
                      {y}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Month selector (shown for weeks/monthly/quarterly) */}
            {(range === "weeks" || range === "monthly" || range === "quarterly") && (
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id="mo-label">Month</InputLabel>
                <Select
                  labelId="mo-label"
                  label="Month"
                  value={monthSel}
                  onChange={(e) => setMonthSel(Number(e.target.value))}
                >
                  {monthOptionsForYear.length === 0 && (
                    <MenuItem disabled value={monthSel}>
                      No months available
                    </MenuItem>
                  )}

                  {monthOptionsForYear.map((m) => (
                    <MenuItem key={m} value={m}>
                      {dayjs().month(m - 1).format("MMMM")}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Week selector (only for weeks) */}
            {range === "weeks" && (
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel id="wk-label">Week</InputLabel>
                <Select
                  labelId="wk-label"
                  label="Week"
                  value={weekSel}
                  onChange={(e) => setWeekSel(String(e.target.value))}
                  renderValue={(v) => {
                    const w = availableWeeks.find((x) => x.key === v);
                    return w ? w.label : "Select week";
                  }}
                >
                  {availableWeeks.length === 0 && (
                    <MenuItem disabled value="">
                      No weeks available
                    </MenuItem>
                  )}
                  {availableWeeks.map((w) => (
                    <MenuItem key={w.key} value={w.key}>
                      {w.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

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