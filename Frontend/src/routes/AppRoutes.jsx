// Frontend/src/routes/AppRoutes.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import EmptyLayout from "../layouts/EmptyLayout";

import RequireAdmin from "../components/Guards/RequireAdmin";

import LoginPage from "../pages/Login/LoginPage";
import NotFound from "@/pages/NotFound.jsx";

import DashboardPage from "../pages/Dashboard/DashboardPage";

import InventoryPage from "@/pages/Inventory/InventoryPage.jsx";

import ItemlistPage from "@/pages/ItemList/ItemlistPage.jsx";

import ReportsPage from "../pages/Reports/ReportsPage";
import InventoryHistoryPage from "@/pages/Reports/InventoryHistoryPage.jsx";

import UserManagementPage from "../pages/UserManagement/UserManagementPage";
import StoreSettingsPage from "@/pages/Settings/StoreSettings/StoreSettingsPage.jsx";
import InventorySettingsPage from "@/pages/Settings/InventorySettings/InventorySettingsPage.jsx";
import DiscountPage from "@/pages/Discounts/DiscountPage.jsx";
import PaymentTypePage from "@/pages/Settings/PaymentTypes/PaymentTypePage.jsx";
import AuthorizationPinsPage from "@/pages/Settings/AuthorizationPins/AuthorizationPinsPage.jsx";
import Categories from "@/pages/Settings/Categories/Categories.jsx";
import BackupAndRestorePage from "@/pages/Settings/BackupAndRestore/BackupAndRestorePage.jsx";


import AuditTrailPage from "@/pages/AuditTrail/AuditTrailPage.jsx";

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

          {/* Reports (group in sidebar: Reports + Inventory History) */}
          <Route path="/reports" element={<ReportsPage />} />
          <Route
            path="/reports/inventory-history"
            element={<InventoryHistoryPage />}
          />

          {/* Menu */}
          <Route path="/menu/items" element={<ItemlistPage />} />
          <Route
            path="/settings/discounts"
            element={<DiscountPage />}
          />
          {/* Old Menu Categories -> Settings Categories */}
          <Route
            path="/menu/categories"
            element={<Navigate to="/settings/categories" replace />}
          />

          {/* Inventory */}
          <Route path="/inventory" element={<InventoryPage />} />
          {/* Old Inventory Categories -> Settings Inventory Categories */}
          <Route
            path="/inventory/categories"
            element={<Navigate to="/settings/categories" replace />}
          />

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

          {/* Old User Management path -> Settings User Management */}
          <Route
            path="/users"
            element={<Navigate to="/settings/users" replace />}
          />

          {/* Settings */}
          {/* 1. User Management */}
          <Route
            path="/settings/users"
            element={<UserManagementPage />}
          />

          {/* 2. Store Settings */}
          <Route
            path="/settings/store"
            element={<StoreSettingsPage />}
          />

          {/* 3. Inventory Settings */}
          <Route
            path="/settings/inventory"
            element={<InventorySettingsPage />}
          />

          {/* 4. Payment Types */}
          <Route
            path="/settings/payment-types"
            element={<PaymentTypePage />}
          />

          {/* 5. Authorization Pins */}
          <Route
            path="/settings/authorization-pins"
            element={<AuthorizationPinsPage />}
          />

          {/* 6. Categories (Menu + Inventory) */}
          <Route
            path="/settings/categories"
            element={<Categories />}
          />

          {/* Backward-compat: old direct inventory-categories settings link */}
          <Route
            path="/settings/inventory-categories"
            element={<Navigate to="/settings/categories" replace />}
          />

          {/* 8. Backup & Restore */}
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