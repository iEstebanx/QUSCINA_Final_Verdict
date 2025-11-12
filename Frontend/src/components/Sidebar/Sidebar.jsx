// Frontend/src/components/Sidebar/Sidebar.jsx
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { NavLink, useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  ButtonBase,
  Divider,
  Collapse,
  Drawer,
  Popover,
  useTheme,
  useMediaQuery,
} from "@mui/material";

// Icons...
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import ListAltIcon from "@mui/icons-material/ListAlt";
import CategoryIcon from "@mui/icons-material/Category";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import PaymentIcon from "@mui/icons-material/Payment";
import PercentIcon from "@mui/icons-material/Percent";
import BackupIcon from "@mui/icons-material/Backup";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import NotificationsIcon from "@mui/icons-material/Notifications";
import TimelineIcon from "@mui/icons-material/Timeline";

import { useAuth } from "@/context/AuthContext";
import logo from "@/assets/LOGO.png";
import { alpha } from "@mui/material/styles";

/* --------------------- Small leaf button --------------------- */
function NavLeaf({ to, label, icon: Icon, collapsed, end = false, onClick }) {
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
    <NavLink to={to} end={end} style={{ textDecoration: "none" }} onClick={onClick}>
      {({ isActive }) => (
        <ButtonBase
          sx={(theme) => {
            const isDark = theme.palette.mode === "dark";
            const selBg = alpha(theme.palette.primary.main, isDark ? 0.22 : 0.1);
            const hovBg = alpha(theme.palette.text.primary, isDark ? 0.1 : 0.06);
            const selHov = alpha(theme.palette.text.primary, isDark ? 0.16 : 0.08);
            return {
              ...base,
              justifyContent: collapsed ? "center" : "flex-start",
              color: theme.palette.text.primary,
              bgcolor: isActive ? selBg : "transparent",
              fontWeight: isActive ? 600 : 500,
              "&:hover": { bgcolor: isActive ? selHov : hovBg },
              "&:focus-visible": {
                outline: `2px solid ${alpha(theme.palette.primary.main, 0.6)}`,
                outlineOffset: 2,
              },
            };
          }}
        >
          <Icon sx={{ fontSize: 20 }} />
          {!collapsed && <span>{label}</span>}
        </ButtonBase>
      )}
    </NavLink>
  );
}

NavLeaf.propTypes = {
  to: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  collapsed: PropTypes.bool.isRequired,
  end: PropTypes.bool,
  onClick: PropTypes.func,
};

/* --------------------- Group with popover when collapsed --------------------- */
function NavGroup({
  label,
  icon: Icon,
  collapsed,
  children,
  open,
  onToggle,
  active,
}) {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleHeaderClick = (e) => {
    if (collapsed) {
      setAnchorEl(e.currentTarget);
    } else {
      onToggle();
    }
  };

  const closePopover = () => setAnchorEl(null);
  const popoverOpen = Boolean(anchorEl);

  return (
    <Box>
      <ButtonBase
        onClick={handleHeaderClick}
        sx={(theme) => {
          const isDark = theme.palette.mode === "dark";
          const selBg = alpha(theme.palette.primary.main, isDark ? 0.22 : 0.1);
          const hovBg = alpha(theme.palette.text.primary, isDark ? 0.1 : 0.06);
          const selHov = alpha(theme.palette.text.primary, isDark ? 0.16 : 0.08);

          return {
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            width: "100%",
            px: 1.5,
            py: 1.1,
            borderRadius: 1.5,
            color: theme.palette.text.primary,
            bgcolor: active ? selBg : "transparent",
            justifyContent: collapsed ? "center" : "flex-start",
            fontWeight: active ? 600 : 500,
            "&:hover": { bgcolor: active ? selHov : hovBg },
            "&:focus-visible": {
              outline: `2px solid ${alpha(theme.palette.primary.main, 0.6)}`,
              outlineOffset: 2,
            },
          };
        }}
      >
        <Icon sx={{ fontSize: 20 }} />
        {!collapsed && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
            <span>{label}</span>
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
              {open ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
            </Box>
          </Box>
        )}
      </ButtonBase>

      {/* Full-width sidebar: normal collapse */}
      {!collapsed && (
        <Collapse in={open} unmountOnExit>
          <Box sx={{ display: "grid", gap: 0.35, mt: 0.25, pl: 4 }}>{children}</Box>
        </Collapse>
      )}

      {/* Collapsed sidebar: floating popover menu */}
      {collapsed && (
        <Popover
          open={popoverOpen}
          anchorEl={anchorEl}
          onClose={closePopover}
          anchorOrigin={{ vertical: "center", horizontal: "right" }}
          transformOrigin={{ vertical: "center", horizontal: "left" }}
          PaperProps={{
            sx: (theme) => ({
              p: 0.5,
              borderRadius: 2,
              minWidth: 220,
              border: `1px solid ${alpha(theme.palette.text.primary, 0.12)}`,
              boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.18)}`,
            }),
          }}
        >
          <Box sx={{ display: "grid", gap: 0.35, p: 0.5 }}>
            {Array.isArray(children)
              ? children.map((child, i) =>
                  child
                    ? {
                        ...child,
                        props: {
                          ...child.props,
                          collapsed: false,
                          onClick: () => setAnchorEl(null),
                        },
                      }
                    : null
                )
              : children
              ? {
                  ...children,
                  props: {
                    ...children.props,
                    collapsed: false,
                    onClick: () => setAnchorEl(null),
                  },
                }
              : null}
          </Box>
        </Popover>
      )}
    </Box>
  );
}

NavGroup.propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  collapsed: PropTypes.bool.isRequired,
  children: PropTypes.node,
  open: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  active: PropTypes.bool.isRequired,
};

/* --------------------- Sidebar Content --------------------- */
function SidebarContent({ collapsed }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const path = location.pathname;
  const isMenuActive = useMemo(() => path.startsWith("/menu"), [path]);
  const isInventoryActive = useMemo(() => path.startsWith("/inventory"), [path]);
  const isAuditActive = useMemo(() => path.startsWith("/audit-trail"), [path]);
  const isSettingsActive = useMemo(() => path.startsWith("/settings"), [path]);

  const [openMenu, setOpenMenu] = useState(isMenuActive);
  const [openInventory, setOpenInventory] = useState(isInventoryActive);
  const [openAudit, setOpenAudit] = useState(isAuditActive);
  const [openSettings, setOpenSettings] = useState(isSettingsActive);

  useEffect(() => {
    if (!collapsed) {
      setOpenMenu(isMenuActive);
      setOpenInventory(isInventoryActive);
      setOpenAudit(isAuditActive);
      setOpenSettings(isSettingsActive);
    }
  }, [collapsed, isMenuActive, isInventoryActive, isAuditActive, isSettingsActive]);

  useEffect(() => {
    if (collapsed) {
      setOpenMenu(false);
      setOpenInventory(false);
      setOpenAudit(false);
      setOpenSettings(false);
    }
  }, [collapsed]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Brand */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 1.25,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <Box component="img" src={logo} alt="Quscina logo" sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: 1 }} />
        {!collapsed && (
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            QUSCINA Backoffice
          </Typography>
        )}
      </Box>

      <Divider sx={{ mb: 1 }} />

      {/* Nav */}
      <Box sx={{ px: 1, display: "grid", gap: 0.5 }}>
        <NavLeaf to="/dashboard" label="Dashboard" icon={DashboardIcon} collapsed={collapsed} />

        {/* Inventory group with two entries */}
        <NavGroup
          label="Inventory"
          icon={Inventory2Icon}
          collapsed={collapsed}
          open={openInventory}
          onToggle={() => setOpenInventory((v) => !v)}
          active={isInventoryActive}
        >
          <NavLeaf to="/inventory" label="Inventory" icon={Inventory2Icon} collapsed={collapsed} end />
          <NavLeaf to="/inventory/categories" label="Categories" icon={CategoryIcon} collapsed={collapsed} />
        </NavGroup>

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
          <NavLeaf to="/settings/notifications" label="Notifications" icon={NotificationsIcon} collapsed={collapsed} />
          <NavLeaf to="/settings/backup-restore" label="Backup & Restore" icon={BackupIcon} collapsed={collapsed} />
        </NavGroup>

        {/* Audit Trail: Audit + Inventory History + Shift History */}
        <NavGroup
          label="Audit Trail"
          icon={TimelineIcon}
          collapsed={collapsed}
          open={openAudit}
          onToggle={() => setOpenAudit((v) => !v)}
          active={isAuditActive}
        >
          <NavLeaf to="/audit-trail" label="Audit" icon={TimelineIcon} collapsed={collapsed} end />
          <NavLeaf to="/audit-trail/inventory-history" label="Inventory History" icon={HistoryIcon} collapsed={collapsed} />
          <NavLeaf to="/audit-trail/shift-history" label="Shift History" icon={HistoryIcon} collapsed={collapsed} />
        </NavGroup>
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      {user && (
        <Box sx={{ p: 1 }}>
          <ButtonBase
            onClick={logout ?? (() => {})}
            sx={(theme) => ({
              width: "100%",
              justifyContent: collapsed ? "center" : "flex-start",
              px: 1.5,
              py: 1.25,
              borderRadius: 1.5,
              color: theme.palette.text.primary,
              "&:hover": {
                bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.1 : 0.06),
              },
              typography: "body2",
            })}
          >
            {!collapsed ? "Logout" : "⏏"}
          </ButtonBase>
        </Box>
      )}
    </Box>
  );
}

SidebarContent.propTypes = {
  collapsed: PropTypes.bool.isRequired,
};

/* --------------------- Shell --------------------- */
export default function Sidebar({
  collapsed,
  width = 240,
  collapsedWidth = 72,
  mobileOpen = false,
  onMobileClose = () => {},
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const skin = {
    bgcolor: "background.paper",
    color: "text.primary",
    borderRight:
      theme.palette.mode === "dark"
        ? "1px solid rgba(234,238,242,0.08)"
        : "1px solid rgba(0,0,0,0.06)",
  };

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        PaperProps={{ sx: { width, ...skin } }}
      >
        <SidebarContent collapsed={false} />
      </Drawer>
    );
  }

  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: collapsed ? collapsedWidth : width,
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        transition: (t) =>
          t.transitions.create(["width"], {
            easing: t.transitions.easing.sharp,
            duration: t.transitions.duration.shortest,
          }),
        ...skin,
      }}
    >
      <SidebarContent collapsed={collapsed} />
    </Box>
  );
}

Sidebar.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  width: PropTypes.number,
  collapsedWidth: PropTypes.number,
  mobileOpen: PropTypes.bool,
  onMobileClose: PropTypes.func,
};