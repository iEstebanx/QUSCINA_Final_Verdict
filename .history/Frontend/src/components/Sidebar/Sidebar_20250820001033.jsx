// src/components/Sidebar/Sidebar.jsx
import { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  ButtonBase,
  Divider,
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
import Inventory2Icon from "@mui/icons-material/Inventory2";
import TuneIcon from "@mui/icons-material/Tune";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import PaymentIcon from "@mui/icons-material/Payment";
import PercentIcon from "@mui/icons-material/Percent";
import BackupIcon from "@mui/icons-material/Backup";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import { useAuth } from "@/context/AuthContext";
import logo from "@/assets/iconLogo.png"; // ⬅️ your logo

function NavLeaf({ to, label, icon: Icon, collapsed }) {
  const base = {
    display: "flex",
    alignItems: "center",
    gap: 1.25,
    width: "100%",
    px: 1.5,
    py: 1.1,
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
            color: isActive
              ? theme.palette.primary.contrastText
              : "rgba(255,255,255,0.85)",
            bgcolor: isActive ? "primary.dark" : "transparent",
            "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
          })}
        >
          <Icon sx={{ fontSize: 20 }} />
          {!collapsed && <span>{label}</span>}
        </ButtonBase>
      )}
    />
  );
}

function NavGroup({
  label,
  icon: Icon,
  collapsed,
  children,
  open: controlledOpen,
  onToggle,
  active,
}) {
  const Row = (
    <ButtonBase
      onClick={onToggle}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        width: "100%",
        px: 1.5,
        py: 1.1,
        borderRadius: 1.5,
        color: active ? "primary.contrastText" : "rgba(255,255,255,0.92)",
        bgcolor: active ? "primary.dark" : "transparent",
        justifyContent: collapsed ? "center" : "flex-start",
        "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
      }}
    >
      <Icon sx={{ fontSize: 20 }} />
      {!collapsed && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
          <span>{label}</span>
          <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
            {controlledOpen ? (
              <ExpandLessIcon sx={{ fontSize: 18 }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: 18 }} />
            )}
          </Box>
        </Box>
      )}
    </ButtonBase>
  );

  return (
    <Box>
      {Row}
      {!collapsed && (
        <Collapse in={controlledOpen} unmountOnExit>
          <Box sx={{ display: "grid", gap: 0.35, mt: 0.25, pl: 4 }}>
            {children}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

export default function Sidebar({
  collapsed,
  onToggle, // ⬅️ now controlled from header; not used here anymore
  width = 240,
  collapsedWidth = 72,
}) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const path = location.pathname;
  const isMenuActive = useMemo(() => path.startsWith("/menu"), [path]);
  const isInventoryActive = useMemo(() => path.startsWith("/inventory"), [path]);
  const isSettingsActive = useMemo(() => path.startsWith("/settings"), [path]);

  const [openMenu, setOpenMenu] = useState(isMenuActive);
  const [openInv, setOpenInv] = useState(isInventoryActive);
  const [openSettings, setOpenSettings] = useState(isSettingsActive);

  useMemo(() => {
    setOpenMenu(isMenuActive);
    setOpenInv(isInventoryActive);
    setOpenSettings(isSettingsActive);
  }, [isMenuActive, isInventoryActive, isSettingsActive]);

  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: { xs: 0, sm: collapsed ? collapsedWidth : width },
        bgcolor: "primary.main",
        color: "white",
        display: { xs: "none", sm: "flex" },
        flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.1)",
        transition: (theme) =>
          theme.transitions.create(["width"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.shortest,
          }),
        overflowX: "hidden",
      }}
    >
      {/* Brand row: Icon | Quscina Admin (expanded) OR Icon only (collapsed) */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 1.25,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <Box
          component="img"
          src={logo}
          alt="Quscina logo"
          sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: 1 }}
        />
        {!collapsed && (
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            QUSCINA Admin
          </Typography>
        )}
      </Box>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.15)", mb: 1 }} />

      {/* Nav */}
      <Box sx={{ px: 1, display: "grid", gap: 0.5 }}>
        <NavLeaf to="/dashboard" label="Dashboard" icon={DashboardIcon} collapsed={collapsed} />

        <NavGroup
          label="Menu"
          icon={RestaurantMenuIcon}
          collapsed={collapsed}
          open={openMenu}
          onToggle={() => setOpenMenu((v) => !v)}
          active={isMenuActive}
        >
          <NavLeaf to="/menu/items" label="Item List" icon={ListAltIcon} collapsed={collapsed} />
          <NavLeaf to="/menu/categories" label="Categories" icon={CategoryIcon} collapsed={collapsed} />
          <NavLeaf to="/menu/discounts" label="Discounts" icon={LocalOfferIcon} collapsed={collapsed} />
        </NavGroup>

        <NavGroup
          label="Inventory"
          icon={Inventory2Icon}
          collapsed={collapsed}
          open={openInv}
          onToggle={() => setOpenInv((v) => !v)}
          active={isInventoryActive}
        >
          <NavLeaf to="/inventory/adjustment" label="Stock Adjustment" icon={TuneIcon} collapsed={collapsed} />
          <NavLeaf to="/inventory/history" label="Inventory History" icon={HistoryIcon} collapsed={collapsed} />
        </NavGroup>

        <NavLeaf to="/reports" label="Reports" icon={BarChartIcon} collapsed={collapsed} />
        <NavLeaf to="/users" label="User Management" icon={PeopleIcon} collapsed={collapsed} />

        <NavGroup
          label="Settings"
          icon={SettingsIcon}
          collapsed={collapsed}
          open={openSettings}
          onToggle={() => setOpenSettings((v) => !v)}
          active={isSettingsActive}
        >
          <NavLeaf to="/settings/payment-types" label="Payment Types" icon={PaymentIcon} collapsed={collapsed} />
          <NavLeaf to="/settings/taxes" label="Taxes" icon={PercentIcon} collapsed={collapsed} />
          <NavLeaf to="/settings/backup-restore" label="Backup & Restore" icon={BackupIcon} collapsed={collapsed} />
        </NavGroup>
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      {user && (
        <Box sx={{ p: 1 }}>
          <ButtonBase
            onClick={user?.logout ?? (() => {})}
            sx={{
              width: "100%",
              justifyContent: collapsed ? "center" : "flex-start",
              px: 1.5,
              py: 1.25,
              borderRadius: 1.5,
              color: "rgba(255,255,255,0.85)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
              typography: "body2",
            }}
          >
            {!collapsed ? "Logout" : "⏏"}
          </ButtonBase>
        </Box>
      )}
    </Box>
  );
}