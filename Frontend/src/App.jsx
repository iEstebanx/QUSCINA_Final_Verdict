// Frontend/src/App.jsx
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import { AuthProvider } from "./context/AuthContext";
import { AlertProvider } from "./context/Snackbar/AlertContext";
import { AdminProvider } from "./context/AdminContext";
import { ConfirmProvider } from "./context/Cancel&ConfirmDialog/ConfirmContext";
import { ShiftProvider } from "@/context/ShiftContext";

export default function App() {
  return (
    <BrowserRouter>
      <ShiftProvider>
        <AuthProvider>
          <AlertProvider>
            <AdminProvider>
              <ConfirmProvider>
                  <AppRoutes />
              </ConfirmProvider>
            </AdminProvider>
          </AlertProvider>
        </AuthProvider>
      </ShiftProvider>
    </BrowserRouter>
  );
}