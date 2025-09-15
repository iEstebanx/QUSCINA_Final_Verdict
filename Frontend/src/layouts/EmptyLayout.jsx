// Frontend/src/layouts/EmptyLayout.jsx
import { Outlet } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

export default function EmptyLayout() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: "100svh",
        width: "100vw",
        display: "grid",
        // xs: stack rows; sm–md: 40/60; lg+: 50/50
        gridTemplateColumns: { xs: "1fr", sm: "minmax(260px, 0.4fr) 0.6fr", lg: "1fr 1fr" },
        gridTemplateRows: { xs: "auto 1fr", sm: "1fr" },
        bgcolor: "background.default",
      }}
    >
      {/* Branding / hero */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 3, sm: 4, md: 5, lg: 8 },
          position: "relative",
          overflow: "hidden",
          bgcolor: "background.paper",
          borderRight: {
            sm: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
            xs: "none",
          },
          // make it the first row on phones (stacked above form)
          gridColumn: { xs: "1 / -1", sm: "auto" },
          "&::before": {
            content: '""',
            position: "absolute",
            inset: -80,
            background: `radial-gradient(
              520px 360px at 28% 30%,
              ${alpha(theme.palette.primary.main, 0.16)} 0%,
              transparent 60%
            ), radial-gradient(
              420px 260px at 70% 70%,
              ${alpha(theme.palette.secondary.main, 0.10)} 0%,
              transparent 65%
            )`,
            pointerEvents: "none",
          },
        }}
      >
        <Box sx={{ position: "relative", textAlign: "center", px: { xs: 1.5, sm: 2 } }}>
          <Typography
            sx={{ fontWeight: 800, fontSize: { xs: 28, sm: 32, md: 36, lg: 40 }, letterSpacing: 0.2 }}
          >
            QUSCINA Admin
          </Typography>
          <Typography sx={{ mt: 1 }} color="text.secondary" variant="body2">
            Manage menu, inventory, and reports with ease.
          </Typography>
        </Box>
      </Box>

      {/* Auth panel */}
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          p: { xs: 2, sm: 3, md: 4 },
        }}
      >
        {/* constrain the login width for readability */}
        <Box sx={{ width: "100%", maxWidth: { xs: 420, sm: 440, md: 480 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}