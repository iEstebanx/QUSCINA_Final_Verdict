// Frontend/src/components/Header/AppHeader.jsx
import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useLocation, Link as RouterLink } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Box,
  Breadcrumbs,
  Link,
  Typography,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Tooltip,
  Chip,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import HistoryIcon from "@mui/icons-material/History";

// export once and reuse everywhere
export const APPBAR_HEIGHT = 64;

export default function AppHeader({
  collapsed,
  onToggle,
  width = 240,
  collapsedWidth = 72,
}) {
  const location = useLocation();

  // Readable labels per path segment
  const labelMap = {
    "": "Home",
    dashboard: "Dashboard",
    users: "Users",
    reports: "Reports",
    menu: "Menu",
    inventory: "Inventory",
    settings: "Settings",
    items: "Item List", // special case
  };

  // NEW: For any "group" segment, where should clicking the crumb go?
  const groupFirstChild = {
    menu: "items",
    settings: "users",
    // inventory: "stock-adjustment",
    // settings: "payment-types",
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

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="default"
      sx={(theme) => ({
        height: APPBAR_HEIGHT,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: "background.paper",
        left: leftOffset,
        width: {
          xs: "100%",
          sm: `calc(100% - ${collapsed ? collapsedWidth : width}px)`,
        },
        transition: theme.transitions.create(["left", "width"], {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.shortest,
        }),
      })}
    >
      <Toolbar sx={{ minHeight: APPBAR_HEIGHT, gap: 2 }}>
        {/* Hamburger */}
        <IconButton
          edge="start"
          aria-label="Toggle sidebar"
          onClick={onToggle}
          sx={{ mr: 1 }}
        >
          <MenuIcon />
        </IconButton>

        {/* Breadcrumbs */}
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

        <Box sx={{ flexGrow: 1 }} />
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