// QUSCINA_BACKOFFICE/Frontend/src/layouts/POSLayout.jsx
import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Box, useMediaQuery, useTheme } from "@mui/material";

import Sidebar from "@/components/Sidebar/Sidebar";
import AppHeader, { APPBAR_HEIGHT } from "@/components/Header/AppHeader";
import Cart from "@/pages/POS/Cart";
import { CartProvider } from "@/context/CartContext";

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;

export default function POSLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPosCharge = location.pathname.startsWith("/pos/charge");
  const isPosOrders = location.pathname.startsWith("/pos/orders");
  const isPosRefund = location.pathname.startsWith("/pos/refund");
  const isPosShiftManagement = location.pathname.startsWith("/pos/shift-management");
  const isPosCashManagement = location.pathname.startsWith("/pos/cash-management");

  // “full-screen” POS pages (no sidebar space)
  const isFullScreenPos = isPosCharge || isPosRefund || isPosCashManagement;

  // Hide cart on charge + orders + refund
   const hideCart = isPosCharge || isPosOrders || isPosRefund || isPosShiftManagement || isPosCashManagement;

  // Sidebar width values to pass into header
  const effectiveWidth = isFullScreenPos ? 0 : SIDEBAR_WIDTH;
  const effectiveCollapsedWidth = isFullScreenPos ? 0 : SIDEBAR_COLLAPSED_WIDTH;

  const handleToggle = () => {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  };

  return (
    <CartProvider>
      <Box
        sx={{
          display: "flex",
          minHeight: "100vh",
          bgcolor: "background.default",
        }}
      >
        {/* Sidebar: hide on Charge + Refund */}
        {!isFullScreenPos && (
          <Sidebar
            collapsed={collapsed}
            width={SIDEBAR_WIDTH}
            collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
          />
        )}

        <AppHeader
          collapsed={collapsed}
          onToggle={handleToggle}
          width={effectiveWidth}
          collapsedWidth={effectiveCollapsedWidth}
        />

        {/* Main POS area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: "flex",
            boxSizing: "border-box",

            // ✅ Main truly fills the viewport
            height: "100vh",
            overflow: "hidden",

            // ✅ keep your sidebar offset
            ml: {
              xs: 0,
              sm: isFullScreenPos
                ? 0
                : collapsed
                ? `${SIDEBAR_COLLAPSED_WIDTH}px`
                : `${SIDEBAR_WIDTH}px`,
            },
          }}
        >
          {/* ✅ content area that sits under the header */}
          <Box
            sx={{
              display: "flex",
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              pt: `${APPBAR_HEIGHT}px`,
            }}
          >
            {/* Left */}
            <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Outlet />
            </Box>

            {/* Right */}
            {!hideCart && (
              <Box sx={{ width: 360, flexShrink: 0, display: { xs: "none", sm: "block" } }}>
                <Cart />
              </Box>
            )}
          </Box>
        </Box>

      </Box>
    </CartProvider>
  );
}
