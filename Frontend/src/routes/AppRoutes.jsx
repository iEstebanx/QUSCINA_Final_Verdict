// Frontend/src/routes/AppRoutes.jsx
import { Routes, Route } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import EmptyLayout from "../layouts/EmptyLayout";

import RequireAdmin from "../components/Guards/RequireAdmin";

import LoginPage from "../pages/Login/LoginPage";
import NotFound from "@/pages/NotFound.jsx";

import CategoriePage from "@/pages/Categories/CategoriePage.jsx";
import DiscountPage from "@/pages/Discounts/DiscountPage.jsx";
import ItemlistPage from "@/pages/ItemList/ItemlistPage.jsx";

import DashboardPage from "../pages/Dashboard/DashboardPage";
import ReportsPage from "../pages/Reports/ReportsPage";
import UserManagementPage from "../pages/UserManagement/UserManagementPage";
import AuditTrailPage from "@/pages/AuditTrail/AuditTrailPage.jsx";

import PaymentTypePage from "@/pages/Settings/PaymentTypes/PaymentTypePage.jsx";
import TaxesPage from "@/pages/Settings/Taxes/TaxesPage.jsx";
import TableManagementPage from "@/pages/Settings/TableManagement/TableManagementPage.jsx";
import BackupAndRestorePage from "@/pages/Settings/BackupAndRestore/BackupAndRestorePage.jsx";

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
          <Route path="/audit-trail" element={<AuditTrailPage />} />
          <Route path="/reports" element={<ReportsPage />} />

          {/* ⬇️ New: Menu sub-routes */}
          <Route path="/menu/items" element={<ItemlistPage />} />
          <Route path="/menu/categories" element={<CategoriePage />} />
          <Route path="/menu/discounts" element={<DiscountPage />} />

          {/* Settings */}
          <Route path="/settings/payment-types" element={<PaymentTypePage />} />
          <Route path="/settings/taxes" element={<TaxesPage />} />
          <Route path="/settings/table-management" element={<TableManagementPage />} />
          <Route path="/settings/backup-restore" element={<BackupAndRestorePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}