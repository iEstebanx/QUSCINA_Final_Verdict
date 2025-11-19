// Frontend/src/pages/Dashboard/DashboardPage.jsx
import { useState } from "react";
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
  useMediaQuery,
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
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import PaymentIcon from "@mui/icons-material/Payment";

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

const yesterdaySalesByRange = {
  days: [
    { item: "Crispy Kare Kare", count: 15, revenue: 1125, growth: 12 },
    { item: "Inihaw na Liempo", count: 12, revenue: 840, growth: 8 },
    { item: "Sinigang na Baboy", count: 8, revenue: 680, growth: 15 },
    { item: "Adobong Manok", count: 6, revenue: 420, growth: -5 },
    { item: "Bulalo", count: 5, revenue: 600, growth: 20 },
    { item: "Kare-Kare", count: 4, revenue: 560, growth: 10 },
  ],
  // ... other ranges
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

const lowStockByRange = {
  days: [
    { item: "Soy Sauce", current: 2, min: 10, alert: "critical" },
    { item: "Vinegar", current: 5, min: 8, alert: "warning" },
    { item: "Garlic", current: 3, min: 15, alert: "critical" },
    { item: "Onions", current: 8, min: 12, alert: "warning" },
    { item: "Ginger", current: 4, min: 10, alert: "critical" },
    { item: "Cooking Oil", current: 6, min: 8, alert: "warning" },
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

// Quick Stats Component
const QuickStats = ({ metrics }) => (
  <Grid container spacing={2} sx={{ mb: 2 }}>
    <Grid item xs={6} sm={3}>
      <Card sx={{ textAlign: 'center', p: 1 }}>
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
    <Grid item xs={6} sm={3}>
      <Card sx={{ textAlign: 'center', p: 1 }}>
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
    <Grid item xs={6} sm={3}>
      <Card sx={{ textAlign: 'center', p: 1 }}>
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
    <Grid item xs={6} sm={3}>
      <Card sx={{ textAlign: 'center', p: 1 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" color="info.main">
            {metrics.customerCount}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Customers
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  </Grid>
);

export default function DashboardPage() {
  const theme = useTheme();

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
        yesterdaySales: yesterdaySalesByRange.days,
        bestSellers: bestSellersByRange.days,
        lowStock: lowStockByRange.days,
        paymentData: paymentDataByRange.days,
        metrics: metricsData.days,
      };
    }
    
    const effectiveRangeKey = range === "custom" ? "days" : range;
    return {
      salesSeries: salesSeriesByRange[effectiveRangeKey] || salesSeriesByRange.days,
      yesterdaySales: yesterdaySalesByRange[effectiveRangeKey] || yesterdaySalesByRange.days,
      bestSellers: bestSellersByRange[effectiveRangeKey] || bestSellersByRange.days,
      lowStock: lowStockByRange[effectiveRangeKey] || lowStockByRange.days,
      paymentData: paymentDataByRange[effectiveRangeKey] || paymentDataByRange.days,
      metrics: metricsData[effectiveRangeKey] || metricsData.days,
    };
  };

  const { salesSeries, yesterdaySales, bestSellers, lowStock, paymentData, metrics } = getFilteredData();

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
      <QuickStats metrics={metrics} />

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
        {/* ============================ Sales Trend ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", lg: "span 8" } }}>
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <TrendingUpIcon color="primary" />
              <Typography variant="h6" fontWeight={800}>
                Sales Performance
              </Typography>
            </Box>
            <Box sx={cardContentSx}>
              <Box sx={{ width: "100%", height: "100%", minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => [`₱${value}`, 'Amount']}
                    />
                    <Bar dataKey="sales" fill={theme.palette.primary.main} />
                    <Bar dataKey="orders" fill={theme.palette.secondary.main} />
                  </BarChart>
                </ResponsiveContainer>
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

        {/* ============================ Top Selling Items ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", sm: "span 6", lg: "span 4" } }}>
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <LocalOfferIcon color="primary" />
              <Typography variant="h6" fontWeight={800}>
                Top Selling Items
              </Typography>
            </Box>
            <Box sx={cardContentSx}>
              <TableContainer sx={{ flex: 1 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell align="right">Sold</TableCell>
                      <TableCell align="right">Revenue</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {yesterdaySales.slice(0, 6).map((r, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                            {r.item}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                            {r.count}
                            {r.growth > 0 ? (
                              <TrendingUpIcon color="success" sx={{ fontSize: 16 }} />
                            ) : (
                              <TrendingDownIcon color="error" sx={{ fontSize: 16 }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="bold">
                            {peso(r.revenue)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Showing top 6 items
              </Typography>
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
                    <Avatar sx={{ width: 32, height: 32, mr: 2, bgcolor: theme.palette.primary.main, fontSize: 14 }}>
                      {i + 1}
                    </Avatar>
                    <ListItemText 
                      primary={
                        <Typography variant="body2" fontWeight="medium">
                          {item.name}
                        </Typography>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" component="span">
                            {item.orders} orders
                          </Typography>
                          <Typography variant="caption" component="span" fontWeight="bold">
                            {peso(item.sales)}
                          </Typography>
                        </Box>
                      }
                      secondaryTypographyProps={{ component: 'div' }} // 👈 important
                    />
                    <Chip
                      label={
                        item.trend === "up"
                          ? <TrendingUpIcon sx={{ fontSize: 18 }} />
                          : <TrendingDownIcon sx={{ fontSize: 18 }} />
                      }
                      color={item.trend === "up" ? "success" : "error"}
                      size="small"
                      sx={{
                        minWidth: 32,
                        height: 24,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        "& .MuiChip-label": {
                          p: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          </Paper>
        </Box>

        {/* ============================ Low Stock ============================ */}
        <Box sx={{ gridColumn: { xs: "span 12", sm: "span 6", lg: "span 4" } }}>
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <InventoryIcon color="primary" />
              <Typography variant="h6" fontWeight={800}>
                Low Stock Alert
              </Typography>
            </Box>
            <Box sx={cardContentSx}>
              <List dense sx={{ flex: 1 }}>
                {lowStock.map((item, i) => (
                  <ListItem key={i} disableGutters sx={{ py: 1 }}>
                    <Box sx={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      mr: 2,
                      backgroundColor: item.alert === 'critical' ? theme.palette.error.main : theme.palette.warning.main
                    }} />
                    <ListItemText 
                      primary={
                        <Typography variant="body2" fontWeight="medium">
                          {item.item}
                        </Typography>
                      }
                      secondary={`Current: ${item.current} | Min: ${item.min}`}
                      secondaryTypographyProps={{
                        variant: 'caption',
                        color: 'text.secondary',
                        component: 'span',   // 👈 avoid <p>
                      }}
                    />
                    <Chip 
                      label={item.alert === 'critical' ? 'Critical' : 'Warning'}
                      color={item.alert === 'critical' ? 'error' : 'warning'}
                      size="small"
                    />
                  </ListItem>
                ))}
              </List>
              <Button variant="outlined" size="small" fullWidth sx={{ mt: 1 }}>
                View All Inventory
              </Button>
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}