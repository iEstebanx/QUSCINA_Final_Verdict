// Frontend/src/pages/Settings/Categories/Categories.jsx
import { useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
} from "@mui/material";

// Import the original full pages
import CategoriePage from "@/pages/Categories/CategoriePage.jsx";
import InvCategoriePage from "@/pages/Inventory/InvCategoriePage.jsx";

export default function Categories() {
  const [mode, setMode] = useState("menu"); // "menu" | "inventory"

  const handleModeChange = (_e, value) => {
    if (value) setMode(value);
  };

  return (
    <Box p={2} display="grid" gap={2}>
      {/* Header */}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Typography variant="h5" fontWeight={700}>
            Categories Management
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Manage <strong>Menu Categories</strong> and{" "}
            <strong>Inventory Categories</strong> in one place.
          </Typography>

          <ToggleButtonGroup
            exclusive
            value={mode}
            onChange={handleModeChange}
            size="small"
            color="primary"
          >
            <ToggleButton value="menu">Menu Categories</ToggleButton>
            <ToggleButton value="inventory">Inventory Categories</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Paper>

      <Divider />

      {/* Render the actual pages with ZERO changes */}
      <Box>
        {mode === "menu" ? <CategoriePage /> : <InvCategoriePage />}
      </Box>
    </Box>
  );
}