// QUSCINA_BACKOFFICE/Frontend/src/layouts/MainLayout.jsx
import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Box, useMediaQuery, useTheme } from "@mui/material";

import Sidebar from "@/components/Sidebar/Sidebar";
import AppHeader, { APPBAR_HEIGHT } from "@/components/Header/AppHeader";

// 🛒 Cart + CartProvider
import Cart from "@/pages/POS/Cart.jsx";
import { CartProvider } from "@/context/CartContext";

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;

export default function MainLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);   // desktop/tablet
  const [mobileOpen, setMobileOpen] = useState(false); // phone

 const isPosMenu   = location.pathname.startsWith("/pos/menu");
 const isPosCharge = location.pathname.startsWith("/pos/charge");
 const isPosOrders = location.pathname.startsWith("/pos/orders");
 const isPosRefund = location.pathname.startsWith("/pos/refund");
 // POS screens should hug the bottom (no extra padding)
 const isPosTight = isPosMenu || isPosCharge || isPosOrders || isPosRefund;

  // Effective header widths: charge page ignores sidebar width
  const effectiveWidth = isPosCharge ? 0 : SIDEBAR_WIDTH;
  const effectiveCollapsedWidth = isPosCharge ? 0 : SIDEBAR_COLLAPSED_WIDTH;

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
        {/* Sidebar (hidden on Charge page) */}
        {!isPosCharge && (
          <Sidebar
            collapsed={collapsed}
            width={SIDEBAR_WIDTH}
            collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
          />
        )}

        {/* Header (AppHeader already handles back button + breadcrumbs) */}
        <AppHeader
          collapsed={collapsed}
          onToggle={handleToggle}
          width={effectiveWidth}
          collapsedWidth={effectiveCollapsedWidth}
        />

        {/* Main content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            px: isPosTight ? 0 : 3,
            pt: isPosTight ? `${APPBAR_HEIGHT}px` : `${APPBAR_HEIGHT + 16}px`,
            pb: isPosTight ? 0 : 3,   // now 0 for all /pos/* pages
            ml: {
              xs: 0,
              sm: isPosCharge
                ? 0
                : collapsed
                ? `${SIDEBAR_COLLAPSED_WIDTH}px`
                : `${SIDEBAR_WIDTH}px`,
            },
            transition: (t) =>
              t.transitions.create(["margin", "padding"], {
                easing: t.transitions.easing.sharp,
                duration: t.transitions.duration.shortest,
              }),
          }}
          onClick={() => {
            if (isMobile && mobileOpen) setMobileOpen(false);
          }}
        >
          {isPosMenu ? (
            <Box
              sx={{
                display: "flex",
                height: `calc(100vh - ${APPBAR_HEIGHT}px)`,
                gap: 0,
              }}
            >
              {/* Left: Menu content with its own padding */}
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  pt: 0,
                  px: 0,
                  pb: 3, // keep a bit of space at the bottom; optional
                }}
              >
                <Outlet />
              </Box>

              {/* Right: Cart (desktop only) */}
              <Box
                sx={{
                  width: 360,
                  flexShrink: 0,
                  display: { xs: "none", sm: "block" },
                }}
              >
                <Cart />
              </Box>
            </Box>
          ) : (
            // All other pages (including /pos/charge): normal single-column content
            <Outlet />
          )}
        </Box>
      </Box>
    </CartProvider>
  );
}