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

export const APPBAR_HEIGHT = 64;

export default function AppHeader({
  collapsed,
  onToggle,
  width = 240,
  collapsedWidth = 72,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const selectedOrderId = params.get("orderId");
  const isPosOrdersPage = location.pathname === "/pos/orders";
  const isPosChargePage = location.pathname === "/pos/charge";
  const isPosRefundPage = location.pathname === "/pos/refund";

  // Pages that should be "full width" and hide breadcrumbs
  const isPosFocusedPage = isPosChargePage || isPosRefundPage;

  const labelMap = {
    "": "Home",
    dashboard: "Dashboard",
    users: "Users",
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
    if (!selectedOrderId) return;
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
      <Toolbar sx={{ minHeight: APPBAR_HEIGHT, gap: 2 }}>
        {/* Hamburger OR Back (Charge / Refund) */}
        {isPosChargePage || isPosRefundPage ? (
          <IconButton
            edge="start"
            aria-label="Back"
            onClick={() =>
              navigate(isPosRefundPage ? "/pos/orders" : "/pos/menu")
            }
            sx={{ mr: 1 }}
          >
            <ArrowBackIcon />
          </IconButton>
        ) : (
          <IconButton
            edge="start"
            aria-label="Toggle sidebar"
            onClick={onToggle}
            sx={{ mr: 1 }}
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
            <Link
              component={RouterLink}
              underline="hover"
              color="inherit"
              to="/dashboard"
            >
              Home
            </Link>
            {crumbs}
          </Breadcrumbs>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* POS Orders → Refund button */}
        {isPosOrdersPage && (
          <Button
            variant="contained"
            color="primary"
            size="small"
            disabled={!selectedOrderId}
            onClick={handleRefundClick}
            sx={{
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            Refund
          </Button>
        )}
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