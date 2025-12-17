// QUSCINA_BACKOFFICE/Frontend/src/routes/AppRoutes.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import EmptyLayout from "../layouts/EmptyLayout";
import POSLayout from "../layouts/POSLayout";

import RequireAdmin from "../components/Guards/RequireAdmin";

import LoginPage from "../pages/Login/LoginPage";
import NotFound from "@/pages/NotFound.jsx";

import DashboardPage from "../pages/Dashboard/DashboardPage";

import InventoryPage from "@/pages/Inventory/InventoryPage.jsx";
import ItemlistPage from "@/pages/ItemList/ItemlistPage.jsx";

import ReportsPage from "../pages/Reports/ReportsPage";
import InventoryHistoryPage from "@/pages/Reports/InventoryHistoryPage.jsx";

// POS
import POSMenuPage from "@/pages/POS/Menu.jsx";
import POSOrdersPage from "@/pages/POS/Orders.jsx";
import POSChargePage from "@/pages/POS/Charge.jsx";
import POSRefundPage from "@/pages/POS/RefundPage.jsx";
import ShiftManagementPage from "@/pages/POS/ShiftManagementPage.jsx";
import CashManagementPage from "@/pages/POS/CashManagementPage.jsx";
// POS > Print
import KitchenPrintWrapper from "@/pages/POS/Print/KitchenPrintWrapper";
import ReceiptPrintWrapper from "@/pages/POS/Print/ReceiptPrintWrapper.jsx";

import UserManagementPage from "../pages/UserManagement/UserManagementPage";
import StoreSettingsPage from "@/pages/Settings/StoreSettings/StoreSettingsPage.jsx";
import InventorySettingsPage from "@/pages/Settings/InventorySettings/InventorySettingsPage.jsx";
import DiscountPage from "@/pages/Discounts/DiscountPage.jsx";
import PaymentTypePage from "@/pages/Settings/PaymentTypes/PaymentTypePage.jsx";
import AuthorizationPinsPage from "@/pages/Settings/AuthorizationPins/AuthorizationPinsPage.jsx";
import Categories from "@/pages/Settings/Categories/Categories.jsx";
import BackupAndRestorePage from "@/pages/Settings/BackupAndRestore/BackupAndRestorePage.jsx";
import QuscinasMemoPage from "@/pages/Settings/QuscinasMemo/QuscinasMemo.jsx";

import AuditTrailPage from "@/pages/AuditTrail/AuditTrailPage.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/pos/print/:orderId" element={<ReceiptPrintWrapper />} />
      <Route path="/pos/print/kitchen/:orderId" element={<KitchenPrintWrapper />} />

      {/* Public */}
      <Route element={<EmptyLayout />}>
        <Route path="/" element={<LoginPage />} />
      </Route>

      {/* Protected */}
      <Route element={<RequireAdmin />}>
        {/* Backoffice main layout (with sidebar + AppHeader + breadcrumbs) */}
        <Route element={<MainLayout />}>
          {/* Core */}
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Reports */}
          <Route path="/reports" element={<ReportsPage />} />
          <Route
            path="/reports/inventory-reports"
            element={<InventoryHistoryPage />}
          />

          {/* Items */}
          <Route path="/items" element={<ItemlistPage />} />

          {/* Inventory */}
          <Route path="/inventory" element={<InventoryPage />} />

          {/* Audit Trail */}
          <Route path="/audit-trail" element={<AuditTrailPage />} />

          {/* Redirects & settings (unchanged) */}
          <Route
            path="/audit-trail/inventory-reports"
            element={<Navigate to="/reports/inventory-reports" replace />}
          />
          <Route
            path="/inventory/history"
            element={<Navigate to="/reports/inventory-reports" replace />}
          />
          <Route
            path="/Inventory/inventoryhistorypage"
            element={<Navigate to="/reports/inventory-reports" replace />}
          />
          <Route
            path="/users"
            element={<Navigate to="/settings/users" replace />}
          />
          <Route path="/settings/users" element={<UserManagementPage />} />
          <Route path="/settings/store" element={<StoreSettingsPage />} />
          <Route
            path="/settings/inventory"
            element={<InventorySettingsPage />}
          />
          <Route
            path="/settings/payment-types"
            element={<PaymentTypePage />}
          />
          <Route
            path="/settings/authorization-pins"
            element={<AuthorizationPinsPage />}
          />
          <Route path="/settings/categories" element={<Categories />} />
          <Route
            path="/settings/inventory-categories"
            element={<Navigate to="/settings/categories" replace />}
          />
          <Route
            path="/settings/backup-restore"
            element={<BackupAndRestorePage />}
          />
          <Route
            path="/settings/quscinas-memo"
            element={<QuscinasMemoPage />}
          />
          <Route
            path="/settings/discounts"
            element={<DiscountPage />}
          />
        </Route>

        {/* POS layout (NO sidebar, NO AppHeader/breadcrumbs) */}
        <Route element={<POSLayout />}>
          <Route path="/pos" element={<Navigate to="/pos/menu" replace />} />
          <Route path="/pos/menu" element={<POSMenuPage />} />
          <Route path="/pos/orders" element={<POSOrdersPage />} />
          <Route path="/pos/shift-management" element={<ShiftManagementPage />} />
          <Route path="/pos/cash-management" element={<CashManagementPage />} />
          <Route path="/pos/refund" element={<POSRefundPage />} />
          <Route path="/pos/charge" element={<POSChargePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}