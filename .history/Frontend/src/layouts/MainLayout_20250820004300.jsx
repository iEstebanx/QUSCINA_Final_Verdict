// src/layouts/MainLayout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Box } from "@mui/material";
import Sidebar from "@/components/Sidebar/Sidebar";
import AppHeader, { APPBAR_HEIGHT } from "@/components/Header/AppHeader";

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const toggleSidebar = () => setCollapsed((v) => !v);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Left Sidebar */}
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
        width={SIDEBAR_WIDTH}
        collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
      />

      {/* Top Header */}
      <AppHeader
        collapsed={collapsed}
        onToggle={toggleSidebar} // ⬅️ hamburger in header toggles sidebar
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