// src/components/Sidebar/Sidebar.jsx
import { useState, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  ButtonBase,
  Divider,
  IconButton,
  Tooltip,
  Collapse,
} from "@mui/material";

// MUI Icons
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import ListAltIcon from "@mui/icons-material/ListAlt";
import CategoryIcon from "@mui/icons-material/Category";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";

import logo from "@/assets/LOGO.png";

function NavItem({ to, label, icon: Icon, collapsed }) {
  const base = {
    display: "flex",
    alignItems: "center",
    gap: 1.25,
    width: "100%",
    px: 1.5,
    py: 1.25,
    borderRadius: 1.5,
    typography: "body2",
  };

  return (
    <NavLink
      to={to}
      style={{ textDecoration: "none" }}
      children={({ isActive }) => (
        <ButtonBase
          sx={(theme) => ({
            ...base,
            justifyContent: collapsed ? "center" : "flex-start",
            color: isActive ? theme.palette.primary.main : theme.palette.text.secondary,
            bgcolor: isActive ? theme.palette.action.selected : "transparent",
            "&:hover": {
              bgcolor: theme.palette.action.hover,
            },
          })}
        >
          <Icon fontSize="small" />
          {!collapsed && <Typography component="span">{label}</Typography>}
        </ButtonBase>
      )}
    />
  );
}

export default function Sidebar({
  width = 240,
  collapsedWidth = 72,
  collapsed = false,
  onToggle, // from header hamburger
}) {
  const location = useLocation();

  // Collapsibles state
  const [openMenu, setOpenMenu] = useState(
    location.pathname.startsWith("/menu")
  );

  // Auto-open correct section when navigating
  useMemo(() => {
    setOpenMenu(location.pathname.startsWith("/menu"));
  }, [location.pathname]);

  return (
    <Box
      component="nav"
      sx={(theme) => ({
        position: { xs: "fixed", sm: "fixed" },
        top: 0,
        left: 0,
        height: "100vh",
        width: collapsed ? collapsedWidth : width,
        borderRight: `1px solid ${theme.palette.divider}`,
        bgcolor: "background.paper",
        zIndex: theme.zIndex.drawer + 1, // ensure below AppBar if needed
        display: "flex",
        flexDirection: "column",
        transition: theme.transitions.create("width", {
          duration: theme.transitions.duration.shortest,
        }),
      })}
    >
      {/* Header area: Logo + Title + (optional) local toggle */}
      <Box
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 1.25,
          borderBottom: `1px solid ${theme.palette.divider}`,
          minHeight: 64,
        })}
      >
        <Box
          component="img"
          src={logo}
          alt="Quscina"
          sx={{ width: 28, height: 28, borderRadius: 1 }}
        />
        {!collapsed && (
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Quscina Admin
          </Typography>
        )}

        {/* If you still want a local toggle in the sidebar itself, keep this.
            Otherwise rely solely on the AppHeader hamburger. */}
        <Box sx={{ ml: "auto", display: { xs: "none", sm: "block" } }}>
          <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <IconButton size="small" onClick={onToggle}>
              <MenuIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Nav */}
      <Box sx={{ p: 1, flex: 1, overflowY: "auto" }}>
        <NavItem
          to="/dashboard"
          label="Dashboard"
          icon={DashboardIcon}
          collapsed={collapsed}
        />

        {/* MENU (collapsible) */}
        <ButtonBase
          onClick={() => setOpenMenu((v) => !v)}
          sx={(theme) => ({
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            width: "100%",
            px: 1.5,
            py: 1.25,
            borderRadius: 1.5,
            typography: "body2",
            color: theme.palette.text.secondary,
            justifyContent: collapsed ? "center" : "flex-start",
            "&:hover": { bgcolor: theme.palette.action.hover },
          })}
        >
          <RestaurantMenuIcon fontSize="small" />
          {!collapsed && (
            <Typography component="span" sx={{ flex: 1 }}>
              Menu
            </Typography>
          )}
        </ButtonBase>

        <Collapse in={openMenu && !collapsed} unmountOnExit>
          <Box sx={{ pl: 4, pr: 1 }}>
            <NavItem
              to="/menu/items"
              label="Item List"
              icon={ListAltIcon}
              collapsed={false}
            />
            <NavItem
              to="/menu/categories"
              label="Categories"
              icon={CategoryIcon}
              collapsed={false}
            />
            <NavItem
              to="/menu/discounts"
              label="Discounts"
              icon={LocalOfferIcon}
              collapsed={false}
            />
          </Box>
        </Collapse>

        <Divider sx={{ my: 1 }} />

        <NavItem
          to="/users"
          label="User Management"
          icon={PeopleIcon}
          collapsed={collapsed}
        />
        <NavItem
          to="/reports"
          label="Reports"
          icon={BarChartIcon}
          collapsed={collapsed}
        />
      </Box>
    </Box>
  );
}