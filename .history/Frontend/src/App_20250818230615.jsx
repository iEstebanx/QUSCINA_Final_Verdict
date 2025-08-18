// src/App.jsx
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import { AuthProvider } from "./context/AuthContext";
import { AlertProvider } from "./context/AlertContext";
import { AdminProvider } from "./context/AdminContext";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AlertProvider>
          <AdminProvider>
            <AppRoutes />
          </AdminProvider>
        </AlertProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
