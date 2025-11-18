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
import InventoryHistoryPage from "@/pages/Reports/InventoryHistoryPage.jsx";

import UserManagementPage from "../pages/UserManagement/UserManagementPage";

import AuditTrailPage from "@/pages/AuditTrail/AuditTrailPage.jsx";

import PaymentTypePage from "@/pages/Settings/PaymentTypes/PaymentTypePage.jsx";
import TaxesPage from "@/pages/Settings/Taxes/TaxesPage.jsx";
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
          {/* Core */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/users" element={<UserManagementPage />} />

          {/* Reports (group in sidebar: Reports + Inventory History) */}
          <Route path="/reports" element={<ReportsPage />} />
          <Route
            path="/reports/inventory-history"
            element={<InventoryHistoryPage />}
          />

          {/* Menu */}
          <Route path="/menu/items" element={<ItemlistPage />} />
          <Route path="/menu/categories" element={<CategoriePage />} />
          <Route path="/menu/discounts" element={<DiscountPage />} />

          {/* Inventory */}
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/inventory/categories" element={<InvCategoriePage />} />

          {/* Audit Trail (single page) */}
          <Route path="/audit-trail" element={<AuditTrailPage />} />

          {/* Backwards-compat redirects from old/typo paths */}
          {/* Old Inventory History locations -> new reports route */}
          <Route
            path="/audit-trail/inventory-history"
            element={<Navigate to="/reports/inventory-history" replace />}
          />
          <Route
            path="/inventory/history"
            element={<Navigate to="/reports/inventory-history" replace />}
          />
          <Route
            path="/Inventory/inventoryhistorypage"
            element={<Navigate to="/reports/inventory-history" replace />}
          />

          {/* Settings */}
          <Route
            path="/settings/payment-types"
            element={<PaymentTypePage />}
          />
          <Route path="/settings/taxes" element={<TaxesPage />} />
          <Route
            path="/settings/backup-restore"
            element={<BackupAndRestorePage />}
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}