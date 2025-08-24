// Frontend/src/App.jsx
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import { AuthProvider } from "./context/AuthContext";
import { AlertProvider } from "./context/Snackbar/AlertContext";
import { AdminProvider } from "./context/AdminContext";
import { ConfirmProvider } from "./context/Cancel&ConfirmDialog/ConfirmContext";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AlertProvider>
          <AdminProvider>
            <ConfirmProvider>
              <AppRoutes />
            </ConfirmProvider>
          </AdminProvider>
        </AlertProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
