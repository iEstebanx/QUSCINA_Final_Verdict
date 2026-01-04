// QUSCINA_BACKOFFICE/Frontend/src/pages/Dashboard/DashboardPage.jsx
import { useState, useEffect } from "react";
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
  TextField,
  Stack,
  Button,
  Chip,
  Avatar,
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
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
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

const RANGE_LABELS = {
  days: "Today",
  weeks: "This Week",
  monthly: "This Month",
  quarterly: "This Quarter",
  yearly: "This Year",
  custom: "Custom",
};

const DEFAULT_RANGE = "days";

const getIsoWeekRange = (base = dayjs()) => {
  const dow = base.day(); // 0..6 (Sun..Sat)
  const monday = base.subtract((dow + 6) % 7, "day").startOf("day");
  const sunday = monday.add(6, "day").endOf("day");
  return { from: monday, to: sunday };
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

  const [employees, setEmployees] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [lowStockErr, setLowStockErr] = useState("");

  // ------------------------ Date Range State ------------------------
  const [range, setRange] = useState("days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

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

      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };

  const blurOnFocus = (e) => {
    e.target.blur?.(); // ✅ kills MM/DD/YYYY highlight
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
          joinApi("api/inventory/ingredients/low-stock"), // ✅ use joinApi
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
  const [bestSellers, setBestSellers] = useState([]);
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
        range === "custom" && customFrom && customTo
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

        // best sellers
        const bRes = await fetch(
          joinApi(`api/dashboard/best-sellers?${qs}`) // ✅ use joinApi
        );
        const bData = await bRes.json();
        if (alive && bData.ok) setBestSellers(bData.bestSellers);

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

  const sortedBestSellers = [...bestSellers].sort(
    (a, b) => (b.orders || 0) - (a.orders || 0)
  );

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

  return (
    <Box p={2}>
      {/* Top row: Date controls (left) + quick stats (right on large screens) */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) auto" },
          gap: 2,
          alignItems: "stretch",
          mb: 2,
        }}
      >
        {/* Date Range Controls (left) */}
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
            <LocalizationProvider dateAdapter={AdapterDayjs}>
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

        {/* Quick Stats (right on lg+, wraps below on small screens) */}
        <Box sx={{ display: "flex", alignItems: "stretch" }}>
          <QuickStats metrics={metricsWithAccounts} />
        </Box>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "stretch",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridAutoRows: `minmax(${cardHeights.xs}px, auto)`,

          [theme.breakpoints.up("sm")]: {
            gridAutoRows: `minmax(${cardHeights.sm}px, auto)`,
          },
          [theme.breakpoints.up("md")]: {
            gridAutoRows: `minmax(${cardHeights.md}px, auto)`,
          },
        }}
      >
        {/* ============================ User Accounts ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", lg: "span 8" } }}>
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <PeopleIcon color="primary" />
              <Typography variant="h6" fontWeight={800}>
                User Accounts
              </Typography>
            </Box>
            <Box sx={cardContentSx}>
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
                      <TableCell>Name</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last Login</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {employees.slice(0, 5).map((emp) => (
                      <TableRow key={emp.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {emp.name || "(No name)"}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2">{emp.role}</Typography>
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            label={emp.status || "Unknown"}
                            color={emp.status === "Active" ? "success" : "default"}
                            variant={emp.status === "Active" ? "filled" : "outlined"}
                          />
                        </TableCell>

                        <TableCell>
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

              <Button
                size="small"
                sx={{ mt: 1, alignSelf: "flex-end" }}
                onClick={() => navigate("/users")}
              >
                View All Accounts
              </Button>
            </Box>
          </Paper>
        </Box>

        {/* ============================ Best Sellers ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", sm: "span 6", lg: "span 4" } }}>
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <TrendingUpIcon color="primary" />
              <Typography variant="h6" fontWeight={800}>
                Best Seller per Category
              </Typography>
            </Box>
              <Box sx={cardContentSx}>
                {sortedBestSellers.length === 0 ? (
                  <EmptyState
                    icon={<TrendingUpIcon color="disabled" sx={{ fontSize: 40 }} />}
                    title="No best sellers yet"
                    description="There were no sales recorded in the selected period, so there’s no best-selling data to display."
                    hint="Try switching the range to Week/Month or choose a different date."
                  />
                ) : (
                  <List dense sx={{ flex: 1 }}>
                    {sortedBestSellers.slice(0, 5).map((item, i) => (
                      <ListItem key={i} disableGutters sx={{ py: 1 }}>
                        <Avatar
                          sx={{
                            width: 32,
                            height: 32,
                            mr: 2,
                            bgcolor: theme.palette.primary.main,
                            fontSize: 14,
                          }}
                        >
                          {i + 1}
                        </Avatar>

                        <ListItemText
                          primary={
                            <Typography variant="body2" fontWeight="medium">
                              {item.name}
                            </Typography>
                          }
                        />

                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            minWidth: 90,
                          }}
                        >
                          <Typography variant="body2" fontWeight="bold">
                            {item.orders} orders
                          </Typography>

                          {item.trend === "up" ? (
                            <TrendingUpIcon color="success" sx={{ fontSize: 20 }} />
                          ) : (
                            <TrendingDownIcon color="error" sx={{ fontSize: 20 }} />
                          )}
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
          </Paper>
        </Box>

        {/* ============================ Low Stock ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", sm: "span 6", lg: "span 8" } }}>
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
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "baseline",
                              gap: 1,
                              minWidth: 0,
                            }}
                          >
                            <Typography variant="body2" fontWeight="medium" noWrap sx={{ minWidth: 0 }}>
                              {item.name}
                            </Typography>

                            <Typography variant="caption" color="text.secondary" noWrap>
                              Current: {item.currentStock} | Minimum: {item.lowStock}
                            </Typography>
                          </Box>
                        }
                        sx={{ my: 0 }} // remove extra vertical margins
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
                  <Box sx={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentData}
                          dataKey="value"
                          nameKey="name"
                          outerRadius="80%"
                          label={({ name, value }) => `${name} ${value}%`}
                        >
                          {paymentData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={
                                [
                                  theme.palette.primary.main,
                                  theme.palette.secondary.main,
                                  theme.palette.success.main,
                                ][i % 3]
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [`${v}%`, "Percentage"]} />
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
                          {peso(d.amount)} ({d.transactions} txn)
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