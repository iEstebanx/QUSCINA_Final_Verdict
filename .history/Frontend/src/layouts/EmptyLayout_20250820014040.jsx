// src/layouts/EmptyLayout.jsx
import { Outlet } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

export default function EmptyLayout() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: "100dvh",              // better on mobile (avoids Safari bars jump)
        bgcolor: "background.default",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
      }}
    >
      {/* Left panel (hidden on phones) — place branding, tagline, or illustration here */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          justifyContent: "center",
          p: { md: 6, lg: 8 },
          position: "relative",
          overflow: "hidden",
          bgcolor: "background.paper",
          // subtle background flourish that respects your theme
          "&::before": {
            content: '""',
            position: "absolute",
            inset: -80,
            background: `radial-gradient(
              600px 400px at 30% 30%,
              ${alpha(theme.palette.primary.main, 0.18)} 0%,
              transparent 60%
            ), radial-gradient(
              500px 300px at 70% 70%,
              ${alpha(theme.palette.secondary.main, 0.12)} 0%,
              transparent 65%
            )`,
            pointerEvents: "none",
          },
        }}
      >
        <Box sx={{ position: "relative", textAlign: "center" }}>
          <Typography variant="h3" fontWeight={800}>
            QUSCINA Admin
          </Typography>
          <Typography sx={{ mt: 1.5 }} color="text.secondary">
            Manage menu, inventory, and reports with ease.
          </Typography>
        </Box>
      </Box>

      {/* Right panel — centers whatever the route renders */}
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          p: { xs: 2, sm: 3, md: 4 },
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}