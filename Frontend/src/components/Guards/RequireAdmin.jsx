// src/components/Guards/RequireAdmin.jsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function RequireAdmin() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== "Admin" && user.role !== "Manager") return <Navigate to="/" replace />;
  return <Outlet />;
}