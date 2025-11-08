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
  "& .MuiTableCell-root": { py: 1.25, px: 2 },        // body + head
  "& thead .MuiTableCell-root": {
    fontWeight: 700,
    position: "sticky",
    top: 0,
    background: "background.paper",
    zIndex: 1,
  },
};

/* -------------------------------- Mock data ------------------------------- */
const mockCategoryTop5 = [
  { name: "Tanghalian", net: 2283.2 },
  { name: "Recipe", net: 0 },
  { name: "Umagahan", net: 0 },
  { name: "Pampagana", net: 0 },
  { name: "Meryenda", net: 0 },
];

const mockCategorySeries = [
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
];

const mockPayments = [
  { type: "Card", tx: 0, payAmt: 0, refundTx: 0, refundAmt: 0, net: 0 },
  { type: "Cash", tx: 20, payAmt: 2784, refundTx: 0, refundAmt: 0, net: 2784 },
  { type: "Gcash/Maya", tx: 10, payAmt: 2783, refundTx: 0, refundAmt: 0, net: 2783 },
];

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

const mockBestSeller = [
  { rank: 1, name: "Crispy Kare Kare", orders: 30, qty: 30, sales: 2283.2 },
  { rank: 2, name: "ETC", orders: 0, qty: 0, sales: 0 },
  { rank: 3, name: "ETC", orders: 0, qty: 0, sales: 0 },
];

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ResponsiveLineChart({
  points,
  height = 240,
  pt = 10, pr = 14, pb = 30, pl = 44,
  lineColor = "#6C63FF",
  lineWidth = 1.6,
  showDots = true,
  dotRadius = 2,
  formatY = (v) => `₱${Math.round(v).toLocaleString()}`
}) {
  // Use a larger internal viewBox for better text clarity
  const vbW = 1000, vbH = 320;
  const iw = vbW - (pl + pr);
  const ih = vbH - (pt + pb);
  const x0 = pl, y0 = pt;

  if (!points?.length) return null;

  // ----- nice Y-scale (no weird ₱-132)
  const ys = points.map(p => p.y);
  const dMin = Math.min(0, ...ys);
  const dMax = Math.max(...ys);
  const pad = Math.max(1, (dMax - dMin) * 0.08);
  let yMin = Math.max(0, dMin - pad);           // clamp at 0 for sales
  let yMax = dMax + pad;

  const niceStep = (raw) => {
    const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const f = raw / pow;
    const niceF = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return niceF * pow;
  };
  const step = niceStep((yMax - yMin) / 4);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;
  const yTicks = [];
  for (let v = yMin; v <= yMax + 0.5 * step; v += step) yTicks.push(v);

  // scales
  const xAt = (i) => x0 + (iw * i) / Math.max(1, points.length - 1);
  const yAt = (v) => y0 + ih - ((v - yMin) / Math.max(1, yMax - yMin)) * ih;

  // smooth path (cardinal → cubic)
  const t = 0.2;
  const P = points.map((p, i) => ({ x: xAt(i), y: yAt(p.y), label: p.x, val: p.y }));
  const segs = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] ?? P[i];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[i + 2] ?? P[i + 1];
    const c1x = p1.x + (p2.x - p0.x) * t / 6;
    const c1y = p1.y + (p2.y - p0.y) * t / 6;
    const c2x = p2.x - (p3.x - p1.x) * t / 6;
    const c2y = p2.y - (p3.y - p1.y) * t / 6;
    segs.push(`C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
  }
  const d = `M ${P[0].x.toFixed(1)} ${P[0].y.toFixed(1)} ${segs.join(" ")}`;

  // X label thinning
  const stepX = Math.max(1, Math.ceil(points.length / 7));

  return (
    <Box sx={{ width: "100%", height, overflow: "hidden" }}>
      <svg
        width="100%" height="100%"
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* vertical dashed grid per X point */}
        {P.map((p, i) => (
          <line key={`vg-${i}`} x1={p.x} y1={y0} x2={p.x} y2={y0 + ih}
            stroke="#E9E9F2" strokeWidth="1"
            shapeRendering="crispEdges"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="4 6"
          />
        ))}

        {/* horizontal grid */}
        {yTicks.map((v, i) => (
          <line key={`hg-${i}`} x1={x0} y1={yAt(v)} x2={x0 + iw} y2={yAt(v)}
            stroke="#F1F1F6" strokeWidth="1"
            shapeRendering="crispEdges"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* axes */}
        <line x1={x0} y1={y0} x2={x0} y2={y0 + ih}
          stroke="#E3E3EC" strokeWidth="1"
          shapeRendering="crispEdges" vectorEffect="non-scaling-stroke" />
        <line x1={x0} y1={y0 + ih} x2={x0 + iw} y2={y0 + ih}
          stroke="#E3E3EC" strokeWidth="1"
          shapeRendering="crispEdges" vectorEffect="non-scaling-stroke" />

        {/* line */}
        <path d={d}
          fill="none"
          stroke={lineColor}
          strokeWidth={lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* dots + tooltips */}
        {showDots && P.map((p, i) => (
          <g key={`pt-${i}`}>
            <circle cx={p.x} cy={p.y} r={dotRadius}
              fill={lineColor} vectorEffect="non-scaling-stroke" />
            <title>{`${points[i].x}\n${formatY(points[i].y)}`}</title>
          </g>
        ))}

        {/* Y labels */}
        {yTicks.map((v, i) => (
          <text key={`yl-${i}`}
            x={x0 - 8} y={yAt(v) + 4}
            textAnchor="end"
            fontSize="12" fill="#6F6F7A">
            {formatY(v)}
          </text>
        ))}

        {/* X labels */}
        {points.map((p, i) => (i % stepX === 0) && (
          <text key={`xl-${i}`}
            x={xAt(i)} y={y0 + ih + 18}
            textAnchor="middle"
            fontSize="12" fill="#6F6F7A">
            {p.x}
          </text>
        ))}
      </svg>
    </Box>
  );
}

/* --------------------------------- Page --------------------------------- */
export default function ReportsPage() {
  const [report, setReport] = useState("salesByCategory");
  const [range, setRange] = useState("days");

  const [search, setSearch] = useState("");
  const [page1, setPage1] = useState(0);
  const [rpp1, setRpp1] = useState(10);

  const [page2, setPage2] = useState(0);
  const [rpp2, setRpp2] = useState(10);

  const filteredPayments = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return mockPayments;
    return mockPayments.filter(r => r.type.toLowerCase().includes(s));
  }, [search]);

  const pagedPayments = rpp1 > 0
    ? filteredPayments.slice(page1 * rpp1, page1 * rpp1 + rpp1)
    : filteredPayments;

  const pagedOrders = rpp2 > 0
    ? mockOrders.slice(page2 * rpp2, page2 * rpp2 + rpp2)
    : mockOrders;

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
        <Stack direction="row" useFlexGap alignItems="center" flexWrap="wrap" rowGap={1.5} columnGap={2}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="report-type">Sales by Category</InputLabel>
            <Select
              labelId="report-type"
              value={report}
              label="Sales by Category"
              onChange={(e) => setReport(e.target.value)}
            >
              <MenuItem value="salesByCategory">Sales by Category</MenuItem>
              <MenuItem value="salesByPayment">Sales by Payment Type</MenuItem>
              <MenuItem value="latestOrder">Latest Order</MenuItem>
              <MenuItem value="bestSeller">Best Seller</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="range">Days</InputLabel>
            <Select
              labelId="range"
              value={range}
              label="Days"
              onChange={(e) => setRange(e.target.value)}
            >
              <MenuItem value="days">Days</MenuItem>
              <MenuItem value="weeks">Weeks</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="quarterly">Quarterly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" color="error" startIcon={<PictureAsPdfIcon />}>PDF</Button>
        </Stack>
      </Paper>

      {/* ================= Sales by Category ================= */}
      {report === "salesByCategory" && (
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
                    {mockCategoryTop5.map((r, i) => (
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
                {/* 💡 Recharts-based chart */}
                <Box sx={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart
                      data={mockCategorySeries}
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
      )}

      {/* ================= Sales by Payment Type ================= */}
      {report === "salesByPayment" && (
        <Paper sx={{ p: 2, overflow: "hidden" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1} gap={2} flexWrap="wrap">
            <Typography fontWeight={700}>Sales by Payment Type</Typography>
            <TextField
              size="small"
              placeholder="Search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage1(0); }}
              InputProps={{ endAdornment: (<InputAdornment position="end"><SearchIcon /></InputAdornment>) }}
              sx={{ width: { xs: "100%", sm: 300 } }}
            />
          </Stack>

          <TableContainer component={Paper} elevation={0} className="scroll-x"
            sx={{ width: "100%", borderRadius: 1, overflowX: "auto" }}>
            <Table stickyHeader
              sx={{
                minWidth: { xs: 720, sm: 900, md: 1080 },
                ...comfyCells,
              }}>
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
                  <TableRow><TableCell colSpan={6} align="center">No results</TableCell></TableRow>
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
            onRowsPerPageChange={(e) => { setRpp1(parseInt(e.target.value, 10)); setPage1(0); }}
            rowsPerPageOptions={[5, 10, 25, { label: "All", value: -1 }]}
            labelRowsPerPage="Rows per page:"
          />
        </Paper>
      )}

      {/* ================= Latest Order ================= */}
      {report === "latestOrder" && (
        <Paper sx={{ p: 2, overflow: "hidden" }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" mb={2}>
            <MetricCard icon={<ReceiptLongIcon />} label="All Receipts" value={27} />
            <MetricCard icon={<PaymentsIcon />} label="Sales" value={26} color="success" />
            <MetricCard icon={<ReplayIcon />} label="Refunds" value={1} color="error" />
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            {/* Left: table */}
            <Box sx={{ flex: 2, minWidth: 300 }}>
              <TableContainer component={Paper} elevation={0} className="scroll-x"
                sx={{ width: "100%", borderRadius: 1, overflowX: "auto" }}>
                <Table stickyHeader
                sx={{
                  minWidth: { xs: 720, sm: 900, md: 1080 },
                  ...comfyCells,
                }}>
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
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component="div"
                count={mockOrders.length}
                page={page2}
                onPageChange={(_, p) => setPage2(p)}
                rowsPerPage={rpp2}
                onRowsPerPageChange={(e) => { setRpp2(parseInt(e.target.value, 10)); setPage2(0); }}
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
                <Paper variant="outlined" sx={{ p: 2, height: "100%", borderRadius: 2 }}>
                  {selectedOrder ? (
                    <ReceiptPreview order={selectedOrder} />
                  ) : (
                    <Box sx={{ color: "text.secondary", display: "grid", placeItems: "center", height: "100%" }}>
                      <Typography variant="body2">Select a receipt to view details</Typography>
                    </Box>
                  )}
                </Paper>
              </Box>
            )}
          </Stack>
        </Paper>
      )}

      {/* ================= Best Seller ================= */}
      {report === "bestSeller" && (
        <Paper sx={{ p: 2, overflow: "hidden" }}>
          <Typography fontWeight={700} mb={1}>Best Seller</Typography>
          <TableContainer component={Paper} elevation={0} className="scroll-x"
            sx={{ width: "100%", borderRadius: 1, overflowX: "auto" }}>
            <Table stickyHeader
              sx={{
                minWidth: { xs: 720, sm: 900, md: 1080 },
                ...comfyCells,
              }}>
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
                {mockBestSeller.map((r) => (
                  <TableRow key={r.rank}>
                    <TableCell>{r.rank}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar variant="rounded" sx={{ width: 28, height: 28, fontSize: 12 }}>
                          {r.name.slice(0,1).toUpperCase()}
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
      )}
    </Box>
  );
}

/* ------------------------- Small metric card ------------------------- */
function MetricCard({ icon, label, value, color = "default" }) {
  return (
    <Paper elevation={0} sx={{ px: 2, py: 1.5, minWidth: 200, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Chip icon={icon} label={label} variant="outlined" color={color === "default" ? "default" : color} />
        <Box flexGrow={1} />
        <Typography fontWeight={800} fontSize="1.25rem">{value}</Typography>
      </Stack>
    </Paper>
  );
}

/* ------------------------- Receipt detail preview ------------------------- */
function ReceiptPreview({ order }) {
  // mock line items to demo layout
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