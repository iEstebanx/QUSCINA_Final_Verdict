// QUSCINA_BACKOFFICE/Frontend/src/components/Sidebar/Sidebar.jsx
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
import CategoryIcon from "@mui/icons-material/Category";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import PaymentIcon from "@mui/icons-material/Payment";
import BackupIcon from "@mui/icons-material/Backup";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import TimelineIcon from "@mui/icons-material/Timeline";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import ArticleIcon from "@mui/icons-material/Article";

// 🔹 NEW: POS + nicer “dish” icon for Items
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import LunchDiningIcon from "@mui/icons-material/LunchDining";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";

import { useAuth } from "@/context/AuthContext";
import logo from "@/assets/LOGO.png";
import { alpha } from "@mui/material/styles";

/* --------------------- Small leaf button --------------------- */
function NavLeaf({ to, label, icon: Icon, collapsed, end = false, onClick, activeOverride }) {
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
      {({ isActive }) => {
        const active = typeof activeOverride === "boolean" ? activeOverride : isActive;

        return (
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
                bgcolor: active ? selBg : "transparent",
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
            {!collapsed && <span>{label}</span>}
          </ButtonBase>
        );
      }}
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
  activeOverride: PropTypes.bool,
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
  const navigate = useNavigate();

  const role = user?.role;
  const isCashier = role === "Cashier";
  const isAdmin = role === "Admin";

  const path = location.pathname;

  const isPosActive = useMemo(() => path.startsWith("/pos"), [path]);

  const isReportsActive = useMemo(
    () =>
      path.startsWith("/reports") ||
      path.startsWith("/audit-trail/inventory-reports"),
    [path]
  );

  const handleLogoutClick = async () => {
    try {
      await logout();
    } catch (e) {
      if (e?.status === 409) {
        navigate("/pos/shift-management", {
          replace: true,
          state: {
            openShiftLogoutBlocked: true,
            message: e?.data?.error || e?.message || "Cannot logout while a shift is still open.",
            shift: e?.data?.shift || null, // optional: show shift info in dialog
            code: e?.data?.code || null,   // optional
          },
        });
        return;
      }

      window.alert(e?.message || "Logout failed.");
    }
  };

  const isSettingsActive = useMemo(() => path.startsWith("/settings"), [path]);

  const [openPos, setOpenPos] = useState(isPosActive);
  const [openReports, setOpenReports] = useState(isReportsActive);
  const [openSettings, setOpenSettings] = useState(isSettingsActive);

  useEffect(() => {
    if (!collapsed) {
      setOpenPos(isPosActive);
      setOpenReports(isReportsActive);
      setOpenSettings(isSettingsActive);
    }
  }, [collapsed, isPosActive, isReportsActive, isSettingsActive]);

  useEffect(() => {
    if (collapsed) {
      setOpenPos(false);
      setOpenReports(false);
      setOpenSettings(false);
    }
  }, [collapsed]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Brand */}
      <NavLink
        to={isCashier ? "/pos/menu" : "/dashboard"}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <ButtonBase
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.25,
            justifyContent: collapsed ? "center" : "flex-start",
            width: "100%",
            borderRadius: 0, // keep it flat like a header, tweak if you want hover bg
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
              QUSCINA Backoffice
            </Typography>
          )}
        </ButtonBase>
      </NavLink>

      <Divider sx={{ mb: 1 }} />

      {/* Nav */}
      <Box sx={{ px: 1, display: "grid", gap: 0.5 }}>
        {/* ✅ Cashier sees ONLY POS */}
        {isCashier ? (
          <>
            {/* POS header - NOT a clickable link, just a label */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                px: 1.5,
                py: 1.1,
                borderRadius: 1.5,
                justifyContent: collapsed ? "center" : "flex-start",
                color: "text.secondary",
              }}
            >
              <PointOfSaleIcon sx={{ fontSize: 20 }} />
              {!collapsed && <Typography variant="body2" fontWeight={500}>POS</Typography>}
            </Box>

            {/* POS pages */}
            <Box sx={{ display: "grid", gap: 0.35, pl: collapsed ? 0 : 2 }}>
              <NavLeaf 
                to="/pos/menu" 
                label="Menu" 
                icon={RestaurantMenuIcon} 
                collapsed={collapsed} 
              />
              <NavLeaf 
                to="/pos/orders" 
                label="Orders" 
                icon={ReceiptLongIcon} 
                collapsed={collapsed} 
              />
              <NavLeaf 
                to="/pos/shift-management" 
                label="Shift/Cash Management" 
                icon={HistoryIcon} 
                collapsed={collapsed} 
              />
            </Box>
          </>
        ) : (
          <>
            {/* ✅ Admin sees everything (your current sidebar) */}
            <NavLeaf to="/dashboard" label="Dashboard" icon={DashboardIcon} collapsed={collapsed} />

            <NavGroup
              label="POS"
              icon={PointOfSaleIcon}
              collapsed={collapsed}
              open={openPos}
              onToggle={() => setOpenPos((v) => !v)}
              active={isPosActive}
            >
              <NavLeaf to="/pos/menu" label="Menu" icon={RestaurantMenuIcon} collapsed={collapsed} />
              <NavLeaf to="/pos/orders" label="Orders" icon={ReceiptLongIcon} collapsed={collapsed} />
              <NavLeaf to="/pos/shift-management" label="Shift/Cash Management" icon={HistoryIcon} collapsed={collapsed} />
            </NavGroup>

            <NavLeaf to="/inventory" label="Inventory" icon={Inventory2Icon} collapsed={collapsed} />
            <NavLeaf to="/items" label="Items" icon={LunchDiningIcon} collapsed={collapsed} />

            <NavGroup
              label="Reports"
              icon={BarChartIcon}
              collapsed={collapsed}
              open={openReports}
              onToggle={() => setOpenReports((v) => !v)}
              active={isReportsActive}
            >
              <NavLeaf to="/reports" label="Reports" icon={BarChartIcon} collapsed={collapsed} end />
              <NavLeaf to="/reports/inventory-reports" label="Inventory Reports" icon={HistoryIcon} collapsed={collapsed} />
            </NavGroup>

            <NavGroup
              label="Settings"
              icon={SettingsIcon}
              collapsed={collapsed}
              open={openSettings}
              onToggle={() => setOpenSettings((v) => !v)}
              active={isSettingsActive}
            >
              <NavLeaf to="/settings/users" label="User Management" icon={PeopleIcon} collapsed={collapsed} />
              <NavLeaf to="/settings/discounts" label="Discounts" icon={LocalOfferIcon} collapsed={collapsed} />
              <NavLeaf to="/settings/payment-types" label="Payment Types" icon={PaymentIcon} collapsed={collapsed} />
              <NavLeaf to="/settings/authorization-pins" label="Authorization Pins" icon={VpnKeyIcon} collapsed={collapsed} />
              <NavLeaf to="/settings/categories" label="Categories" icon={CategoryIcon} collapsed={collapsed} />
              <NavLeaf to="/settings/backup-restore" label="Backup & Restore" icon={BackupIcon} collapsed={collapsed} />
              <NavLeaf to="/settings/quscinas-memo" label="Quscina's Memo" icon={ArticleIcon} collapsed={collapsed} />
            </NavGroup>

            <NavLeaf to="/audit-trail" label="Audit Trail" icon={TimelineIcon} collapsed={collapsed} />
          </>
        )}
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      {user && (
        <Box sx={{ p: 1 }}>
          <ButtonBase
            onClick={handleLogoutClick}
            sx={(theme) => ({
              width: "100%",
              justifyContent: collapsed ? "center" : "flex-start",
              px: 1.5,
              py: 1.25,
              borderRadius: 1.5,
              color: theme.palette.text.primary,
              "&:hover": {
                bgcolor: alpha(
                  theme.palette.text.primary,
                  theme.palette.mode === "dark" ? 0.1 : 0.06
                ),
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
        PaperProps={{
          sx: { width, ...skin, overflowY: "auto", overflowX: "hidden" },
          className: "scroll-x",
        }}
      >
        <SidebarContent collapsed={false} />
      </Drawer>
    );
  }

  return (
    <Box
      className="scroll-x"
      sx={{
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: collapsed ? collapsedWidth : width,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
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