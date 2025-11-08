// Frontend/src/pages/Dashboard/DashboardPage.jsx
import { useMemo, useState } from "react";
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
  Divider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export default function DashboardPage() {
  const theme = useTheme();

  // ------------------------ Local-only breakpoint map ------------------------
  // Do NOT change global theme; we scope everything here.
  const BP = { sm: 576, md: 992, lg: 1200 };

  // Media query helpers (local)
  const isBelowSm = useMediaQuery(`(max-width:${BP.sm - 1}px)`);
  const isBelowMd = useMediaQuery(`(max-width:${BP.md - 1}px)`);
  const isLgUp    = useMediaQuery(`(min-width:${BP.lg}px)`);

  // Handy CSS @media keys for sx objects
  const mq = {
    smUp: `@media (min-width:${BP.sm}px)`,
    mdUp: `@media (min-width:${BP.md}px)`,
    lgUp: `@media (min-width:${BP.lg}px)`,
  };

  /* ---------------------------- Mock / demo data ---------------------------- */
  const [range, setRange] = useState("Daily");
  const salesSeries = useMemo(
    () => [
      { name: "Item 1", s1: 12, s2: 5, s3: 0 },
      { name: "Item 2", s1: 30, s2: 12, s3: 8 },
      { name: "Item 3", s1: 22, s2: 35, s3: 18 },
      { name: "Item 4", s1: 33, s2: 15, s3: 15 },
      { name: "Item 5", s1: 35, s2: 30, s3: 28 },
    ],
    []
  );

  const yesterdaySales = [
    { item: "etc", count: 15 },
    { item: "etc", count: 29 },
  ];
  const bestSellers = ["etc", "etc", "etc", "etc", "etc"];
  const lowStock = ["etc", "etc", "etc", "etc", "etc"];

  const paymentData = [
    { name: "Cash", value: 62.5 },
    { name: "Gcash/Maya", value: 25 },
    { name: "Card", value: 12.5 },
  ];

  /* ------------------------------ Card styles ------------------------------ */
  const cardSx = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    borderRadius: 3,
    overflow: "hidden",
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
  };

  const cardHeaderSx = {
    px: 2,
    py: 1.5,
    fontWeight: 800,
    textAlign: "center",
    borderBottom: `1px solid ${theme.palette.divider}`,
  };

  const row2Min = { base: 260, md: 320 };

  /* ------------------------------- Main layout ----------------------------- */
  return (
    <Box p={2}>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "stretch",
          gridTemplateColumns: "repeat(12, 1fr)",

          // Local responsive adjustments (not using theme.breakpoints)
          [mq.smUp]: {
            gridTemplateColumns: "repeat(12, 1fr)",
          },
          [mq.mdUp]: {
            gridTemplateColumns: "repeat(12, 1fr)",
          },
          [mq.lgUp]: {
            gridTemplateColumns: "repeat(12, 1fr)",
          },
        }}
      >
        {/* ============================ Row 1 ============================ */}
        <Box
          sx={{
            gridColumn: "span 12",
            minHeight: { xs: 300 },

            [mq.mdUp]: {
              gridColumn: "span 8",
              minHeight: 420,
            },
            [mq.lgUp]: {
              gridColumn: "span 8",
              minHeight: 440,
            },
          }}
        >
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <Typography variant="h6" fontWeight={800}>
                Sales
              </Typography>
            </Box>

            <Box sx={{ p: 2, flex: 1 }}>
              <Box
                sx={{
                  display: "inline-flex",
                  mb: 1,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  px: 1,
                }}
              >
                <Select
                  size="small"
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  variant="standard"
                  disableUnderline
                >
                  {["Daily", "Weekly", "Monthly", "Yearly"].map((opt) => (
                    <MenuItem key={opt} value={opt}>
                      {opt}
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              <Box sx={{ width: "100%", height: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={salesSeries}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="s1"
                      strokeWidth={2}
                      dot={false}
                      stroke={theme.palette.primary.main}
                    />
                    <Line
                      type="monotone"
                      dataKey="s2"
                      strokeWidth={2}
                      dot={false}
                      stroke={theme.palette.secondary.main}
                    />
                    <Line
                      type="monotone"
                      dataKey="s3"
                      strokeWidth={2}
                      dot={false}
                      stroke="#82ca9d"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          </Paper>
        </Box>

        <Box
          sx={{
            gridColumn: "span 12",
            minHeight: { xs: 300 },

            [mq.smUp]: { gridColumn: "span 6" },
            [mq.mdUp]: { gridColumn: "span 4", minHeight: 420 },
            [mq.lgUp]: { minHeight: 440 },
          }}
        >
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <Typography variant="h6" fontWeight={800}>
                Low Stock
              </Typography>
            </Box>
            <Box sx={{ p: 2, flex: 1, overflow: "auto" }}>
              <List dense>
                {["etc", "etc", "etc", "etc", "etc"].map((x, i) => (
                  <ListItem key={i} disableGutters>
                    <ListItemText primary={`${i + 1}. ${x}`} />
                  </ListItem>
                ))}
              </List>
            </Box>
          </Paper>
        </Box>

        {/* ============================ Row 2 ============================ */}
        <Box
          sx={{
            gridColumn: "span 12",
            minHeight: row2Min.base,
            [mq.smUp]: { gridColumn: "span 6" },
            [mq.mdUp]: { gridColumn: "span 4", minHeight: row2Min.md },
          }}
        >
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <Typography variant="subtitle1" fontWeight={800}>
                Yesterday Sale
              </Typography>
            </Box>
            <Box sx={{ p: 2, flex: 1 }}>
              <TableContainer sx={{ height: "100%" }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell align="right">Sales Count</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {yesterdaySales.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.item}</TableCell>
                        <TableCell align="right">{r.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>
        </Box>

        <Box
          sx={{
            gridColumn: "span 12",
            minHeight: row2Min.base,
            [mq.smUp]: { gridColumn: "span 6" },
            [mq.mdUp]: { gridColumn: "span 4", minHeight: row2Min.md },
          }}
        >
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <Typography variant="h6" fontWeight={800}>
                Best Seller
              </Typography>
            </Box>
            <Box sx={{ p: 2, flex: 1, overflow: "auto" }}>
              <List dense>
                {["etc", "etc", "etc", "etc", "etc"].map((x, i) => (
                  <ListItem key={i} disableGutters>
                    <ListItemText primary={`${i + 1}. ${x}`} />
                  </ListItem>
                ))}
              </List>
            </Box>
          </Paper>
        </Box>

        <Box
          sx={{
            gridColumn: "span 12",
            minHeight: row2Min.base,
            [mq.smUp]: { gridColumn: "span 6" },
            [mq.mdUp]: { gridColumn: "span 4", minHeight: row2Min.md },
          }}
        >
          <Paper sx={cardSx}>
            <Box sx={cardHeaderSx}>
              <Typography variant="subtitle1" fontWeight={800}>
                DAILY PAYMENT
              </Typography>
            </Box>
            <Box sx={{ p: 2, flex: 1 }}>
              <Box sx={{ width: "100%", height: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius="80%"
                      labelLine={false}
                    >
                      {paymentData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={["#73d7e7", "#57c1cf", "#2d8fa0"][i % 3]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <Divider sx={{ mt: 1, mb: 1 }} />
              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                {paymentData.map((d) => (
                  <Typography key={d.name} variant="caption">
                    {d.name}: {d.value}%
                  </Typography>
                ))}
              </Box>
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}