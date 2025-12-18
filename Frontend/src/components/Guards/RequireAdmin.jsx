// Frontend/src/components/Guards/RequireAdmin.jsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { CircularProgress, Box } from "@mui/material";

export default function RequireAdmin() {
  const { user, ready } = useAuth();
  const loc = useLocation();

  if (!ready) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: loc }} />;
  }

  if (user.role !== "Admin") {
    return <Navigate to="/" replace />;
  }
  
  return <Outlet />;
}
