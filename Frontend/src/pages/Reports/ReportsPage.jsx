// Frontend/src/pages/Reports/ReportsPage.jsx
import { useMemo, useState } from "react";
import {
  Box, Paper, Stack, Typography, Divider, Button,
  InputAdornment, TextField, FormControl, InputLabel, Select, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Avatar, Chip, useMediaQuery,
} from "@mui/material";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useTheme } from "@mui/material/styles";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SearchIcon from "@mui/icons-material/Search";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReplayIcon from "@mui/icons-material/Replay";

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

/* ----------------------------- Mock data by range ----------------------------- */
// You can later replace these with real API responses per range.

const categoryTop5ByRange = {
  days: [
    { name: "Tanghalian", net: 2283.2 },
    { name: "Recipe", net: 0 },
    { name: "Umagahan", net: 0 },
    { name: "Pampagana", net: 0 },
    { name: "Meryenda", net: 0 },
  ],
  weeks: [
    { name: "Tanghalian", net: 12000 },
    { name: "Meryenda", net: 6200 },
    { name: "Umagahan", net: 3100 },
    { name: "Pampagana", net: 2000 },
    { name: "Recipe", net: 500 },
  ],
  monthly: [
    { name: "Tanghalian", net: 45000 },
    { name: "Meryenda", net: 22000 },
    { name: "Umagahan", net: 18000 },
    { name: "Pampagana", net: 9500 },
    { name: "Recipe", net: 4300 },
  ],
  quarterly: [
    { name: "Tanghalian", net: 120000 },
    { name: "Meryenda", net: 80000 },
    { name: "Umagahan", net: 60000 },
    { name: "Pampagana", net: 28000 },
    { name: "Recipe", net: 12000 },
  ],
  yearly: [
    { name: "Tanghalian", net: 480000 },
    { name: "Meryenda", net: 310000 },
    { name: "Umagahan", net: 250000 },
    { name: "Pampagana", net: 140000 },
    { name: "Recipe", net: 80000 },
  ],
};

const categorySeriesByRange = {
  days: [
    { x: "Oct 21", y: 0 },
    { x: "Oct 22", y: 2200 },
    { x: "Oct 23", y: 1600 },
    { x: "Oct 24", y: 1700 },
    { x: "Oct 25", y: 0 },
    { x: "Oct 26", y: 0 },
    { x: "Oct 27", y: 0 },
    { x: "Oct 28", y: 0 },
    { x: "Oct 29", y: 0 },
    { x: "Oct 30", y: 0 },
  ],
  weeks: [
    { x: "Week 1", y: 5400 },
    { x: "Week 2", y: 11200 },
    { x: "Week 3", y: 8900 },
    { x: "Week 4", y: 7600 },
  ],
  monthly: [
    { x: "Jan", y: 30000 },
    { x: "Feb", y: 32000 },
    { x: "Mar", y: 34000 },
    { x: "Apr", y: 29000 },
    { x: "May", y: 36000 },
  ],
  quarterly: [
    { x: "Q1", y: 95000 },
    { x: "Q2", y: 103000 },
    { x: "Q3", y: 88000 },
    { x: "Q4", y: 110000 },
  ],
  yearly: [
    { x: "2022", y: 320000 },
    { x: "2023", y: 410000 },
    { x: "2024", y: 480000 },
  ],
};

const paymentsByRange = {
  days: [
    { type: "Card", tx: 0, payAmt: 0, refundTx: 0, refundAmt: 0, net: 0 },
    { type: "Cash", tx: 20, payAmt: 2784, refundTx: 0, refundAmt: 0, net: 2784 },
    { type: "Gcash/Maya", tx: 10, payAmt: 2783, refundTx: 0, refundAmt: 0, net: 2783 },
  ],
  weeks: [
    { type: "Card", tx: 8, payAmt: 12000, refundTx: 0, refundAmt: 0, net: 12000 },
    { type: "Cash", tx: 95, payAmt: 78000, refundTx: 2, refundAmt: 1500, net: 76500 },
    { type: "Gcash/Maya", tx: 30, payAmt: 26000, refundTx: 1, refundAmt: 500, net: 25500 },
  ],
  monthly: [
    { type: "Card", tx: 28, payAmt: 42000, refundTx: 2, refundAmt: 2000, net: 40000 },
    { type: "Cash", tx: 410, payAmt: 320000, refundTx: 6, refundAmt: 4800, net: 315200 },
    { type: "Gcash/Maya", tx: 130, payAmt: 98000, refundTx: 4, refundAmt: 3000, net: 95000 },
  ],
  quarterly: [
    { type: "Card", tx: 80, payAmt: 130000, refundTx: 5, refundAmt: 8000, net: 122000 },
    { type: "Cash", tx: 1200, payAmt: 980000, refundTx: 18, refundAmt: 14000, net: 966000 },
    { type: "Gcash/Maya", tx: 400, payAmt: 320000, refundTx: 12, refundAmt: 10000, net: 310000 },
  ],
  yearly: [
    { type: "Card", tx: 260, payAmt: 430000, refundTx: 14, refundAmt: 26000, net: 404000 },
    { type: "Cash", tx: 4800, payAmt: 3900000, refundTx: 60, refundAmt: 60000, net: 3840000 },
    { type: "Gcash/Maya", tx: 1500, payAmt: 1200000, refundTx: 40, refundAmt: 26000, net: 1174000 },
  ],
};

const bestSellerByRange = {
  days: [
    { rank: 1, name: "Crispy Kare Kare", orders: 30, qty: 30, sales: 2283.2 },
    { rank: 2, name: "ETC", orders: 0, qty: 0, sales: 0 },
    { rank: 3, name: "ETC", orders: 0, qty: 0, sales: 0 },
  ],
  weeks: [
    { rank: 1, name: "Crispy Kare Kare", orders: 120, qty: 120, sales: 9000 },
    { rank: 2, name: "Inihaw na Liempo", orders: 80, qty: 80, sales: 6000 },
    { rank: 3, name: "Sinigang na Baboy", orders: 45, qty: 45, sales: 3900 },
  ],
  monthly: [
    { rank: 1, name: "Crispy Kare Kare", orders: 480, qty: 480, sales: 36000 },
    { rank: 2, name: "Inihaw na Liempo", orders: 310, qty: 310, sales: 23250 },
    { rank: 3, name: "Sinigang na Baboy", orders: 220, qty: 220, sales: 18700 },
  ],
  quarterly: [
    { rank: 1, name: "Crispy Kare Kare", orders: 1350, qty: 1350, sales: 102000 },
    { rank: 2, name: "Inihaw na Liempo", orders: 880, qty: 880, sales: 65000 },
    { rank: 3, name: "Sinigang na Baboy", orders: 640, qty: 640, sales: 52000 },
  ],
  yearly: [
    { rank: 1, name: "Crispy Kare Kare", orders: 5400, qty: 5400, sales: 408000 },
    { rank: 2, name: "Inihaw na Liempo", orders: 3500, qty: 3500, sales: 260000 },
    { rank: 3, name: "Sinigang na Baboy", orders: 2800, qty: 2800, sales: 220000 },
  ],
};

const mockOrders = [
  { id: "#7-324", date: "Apr 21, 2025 05:22 PM", employee: "Cashier", type: "Sale", total: 660 },
  { id: "#7-323", date: "Apr 21, 2025 05:01 PM", employee: "Cashier", type: "Sale", total: 420 },
  { id: "#7-322", date: "Apr 21, 2025 04:36 PM", employee: "Cashier", type: "Sale", total: 95 },
  { id: "#7-321", date: "Apr 21, 2025 04:32 PM", employee: "Cashier", type: "Sale", total: 125 },
  { id: "#7-320", date: "Apr 21, 2025 04:22 PM", employee: "Cashier", type: "Sale", total: 280 },
  { id: "#7-319", date: "Apr 21, 2025 04:15 PM", employee: "Cashier", type: "Sale", total: 165 },
  { id: "#7-318", date: "Apr 21, 2025 04:11 PM", employee: "Cashier", type: "Sale", total: 231 },
  { id: "#7-317", date: "Apr 21, 2025 03:57 PM", employee: "Cashier", type: "Sale", total: 156 },
];

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/* --------------------------------- Page --------------------------------- */
export default function ReportsPage() {
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

  // Get data based on selected range, with custom date filtering
  const getFilteredData = () => {
    // For custom ranges with dates selected, we need to filter ALL data
    if (range === "custom" && customFrom && customTo) {
      // Filter chart data
      const daysData = categorySeriesByRange.days;
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      
      const fromDate = new Date(customFrom);
      const toDate = new Date(customTo);
      
      const filteredSeries = daysData.filter(item => {
        const [monthStr, dayStr] = item.x.split(" ");
        const monthIndex = monthNames.indexOf(monthStr);
        const day = parseInt(dayStr);
        const currentYear = new Date().getFullYear();
        const itemDate = new Date(currentYear, monthIndex, day);
        
        return itemDate >= fromDate && itemDate <= toDate;
      });

      // For custom date range, we need to calculate filtered data for ALL sections
      // Since we don't have real API data, we'll simulate filtering by adjusting the data
      const dateRangeLength = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
      
      // Scale down the data based on the date range length for demonstration
      const scaleFactor = Math.min(dateRangeLength / 30, 1); // Scale based on 30-day month
      
      return {
        categoryTop5: categoryTop5ByRange.days.map(item => ({
          ...item,
          net: item.net * scaleFactor
        })),
        categorySeries: filteredSeries.length > 0 ? filteredSeries : [
          { x: customFrom.split('-').slice(1).join('/'), y: 0 },
          { x: customTo.split('-').slice(1).join('/'), y: 0 }
        ],
        payments: paymentsByRange.days.map(payment => ({
          ...payment,
          tx: Math.round(payment.tx * scaleFactor),
          payAmt: payment.payAmt * scaleFactor,
          refundTx: Math.round(payment.refundTx * scaleFactor),
          refundAmt: payment.refundAmt * scaleFactor,
          net: payment.net * scaleFactor
        })),
        bestSeller: bestSellerByRange.days.map(seller => ({
          ...seller,
          orders: Math.round(seller.orders * scaleFactor),
          qty: Math.round(seller.qty * scaleFactor),
          sales: seller.sales * scaleFactor
        }))
      };
    }
    
    // For non-custom ranges, use the existing logic
    const effectiveRangeKey = range === "custom" ? "days" : range;
    return {
      categoryTop5: categoryTop5ByRange[effectiveRangeKey] || categoryTop5ByRange.days,
      categorySeries: categorySeriesByRange[effectiveRangeKey] || categorySeriesByRange.days,
      payments: paymentsByRange[effectiveRangeKey] || paymentsByRange.days,
      bestSeller: bestSellerByRange[effectiveRangeKey] || bestSellerByRange.days
    };
  };

  const { categoryTop5, categorySeries, payments, bestSeller } = getFilteredData();

  const filteredPayments = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return payments;
    return payments.filter((r) => r.type.toLowerCase().includes(s));
  }, [search, payments]);

  const pagedPayments =
    rpp1 > 0
      ? filteredPayments.slice(page1 * rpp1, page1 * rpp1 + rpp1)
      : filteredPayments;

  // 🔹 Latest Orders filtered by custom date range (example implementation)
  const filteredOrders = useMemo(() => {
    // If not in custom mode, just use all mock orders
    if (range !== "custom") {
      return mockOrders;
    }

    return mockOrders.filter((o) => {
      const d = new Date(o.date); // "Apr 21, 2025 05:22 PM"

      if (customFrom) {
        const from = new Date(customFrom + "T00:00:00");
        if (d < from) return false;
      }

      if (customTo) {
        const to = new Date(customTo + "T23:59:59");
        if (d > to) return false;
      }

      return true;
    });
  }, [range, customFrom, customTo]);

  const pagedOrders =
    rpp2 > 0
      ? filteredOrders.slice(page2 * rpp2, page2 * rpp2 + rpp2)
      : filteredOrders;

  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("md"));
  const [selectedOrder, setSelectedOrder] = useState(null);

  function onRowClick(order) {
    setSelectedOrder(order);
  }

  return (
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
                // Reset custom dates when switching away from custom
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

          {/* 🔸 Custom date range (enabled only when range === "custom") */}
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
          <Button
            variant="contained"
            color="error"
            startIcon={<PictureAsPdfIcon />}
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
                <TableCell>Payment Amount</TableCell>
                <TableCell>Refund Transactions</TableCell>
                <TableCell>Refund Amount</TableCell>
                <TableCell>Net Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedPayments.map((r) => (
                <TableRow key={r.type}>
                  <TableCell>{r.type}</TableCell>
                  <TableCell>{r.tx}</TableCell>
                  <TableCell>{peso(r.payAmt)}</TableCell>
                  <TableCell>{r.refundTx}</TableCell>
                  <TableCell>{peso(r.refundAmt)}</TableCell>
                  <TableCell>{peso(r.net)}</TableCell>
                </TableRow>
              ))}
              {pagedPayments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
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
                <TableCell>Quantity Sold</TableCell>
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
                  <TableCell>{r.qty}</TableCell>
                  <TableCell>{peso(r.sales)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ================= Latest Order ================= */}
      <Paper sx={{ p: 2, overflow: "hidden" }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" mb={2}>
          <MetricCard icon={<ReceiptLongIcon />} label="All Receipts" value={filteredOrders.length} />
          <MetricCard
            icon={<PaymentsIcon />}
            label="Sales"
            value={filteredOrders.filter(o => o.type === "Sale").length}
            color="success"
          />
          <MetricCard
            icon={<ReplayIcon />}
            label="Refunds"
            value={filteredOrders.filter(o => o.type === "Refund").length}
            color="error"
          />
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          {/* Left: table */}
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
                  {pagedOrders.map((r) => (
                    <TableRow
                      key={r.id}
                      hover
                      onClick={() => onRowClick(r)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{r.id}</TableCell>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{r.employee}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell align="right">{peso(r.total)}</TableCell>
                    </TableRow>
                  ))}
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

            {/* Small screens: preview BELOW the table */}
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

          {/* Desktop: preview on the RIGHT */}
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
      </Paper>
    </Box>
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
  const vat = order.total * 0.12;

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800} align="right">
        {peso(order.total)}
      </Typography>
      <Divider />

      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">Recipient</Typography>
        <Typography variant="body2" fontWeight={700}>
          KYLA
        </Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">Time:</Typography>
        <Typography variant="body2" fontWeight={700}>
          {order.date.split(" ").slice(-2).join(" ")}
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
        <Typography variant="body2">VAT, 12%</Typography>
        <Typography variant="body2">{peso(vat)}</Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">Payment:</Typography>
        <Typography variant="body2" fontWeight={700}>
          Cash
        </Typography>
      </Stack>

      <Divider />

      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">{order.date}</Typography>
        <Typography variant="body2">{order.id}</Typography>
      </Stack>
    </Stack>
  );
}