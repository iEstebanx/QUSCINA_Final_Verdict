// src/routes/AppRoutes.jsx
import { Routes, Route } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import EmptyLayout from "../layouts/EmptyLayout";

import LoginPage from "../pages/Login/LoginPage";
import RequireAdmin from "../components/Guards/RequireAdmin";
import DashboardPage from "../pages/Dashboard/DashboardPage";
import UserManagementPage from "../pages/UserManagement/UserManagementPage";
// import MenuPage from "../pages/Menu/MenuPage";
// import OrdersPage from "../pages/Orders/OrdersPage";
// import ShiftsPage from "../pages/Shifts/ShiftsPage";
import ReportsPage from "../pages/Reports/ReportsPage";
import NotFound from "@/pages/NotFound.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<EmptyLayout />}>
        <Route path="/" element={<LoginPage />} />
      </Route>

      {/* Protected */}
      <Route element={<MainLayout />}>
        <Route element={<RequireAdmin />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/users" element={<UserManagementPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}