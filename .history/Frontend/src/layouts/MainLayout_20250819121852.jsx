// src/layouts/MainLayout.jsx
import { Outlet, Box } from "react-router-dom";
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