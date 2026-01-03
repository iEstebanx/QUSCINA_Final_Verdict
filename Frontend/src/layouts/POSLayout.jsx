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
const CART_WIDTH = 360;

export default function POSLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPosMenu = location.pathname.startsWith("/pos/menu");

  const isPosCharge = location.pathname.startsWith("/pos/charge");
  const isPosOrders = location.pathname.startsWith("/pos/orders");
  const isPosRefund = location.pathname.startsWith("/pos/refund");
  const isPosShiftManagement = location.pathname.startsWith("/pos/shift-management");
  const isPosCashManagement = location.pathname.startsWith("/pos/cash-management");

  // “full-screen” POS pages (no sidebar space)
  const isFullScreenPos = isPosCharge || isPosRefund || isPosCashManagement;

  // Hide cart on charge + orders + refund
  const hideCart = isPosCharge || isPosOrders || isPosRefund || isPosShiftManagement || isPosCashManagement;

  const showCart = isPosMenu && !hideCart;

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
      <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
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
          rightOffset={showCart ? CART_WIDTH : 0} // ✅ NEW
        />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: "flex",
            boxSizing: "border-box",
            height: "100vh",
            overflow: "hidden",
            position: "relative",

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
          {/* LEFT CONTENT */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",

              pt: `${APPBAR_HEIGHT}px`, // ✅ content stays under header
              pr: {
                xs: 0,
                sm: showCart ? `${CART_WIDTH}px` : 0, // ✅ prevent underlap with fixed cart
              },

              overflow: "hidden",
            }}
          >
            <Outlet />
          </Box>

          {/* RIGHT CART (FULL HEIGHT, TOP TO BOTTOM) */}
          {showCart && (
            <Box
              sx={{
                width: CART_WIDTH,
                display: { xs: "none", sm: "block" },

                position: "fixed",  // ✅ key
                top: 0,             // ✅ key (reaches top)
                right: 0,           // ✅ key
                height: "100vh",    // ✅ key
                overflow: "hidden",
                borderLeft: (t) => `1px solid ${t.palette.divider}`,
                bgcolor: "background.paper",
                zIndex: (t) => t.zIndex.appBar - 1, // stays below AppBar
              }}
            >
              <Cart />
            </Box>
          )}
        </Box>
      </Box>
    </CartProvider>
  );
}
