// Frontend/src/routes/AppRoutes.jsx
import { Routes, Route } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import EmptyLayout from "../layouts/EmptyLayout";

import LoginPage from "../pages/Login/LoginPage";
import RequireAdmin from "../components/Guards/RequireAdmin";
import DashboardPage from "../pages/Dashboard/DashboardPage";
import UserManagementPage from "../pages/UserManagement/UserManagementPage";
import ReportsPage from "../pages/Reports/ReportsPage";
import NotFound from "@/pages/NotFound.jsx";

// ⬇️ New pages
import CategoriePage from "@/pages/Categories/CategoriePage.jsx";
import DiscountPage from "@/pages/Discounts/DiscountPage.jsx";
import ItemlistPage from "@/pages/ItemList/ItemlistPage.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<EmptyLayout />}>
        <Route path="/" element={<LoginPage />} />
      </Route>

      {/* Protected: Guard wraps the layout so Sidebar/Header are gated */}
      <Route element={<RequireAdmin />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/users" element={<UserManagementPage />} />
          <Route path="/reports" element={<ReportsPage />} />

          {/* ⬇️ New: Menu sub-routes */}
          <Route path="/menu/items" element={<ItemlistPage />} />
          <Route path="/menu/categories" element={<CategoriePage />} />
          <Route path="/menu/discounts" element={<DiscountPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}