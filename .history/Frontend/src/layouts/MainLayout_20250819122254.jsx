// src/layouts/MainLayout.jsx
import { Outlet } from "react-router-dom";
import { Box } from "@mui/material";   // ✅ Correct import
import Header from "@/components/Header/Header";

export default function MainLayout() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Header />
      <Box sx={{ p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}