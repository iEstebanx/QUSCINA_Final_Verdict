// QUSCINA_BACKOFFICE/Frontend/src/components/Guards/RequireAuth.jsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { CircularProgress, Box } from "@mui/material";

export default function RequireAuth() {
  const { user, ready } = useAuth();
  const loc = useLocation();

  if (!ready) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (!user) return <Navigate to="/" replace state={{ from: loc }} />;

  return <Outlet />;
}
