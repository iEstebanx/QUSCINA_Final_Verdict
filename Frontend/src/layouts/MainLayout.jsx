// Frontend/src/layouts/MainLayout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import Sidebar from "@/components/Sidebar/Sidebar";
import AppHeader, { APPBAR_HEIGHT } from "@/components/Header/AppHeader";

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;

export default function MainLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [collapsed, setCollapsed] = useState(false);   // desktop/tablet
  const [mobileOpen, setMobileOpen] = useState(false); // phone

  const handleToggle = () => {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Sidebar (Drawer on mobile, fixed on sm+) */}
      <Sidebar
        collapsed={collapsed}
        width={SIDEBAR_WIDTH}
        collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Header */}
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
          // On desktop, push content by sidebar width. On mobile, full width.
          ml: {
            xs: 0,
            sm: collapsed ? `${SIDEBAR_COLLAPSED_WIDTH}px` : `${SIDEBAR_WIDTH}px`,
          },
          transition: (t) =>
            t.transitions.create(["margin", "padding"], {
              easing: t.transitions.easing.sharp,
              duration: t.transitions.duration.shortest,
            }),
        }}
        onClick={() => {
          // Close drawer if user taps main area on mobile
          if (isMobile && mobileOpen) setMobileOpen(false);
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}