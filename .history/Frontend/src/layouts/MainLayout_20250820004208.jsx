// src/layouts/MainLayout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Box, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Sidebar from "@/components/Sidebar/Sidebar";
import AppHeader, { APPBAR_HEIGHT } from "@/components/Header/AppHeader";

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);      // desktop behavior
  const [mobileOpen, setMobileOpen] = useState(false);    // mobile drawer
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));

  const handleToggle = () => {
    if (isSmall) setMobileOpen((v) => !v);
    else setCollapsed((v) => !v);
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Sidebar: mobile drawer + desktop rail (handled inside component) */}
      <Sidebar
        collapsed={collapsed}
        width={SIDEBAR_WIDTH}
        collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />

      {/* Top Header */}
      <AppHeader
        collapsed={collapsed}
        onToggle={handleToggle}
        width={SIDEBAR_WIDTH}
        collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
      />

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          px: 3,
          pt: `${APPBAR_HEIGHT + 16}px`,
          pb: 3,
          ml: {
            xs: 0,
            sm: collapsed ? `${SIDEBAR_COLLAPSED_WIDTH}px` : `${SIDEBAR_WIDTH}px`,
          },
          transition: (theme) =>
            theme.transitions.create(["margin", "padding"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.shortest,
            }),
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}