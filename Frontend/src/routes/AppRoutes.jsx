// Frontend/src/routes/AppRoutes.jsx
import { Routes, Route, Navigate } from "react-router-dom";
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
import InventoryHistoryPage from "@/pages/AuditTrail/InventoryHistoryPage.jsx";
import ShiftHistoryPage from "@/pages/AuditTrail/ShiftHistoryPage.jsx";

import PaymentTypePage from "@/pages/Settings/PaymentTypes/PaymentTypePage.jsx";
import TaxesPage from "@/pages/Settings/Taxes/TaxesPage.jsx";
import NotificationsPage from "@/pages/Settings/Notifications/Notifications.jsx";
import BackupAndRestorePage from "@/pages/Settings/BackupAndRestore/BackupAndRestorePage.jsx";

import InventoryPage from "@/pages/Inventory/InventoryPage.jsx";
import InvCategoriePage from "@/pages/Inventory/InvCategoriePage.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<EmptyLayout />}>
        <Route path="/" element={<LoginPage />} />
      </Route>

      {/* Protected */}
      <Route element={<RequireAdmin />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/users" element={<UserManagementPage />} />
          <Route path="/reports" element={<ReportsPage />} />

          {/* Menu */}
          <Route path="/menu/items" element={<ItemlistPage />} />
          <Route path="/menu/categories" element={<CategoriePage />} />
          <Route path="/menu/discounts" element={<DiscountPage />} />

          {/* Inventory */}
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/inventory/categories" element={<InvCategoriePage />} />

          {/* Audit Trail */}
          <Route path="/audit-trail" element={<AuditTrailPage />} />
          <Route path="/audit-trail/inventory-history" element={<InventoryHistoryPage />} />
          <Route path="/audit-trail/shift-history" element={<ShiftHistoryPage />} />

          {/* Backwards-compat redirects from old/typo paths */}
          <Route path="/inventory/inventorypage" element={<Navigate to="/inventory" replace />} />
          <Route path="/inventory/history" element={<Navigate to="/audit-trail/inventory-history" replace />} />
          <Route path="/Inventory/inventoryhistorypage" element={<Navigate to="/audit-trail/inventory-history" replace />} />

          {/* Settings */}
          <Route path="/settings/payment-types" element={<PaymentTypePage />} />
          <Route path="/settings/taxes" element={<TaxesPage />} />
          <Route path="/settings/notifications" element={<NotificationsPage />} />
          <Route path="/settings/backup-restore" element={<BackupAndRestorePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}