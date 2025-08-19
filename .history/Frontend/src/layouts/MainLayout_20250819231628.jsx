// src/layouts/EmptyLayout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Box } from "@mui/material";
import Header from "@/components/Header/Header";

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Left Sidebar */}
      <Header
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        width={SIDEBAR_WIDTH}
        collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
      />

      {/* Main content that adapts to sidebar width */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          ml: {
            xs: 0,
            sm: collapsed ? `${SIDEBAR_COLLAPSED_WIDTH}px` : `${SIDEBAR_WIDTH}px`,
          },
          transition: (theme) =>
            theme.transitions.create(["margin"], {
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
