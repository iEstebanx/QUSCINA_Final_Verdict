// src/components/Sidebar/Sidebar.jsx
import { NavLink } from "react-router-dom";
import {
  Box,
  Typography,
  ButtonBase,
  Divider,
  IconButton,
  Tooltip,
} from "@mui/material";

// MUI Icons
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart";

import { useAuth } from "@/context/AuthContext";

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

export default function Sidebar({
  collapsed,
  onToggle,
  width = 240,
  collapsedWidth = 72,
}) {
  const { user, logout } = useAuth();

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
      {/* Top: brand + collapse toggle */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.25 }}>
        {!collapsed && (
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
            QUSCINA Admin
          </Typography>
        )}

        <Tooltip title={collapsed ? "Expand" : "Collapse"}>
          <IconButton
            size="small"
            onClick={onToggle}
            sx={{
              color: "white",
              ml: "auto",
              ...(collapsed && { mx: "auto" }),
            }}
          >
            <MenuIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.15)", mb: 1 }} />

      {/* Nav */}
      <Box sx={{ px: 1, display: "grid", gap: 0.5 }}>
        <NavItem to="/dashboard" label="Dashboard" icon={DashboardIcon} collapsed={collapsed} />
        <NavItem to="/users" label="Users" icon={PeopleIcon} collapsed={collapsed} />
        <NavItem to="/reports" label="Reports" icon={BarChartIcon} collapsed={collapsed} />
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      {/* Logout */}
      {user && (
        <Box sx={{ p: 1 }}>
          <ButtonBase
            onClick={logout}
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