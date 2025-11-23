// Backoffice/Frontend/src/pages/Dashboard/DashboardPage.jsx
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
  Grid,
} from "@mui/material";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import InventoryIcon from "@mui/icons-material/Inventory";
import PaymentIcon from "@mui/icons-material/Payment";
import PeopleIcon from "@mui/icons-material/People";
import { useNavigate } from "react-router-dom";
import { subscribeUsers } from "@/services/Users/users";

/* ----------------------------- Enhanced Mock Data ----------------------------- */
const salesSeriesByRange = {
  days: [
    { name: "Oct 21", sales: 1200, orders: 45, customers: 38 },
    { name: "Oct 22", sales: 1900, orders: 62, customers: 52 },
    { name: "Oct 23", sales: 1500, orders: 51, customers: 44 },
    { name: "Oct 24", sales: 2100, orders: 68, customers: 58 },
    { name: "Oct 25", sales: 1800, orders: 59, customers: 49 },
  ],
  weeks: [
    { name: "Week 1", sales: 8500, orders: 280, customers: 240 },
    { name: "Week 2", sales: 9200, orders: 310, customers: 265 },
    { name: "Week 3", sales: 7800, orders: 260, customers: 220 },
    { name: "Week 4", sales: 9500, orders: 320, customers: 275 },
  ],
  // ... other ranges remain similar but with enhanced data
};

const bestSellersByRange = {
  days: [
    { name: "Crispy Kare Kare", sales: 1125, orders: 15, trend: "up" },
    { name: "Inihaw na Liempo", sales: 840, orders: 12, trend: "up" },
    { name: "Sinigang na Baboy", sales: 680, orders: 8, trend: "up" },
    { name: "Adobong Manok", sales: 420, orders: 6, trend: "down" },
    { name: "Bulalo", sales: 600, orders: 5, trend: "up" },
  ],
  // ... other ranges
};

const paymentDataByRange = {
  days: [
    { name: "Cash", value: 62.5, amount: 1738, transactions: 25 },
    { name: "Gcash/Maya", value: 25, amount: 695, transactions: 18 },
    { name: "Card", value: 12.5, amount: 347, transactions: 7 },
  ],
  // ... other ranges
};

// Additional metrics data
const metricsData = {
  days: {
    totalSales: 2780,
    totalOrders: 52,
    profit: 0,
    averageOrder: 53.46,
    customerCount: 45,
    growth: 12.5,
  },
  // ... other ranges
};

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

// Quick Stats Component
const QuickStats = ({ metrics }) => (
  <Grid container spacing={2} sx={{ mb: 2 }}>

    {/* Total Sales */}
    <Grid item xs={6} sm={3}>
      <Card sx={{ textAlign: "center", p: 1 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" color="primary">
            {peso(metrics.totalSales)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Total Sales
          </Typography>
        </CardContent>
      </Card>
    </Grid>

    {/* Total Orders */}
    <Grid item xs={6} sm={3}>
      <Card sx={{ textAlign: "center", p: 1 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" color="secondary">
            {metrics.totalOrders}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Total Orders
          </Typography>
        </CardContent>
      </Card>
    </Grid>

    {/* ⭐ NEW — PROFIT (inserted here) */}
    <Grid item xs={6} sm={3}>
      <Card sx={{ textAlign: "center", p: 1 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" color="warning.main">
            {peso(metrics.profit)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Profit
          </Typography>
        </CardContent>
      </Card>
    </Grid>

    {/* Avg Order */}
    <Grid item xs={6} sm={3}>
      <Card sx={{ textAlign: "center", p: 1 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" color="success.main">
            {peso(metrics.averageOrder)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Avg Order
          </Typography>
        </CardContent>
      </Card>
    </Grid>

    {/* Total Accounts */}
    <Grid item xs={6} sm={3}>
      <Card sx={{ textAlign: "center", p: 1 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" color="info.main">
            {metrics.customerCount}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Total User Accounts
          </Typography>
        </CardContent>
      </Card>
    </Grid>

  </Grid>
);

export default function DashboardPage() {
  const theme = useTheme();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [lowStockErr, setLowStockErr] = useState("");

  useEffect(() => {
    // reuse the same live list as UserManagement
    const unsub = subscribeUsers(
      ({ rows }) => {
        const list = (rows || []).map((e) => ({
          id: e.employeeId,
          name: `${e.firstName || ""} ${e.lastName || ""}`.trim(),
          role: e.role,
          status: e.status,
          username: e.username || "",
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
        const res = await fetch("/api/inventory/ingredients/low-stock", {
          cache: "no-store",
        });
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
    return () => { alive = false; };
  }, []);

  // ------------------------ Date Range State ------------------------
  const [range, setRange] = useState("days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // ---------------------------- Get Filtered Data ----------------------------
  const getFilteredData = () => {
    if (range === "custom" && customFrom && customTo) {
      // Custom range filtering logic...
      return {
        salesSeries: salesSeriesByRange.days,
        bestSellers: bestSellersByRange.days,
        paymentData: paymentDataByRange.days,
        metrics: metricsData.days,
      };
    }
    
    const effectiveRangeKey = range === "custom" ? "days" : range;
    return {
      salesSeries: salesSeriesByRange[effectiveRangeKey] || salesSeriesByRange.days,
      bestSellers: bestSellersByRange[effectiveRangeKey] || bestSellersByRange.days,
      paymentData: paymentDataByRange[effectiveRangeKey] || paymentDataByRange.days,
      metrics: metricsData[effectiveRangeKey] || metricsData.days,
    };
  };

  const { salesSeries, yesterdaySales, bestSellers, paymentData, metrics } = getFilteredData();
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
    display: 'flex',
    alignItems: 'center',
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

  return (
    <Box p={2}>
      {/* Date Range Controls */}
      <Paper sx={{ p: 2, mb: 2 }}>
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
          
          <TextField
            size="small"
            type="date"
            label="From"
            value={customFrom}
            onChange={(e) => {
              const value = e.target.value;
              if (range !== "custom") setRange("custom");
              setCustomFrom(value);
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
            }}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </Paper>

      {/* Quick Stats */}
      <QuickStats metrics={metricsWithAccounts} />

      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "stretch",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridAutoRows: `minmax(${cardHeights.xs}px, auto)`,

          [theme.breakpoints.up('sm')]: {
            gridAutoRows: `minmax(${cardHeights.sm}px, auto)`,
          },
          [theme.breakpoints.up('md')]: {
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
              <TableContainer className="scroll-x" sx={{ flex: 1 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Username</TableCell>
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
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                          >
                            {emp.id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{emp.role}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {emp.username || "—"}
                          </Typography>
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
                        <TableCell colSpan={5}>
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
                Manage Accounts
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
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
                            fill={[theme.palette.primary.main, theme.palette.secondary.main, theme.palette.success.main][i % 3]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v}%`, 'Percentage']} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {paymentData.map((d, i) => (
                    <Box key={d.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">
                        <Box component="span" sx={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%', 
                          display: 'inline-block',
                          backgroundColor: [theme.palette.primary.main, theme.palette.secondary.main, theme.palette.success.main][i % 3],
                          mr: 1 
                        }} />
                        {d.name}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {peso(d.amount)} ({d.transactions} txn)
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
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
                  ? `${lowStockItems.filter(i => i.alert === "critical").length} Critical · ${
                      lowStockItems.filter(i => i.alert === "warning").length
                    } Warning`
                  : "All good"}
              </Typography>
            </Box>

            <Box sx={cardContentSx}>
              {lowStockErr && (
                <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                  {lowStockErr}
                </Typography>
              )}

              <List dense sx={{ flex: 1 }}>
                {lowStockItems.slice(0, 8).map((item, i) => (
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
                        <Typography variant="body2" fontWeight="medium" noWrap>
                          {item.name}
                        </Typography>
                      }
                      secondary={`Current: ${item.currentStock} | Min: ${item.lowStock}`}
                      secondaryTypographyProps={{
                        variant: "caption",
                        color: "text.secondary",
                        component: "span",
                      }}
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

              <Button
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mt: 1 }}
                onClick={() => navigate("/inventory?filter=low-stock")}
              >
                View Low Stock Items
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
                Best Sellers
              </Typography>
            </Box>
            <Box sx={cardContentSx}>
              <List dense sx={{ flex: 1 }}>
                {bestSellers.map((item, i) => (
                <ListItem key={i} disableGutters sx={{ py: 1 }}>
                  {/* Rank number */}
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

                  {/* Item name */}
                  <ListItemText
                    primary={
                      <Typography variant="body2" fontWeight="medium">
                        {item.name}
                      </Typography>
                    }
                  />

                  {/* Orders + Trend Icon on the RIGHT */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 90 }}>
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
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}