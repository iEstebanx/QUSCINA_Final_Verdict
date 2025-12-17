// Frontend/src/components/Header/AppHeader.jsx
import { useMemo } from "react";
import PropTypes from "prop-types";
import {
  useLocation,
  Link as RouterLink,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Box,
  Breadcrumbs,
  Link,
  Typography,
  IconButton,
  Button,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useShift } from "@/context/ShiftContext";

export const APPBAR_HEIGHT = 64;

export default function AppHeader({
  collapsed,
  onToggle,
  width = 240,
  collapsedWidth = 72,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const { hasShift } = useShift() || {};

  const selectedOrderId = params.get("orderId");
  const isPosOrdersPage = location.pathname === "/pos/orders";
  const isPosChargePage = location.pathname === "/pos/charge";
  const isPosRefundPage = location.pathname === "/pos/refund";
  const isPosCashManagementPage = location.pathname === "/pos/cash-management";

  // --- Split flags via query params (same idea as Cashier POS) ---
  const splitOn = params.get("split") === "1";
  const splitLocked = params.get("splitlock") === "1";

  const backLocked = params.get("backlock") === "1";

  const toggleSplit = () => {
    const next = new URLSearchParams(params);
    if (splitOn) {
      next.delete("split");
      next.delete("splitlock");
    } else {
      next.set("split", "1");
    }
    setParams(next, { replace: true });
  };

  // Pages that should be "full width" and hide breadcrumbs
  const isPosFocusedPage = isPosChargePage || isPosRefundPage || isPosCashManagementPage;

  const labelMap = {
    "": "Home",
    dashboard: "Dashboard",
    users: "Users Management",
    reports: "Reports",
    menu: "Menu",
    inventory: "Inventory",
    settings: "Settings",
    items: "Item",
    pos: "POS",
    orders: "Orders",
    refund: "Refund",
    "shift-management": "Shift Management",
  };

  const groupFirstChild = {
    menu: "items",
    settings: "users",
  };

  const segments = useMemo(
    () => location.pathname.split("/").filter(Boolean),
    [location.pathname]
  );

  const crumbs = useMemo(() => {
    let pathAcc = "";
    return segments.map((seg, idx) => {
      pathAcc += `/${seg}`;
      const isLast = idx === segments.length - 1;

      let label = labelMap[seg] || seg.replace(/-/g, " ");
      label = label.charAt(0).toUpperCase() + label.slice(1);

      if (isLast) {
        return (
          <Typography key={pathAcc} color="text.primary">
            {label}
          </Typography>
        );
      }

      let target = pathAcc;
      const firstChild = groupFirstChild[seg];
      if (firstChild) {
        target = `${pathAcc}/${firstChild}`;
      }

      return (
        <Link
          key={pathAcc}
          component={RouterLink}
          underline="hover"
          color="inherit"
          to={target}
        >
          {label}
        </Link>
      );
    });
  }, [segments]);

  const leftOffset = {
    xs: 0,
    sm: collapsed ? `${collapsedWidth}px` : `${width}px`,
  };

  const handleRefundClick = () => {
    if (!selectedOrderId || !hasShift) return;
    navigate("/pos/refund", {
      state: { orderId: Number(selectedOrderId) },
    });
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="default"
      sx={(theme) => ({
        height: APPBAR_HEIGHT,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: "background.paper",
        left: isPosFocusedPage ? 0 : leftOffset,
        width: isPosFocusedPage
          ? "100%"
          : {
              xs: "100%",
              sm: `calc(100% - ${
                collapsed ? collapsedWidth : width
              }px)`,
            },
        transition: theme.transitions.create(["left", "width"], {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.shortest,
        }),
      })}
    >
      <Toolbar
        sx={{
          minHeight: APPBAR_HEIGHT,
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 2,
        }}
      >
        {/* LEFT CLUSTER */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
          {isPosChargePage || isPosRefundPage || isPosCashManagementPage ? (
            isPosChargePage && backLocked ? (
              // hide back button completely when locked
              <Box sx={{ width: 40 }} />
            ) : (
              <IconButton
                edge="start"
                aria-label="Back"
                onClick={() => {
                  if (isPosCashManagementPage) return navigate("/pos/shift-management");
                  return navigate(isPosRefundPage ? "/pos/orders" : "/pos/menu");
                }}
                sx={{ mr: 0 }}
              >
                <ArrowBackIcon />
              </IconButton>
            )
          ) : (
            <IconButton
              edge="start"
              aria-label="Toggle sidebar"
              onClick={onToggle}
              sx={{ mr: 0 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* Breadcrumbs (hidden on Charge + Refund) */}
          {!isPosFocusedPage && (
            <Breadcrumbs
              aria-label="breadcrumb"
              sx={{
                flexShrink: 1,
                minWidth: 0,
                "& ol": {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
                display: { xs: "none", sm: "flex" },
              }}
            >
              <Link component={RouterLink} underline="hover" color="inherit" to="/dashboard">
                Home
              </Link>
              {crumbs}
            </Breadcrumbs>
          )}
        </Box>

        {/* CENTER (SPLIT) */}
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          {isPosChargePage && !splitOn && !splitLocked && (
            <Button
              onClick={toggleSplit}
              variant="outlined"
              size="small"
              sx={{
                textTransform: "none",
                fontWeight: 700,
                px: 2.5,
                borderRadius: 1.5,
              }}
            >
              SPLIT
            </Button>
          )}
        </Box>

        {/* RIGHT CLUSTER */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          {isPosOrdersPage && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              disabled={!selectedOrderId || !hasShift}
              onClick={handleRefundClick}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Refund
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

AppHeader.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  width: PropTypes.number,
  collapsedWidth: PropTypes.number,
};