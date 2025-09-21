// Frontend/src/pages/Dashboard/DashboardPage.jsx
import { useMemo } from "react";
import {
  Box,
  Grid,
  Paper,
  Stack,
  Typography,
  Divider,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
  LinearProgress,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import LocalDiningIcon from "@mui/icons-material/LocalDining";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ScheduleIcon from "@mui/icons-material/Schedule";

/** Peso formatter */
const formatPhp = (n) =>
  `₱${Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function DashboardPage() {
  const theme = useTheme();
  const isLargeScreen = useMediaQuery(theme.breakpoints.up("lg"));
  const isMediumScreen = useMediaQuery(theme.breakpoints.up("md"));
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));
  
  // --- Demo data (wire these to your real queries/state) ---
  const kpis = useMemo(
    () => [
      {
        icon: <TrendingUpIcon />,
        title: "Sales Today",
        value: formatPhp(31313.0),
        sub: "Updated after each successful order",
      },
      {
        icon: <ShoppingBagIcon />,
        title: "Total Orders",
        value: "324",
        sub: "+6% vs. yesterday",
      },
      {
        icon: <LocalDiningIcon />,
        title: "Tables Active",
        value: "23",
        sub: "Dining in progress",
      },
      {
        icon: <ReceiptLongIcon />,
        title: "Pending KOT",
        value: "56",
        sub: "Kitchen Order Tickets",
      },
    ],
    []
  );

  const kitchenQueue = [
    {
      id: "ORD-1024",
      label: "Grilled Chicken Set",
      updated: "7 min ago",
      eta: "25.08.2025",
      progress: 24,
      color: "primary",
    },
    {
      id: "ORD-1025",
      label: "Pork Sisig",
      updated: "1 min ago",
      eta: "21.08.2025",
      progress: 56,
      color: "secondary",
    },
    {
      id: "ORD-1026",
      label: "Seafood Platter",
      updated: "3 days ago",
      eta: "16.09.2025",
      progress: 64,
      color: "warning",
    },
    {
      id: "ORD-1027",
      label: "Halo-Halo",
      updated: "1 week ago",
      eta: "26.11.2025",
      progress: 14,
      color: "info",
    },
  ];

  const customerMessages = [
    {
      name: "Konnor Guzman",
      text: "Table 3 asking for extra rice",
    },
    {
      name: "Travis Fuller",
      text: "Status of takeout order #1025?",
    },
    {
      name: "Alfredo Elliott",
      text: "Is peanut sauce optional?",
    },
    {
      name: "Derrick Simmons",
      text: "Allergic to shrimp—note for order",
    },
  ];

  const incomePerMonth = [
    1760, 2360, 4210, 3970, 3840, 4220, 4210, 4310, 2370, 0, 0, 0,
  ];

  return (
    <Box 
      sx={{ 
        p: isSmallScreen ? 1 : 2,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
      className="dashboard-container"
    >
      {/* KPI CARDS - Responsive grid */}
      <Grid container spacing={isSmallScreen ? 1 : 2} sx={{ mb: isSmallScreen ? 1 : 2 }}>
        {kpis.map((kpi) => (
          <Grid key={kpi.title} item xs={6} sm={6} md={3}>
            <StatCard {...kpi} compact={isSmallScreen} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={isSmallScreen ? 1 : 2}>
        {/* MAIN CONTENT AREA */}
        <Grid item xs={12} lg={isLargeScreen ? 8 : 12} xl={isLargeScreen ? 9 : 12}>
          {/* KITCHEN QUEUE / ONGOING ORDERS */}
          <Paper sx={{ mb: isSmallScreen ? 1 : 2 }}>
            <Box px={isSmallScreen ? 1.5 : 2} py={isSmallScreen ? 1 : 1.5} display="flex" alignItems="center" gap={1}>
              <RestaurantMenuIcon fontSize={isSmallScreen ? "small" : "medium"} />
              <Typography variant={isSmallScreen ? "body1" : "subtitle1"} fontWeight={700} sx={{ flex: 1 }}>
                Kitchen Queue
              </Typography>
              <Chip size="small" label="View All" variant="outlined" />
            </Box>
            <Divider />
            <Stack p={isSmallScreen ? 0.5 : 1} spacing={isSmallScreen ? 0.5 : 1}>
              {kitchenQueue.map((o) => (
                <OrderRow key={o.id} {...o} compact={isSmallScreen} />
              ))}
            </Stack>
          </Paper>

          {/* BOTTOM ROW - Contact List and Recent Payments */}
          <Grid container spacing={isSmallScreen ? 1 : 2}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ height: '100%' }}>
                <SectionHeader title="Contact List" icon={<PeopleAltIcon />} compact={isSmallScreen} />
                <Divider />
                <Stack p={isSmallScreen ? 1 : 1.25} spacing={isSmallScreen ? 0.75 : 1}>
                  {customerMessages.slice(0, 3).map((c) => (
                    <ContactRow key={c.name} name={c.name} text={c.text} compact={isSmallScreen} />
                  ))}
                </Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ height: '100%' }}>
                <SectionHeader title="Recent Payments" icon={<ReceiptLongIcon />} compact={isSmallScreen} />
                <Divider />
                <Stack p={isSmallScreen ? 1 : 1.25} spacing={isSmallScreen ? 0.75 : 1}>
                  <PaymentRow name="Konnor Guzman" ts="Dec 21, 2025 · 08:05" amount={660.22} compact={isSmallScreen} />
                  <PaymentRow name="Henry Curtis" ts="Dec 19, 2025 · 11:55" amount={33.63} compact={isSmallScreen} />
                  <PaymentRow name="Alexis Moore" ts="Dec 18, 2025 · 16:40" amount={128.0} compact={isSmallScreen} />
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Grid>

        {/* SIDEBAR - Only appears on larger screens */}
        {isMediumScreen && (
          <Grid item xs={12} lg={4} xl={3}>
            <Stack spacing={isSmallScreen ? 1 : 2}>
              {/* CLIENT MESSAGES */}
              <Paper>
                <SectionHeader title="Customer Messages" icon={<PeopleAltIcon />} compact={isSmallScreen} />
                <Divider />
                <Stack p={isSmallScreen ? 1 : 1.25} spacing={isSmallScreen ? 0.75 : 1}>
                  {customerMessages.map((m) => (
                    <MessageRow key={m.name} name={m.name} text={m.text} compact={isSmallScreen} />
                  ))}
                </Stack>
              </Paper>

              {/* INCOME BAR CHART */}
              <Paper>
                <SectionHeader title="Income" icon={<TrendingUpIcon />} compact={isSmallScreen} />
                <Divider />
                <Box p={isSmallScreen ? 1 : 2}>
                  <IncomeBars values={incomePerMonth} compact={isSmallScreen} />
                </Box>
              </Paper>

              {/* MINI CALENDAR - Only show on larger screens */}
              {isLargeScreen && (
                <Paper>
                  <SectionHeader title="September 2025" icon={<ScheduleIcon />} compact={isSmallScreen} />
                  <Divider />
                  <MiniCalendar monthIndex={8} year={2025} compact={isSmallScreen} />
                </Paper>
              )}
            </Stack>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

// ---------- Reusable bits ----------
function StatCard({ icon, title, value, sub, compact = false }) {
  return (
    <Paper sx={{ height: "100%", minWidth: 0 }}>
      <Stack direction="row" alignItems="center" spacing={compact ? 1 : 1.25} p={compact ? 1 : 1.25}>
        <Avatar variant="rounded" sx={{ width: compact ? 32 : 40, height: compact ? 32 : 40, flexShrink: 0 }}>
          {icon}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <Typography variant="caption" color="text.secondary" noWrap fontSize={compact ? '0.7rem' : 'inherit'}>
            {title}
          </Typography>
          <Typography variant={compact ? "body2" : "h6"} noWrap fontWeight={700}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap fontSize={compact ? '0.65rem' : 'inherit'}>
            {sub}
          </Typography>
        </Box>
        <Tooltip title="More">
          <IconButton size="small">
            <MoreHorizIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

function SectionHeader({ title, icon, compact = false }) {
  return (
    <Box px={compact ? 1 : 1.5} py={compact ? 0.75 : 1.25} display="flex" alignItems="center" gap={1}>
      {icon}
      <Typography variant={compact ? "body1" : "subtitle1"} fontWeight={700} sx={{ flex: 1 }} noWrap>
        {title}
      </Typography>
      <IconButton size="small">
        <MoreHorizIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

function OrderRow({ id, label, updated, eta, progress, color = "primary", compact = false }) {
  return (
    <Box sx={{ px: compact ? 1 : 1.25, py: compact ? 0.75 : 1 }}>
      <Stack direction="row" alignItems="center" spacing={compact ? 1 : 1.25}>
        <Avatar variant="rounded" sx={{ width: compact ? 28 : 34, height: compact ? 28 : 34, flexShrink: 0 }}>
          <RestaurantMenuIcon fontSize="small" />
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Typography variant={compact ? "caption" : "body2"} fontWeight={compact ? 600 : 400} noWrap>
            {label}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap fontSize={compact ? '0.65rem' : 'inherit'}>
            Updated {updated} • ETA: {eta}
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            color={color} 
            sx={{ mt: 0.5, height: 4, borderRadius: 999 }} 
          />
        </Box>
        <Typography 
          variant="caption" 
          color="text.secondary" 
          sx={{ minWidth: 28, textAlign: "right", flexShrink: 0 }}
          fontSize={compact ? '0.65rem' : 'inherit'}
        >
          {progress}%
        </Typography>
      </Stack>
    </Box>
  );
}

function MessageRow({ name, text, compact = false }) {
  return (
    <Box sx={{ px: compact ? 1 : 1.25, py: compact ? 0.75 : 1 }}>
      <Stack direction="row" spacing={compact ? 1 : 1.25} alignItems="center">
        <Avatar sx={{ width: compact ? 30 : 36, height: compact ? 30 : 36, flexShrink: 0 }}>{name[0]}</Avatar>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Typography variant={compact ? "caption" : "body2"} fontWeight={compact ? 600 : 400} noWrap>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap fontSize={compact ? '0.65rem' : 'inherit'}>
            {text}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

function ContactRow({ name, text, compact = false }) {
  return (
    <Box sx={{ px: compact ? 1 : 1.25, py: compact ? 0.75 : 1 }}>
      <Stack direction="row" spacing={compact ? 1 : 1.25} alignItems="center">
        <Avatar sx={{ width: compact ? 30 : 36, height: compact ? 30 : 36, flexShrink: 0 }}>{name[0]}</Avatar>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Typography variant={compact ? "caption" : "body2"} fontWeight={compact ? 600 : 400} noWrap>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap fontSize={compact ? '0.65rem' : 'inherit'}>
            {text}
          </Typography>
        </Box>
        <Chip size="small" label="Call" variant="outlined" sx={{ flexShrink: 0, fontSize: compact ? '0.65rem' : 'inherit' }} />
      </Stack>
    </Box>
  );
}

function PaymentRow({ name, ts, amount, compact = false }) {
  return (
    <Box sx={{ px: compact ? 1 : 1.25, py: compact ? 0.75 : 1 }}>
      <Stack direction="row" spacing={compact ? 1 : 1.25} alignItems="center">
        <Avatar sx={{ width: compact ? 30 : 36, height: compact ? 30 : 36, flexShrink: 0 }}>{name[0]}</Avatar>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Typography variant={compact ? "caption" : "body2"} fontWeight={compact ? 600 : 400} noWrap>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap fontSize={compact ? '0.65rem' : 'inherit'}>
            {ts}
          </Typography>
        </Box>
        <Typography variant={compact ? "caption" : "body2"} fontWeight={700} sx={{ flexShrink: 0 }} fontSize={compact ? '0.7rem' : 'inherit'}>
          {formatPhp(amount)}
        </Typography>
      </Stack>
    </Box>
  );
}

function IncomeBars({ values, compact = false }) {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const max = Math.max(...values, 1);
  return (
    <Stack direction="row" alignItems="end" justifyContent="space-between" gap={0.25} sx={{ height: compact ? 100 : 120 }}>
      {values.map((v, i) => (
        <Stack key={i} alignItems="center" spacing={0.25} sx={{ flex: 1 }}>
          <Box sx={{ flex: 1, display: "flex", alignItems: "end", width: "100%" }}>
            <Box
              sx={(theme) => ({
                height: `${Math.round((v / max) * 100)}%`,
                width: "100%",
                borderRadius: 1,
                backgroundColor: theme.palette.primary.main,
                opacity: 0.9,
              })}
              title={`${labels[i]}: ${formatPhp(v)}`}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" fontSize={compact ? "0.55rem" : "0.65rem"}>
            {labels[i]}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function MiniCalendar({ monthIndex, year, compact = false }) {
  // monthIndex: 0 = Jan
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const first = new Date(year, monthIndex, 1);
  const startDay = first.getDay(); // 0..6 (Sun..Sat)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today = new Date();

  // Build a flat list with leading blanks, then chunk into weeks of 7
  const cells = Array.from({ length: startDay }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );
  while (cells.length % 7 !== 0) cells.push(null); // pad trailing blanks

  const isToday = (d) =>
    d &&
    today.getFullYear() === year &&
    today.getMonth() === monthIndex &&
    today.getDate() === d;

  const daySize = compact ? 26 : 32; // cell height/width

  return (
    <Box p={compact ? 1 : 1.5}>
      {/* Header row */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: compact ? 0.25 : 0.5,
          mb: compact ? 0.5 : 1,
        }}
      >
        {weekdayNames.map((n) => (
          <Box key={n} sx={{ textAlign: "center" }}>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ fontSize: compact ? "0.6rem" : "0.7rem" }}
            >
              {n}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Calendar days */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: compact ? 0.25 : 0.5,
        }}
      >
        {cells.map((d, i) => (
          <Box
            key={i}
            sx={(theme) => ({
              height: daySize,
              borderRadius: 1,
              display: "grid",
              placeItems: "center",
              border: isToday(d)
                ? `1px solid ${theme.palette.primary.main}55`
                : `1px solid transparent`,
              backgroundColor: isToday(d)
                ? `${theme.palette.primary.main}22`
                : "transparent",
            })}
          >
            <Typography
              variant="caption"
              sx={{ fontSize: compact ? "0.7rem" : "0.8rem" }}
            >
              {d ?? ""}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
