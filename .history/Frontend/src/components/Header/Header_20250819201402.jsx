// src/components/Header/Header.jsx
import { Link } from "react-router-dom";
import { Box, Typography, Button, Divider } from "@mui/material";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <Box
      sx={{
        width: 240,
        height: "100vh",
        bgcolor: "primary.main",
        color: "white",
        display: "flex",
        flexDirection: "column",
        p: 2,
      }}
    >
      {/* Logo / Title */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        QUSCINA Admin
      </Typography>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.2)", mb: 2 }} />

      {/* Nav Links */}
      <Button component={Link} to="/dashboard" sx={{ color: "white", justifyContent: "flex-start" }}>
        Dashboard
      </Button>
      <Button component={Link} to="/users" sx={{ color: "white", justifyContent: "flex-start" }}>
        Users
      </Button>
      <Button component={Link} to="/orders" sx={{ color: "white", justifyContent: "flex-start" }}>
        Orders
      </Button>
      <Button component={Link} to="/shifts" sx={{ color: "white", justifyContent: "flex-start" }}>
        Shifts
      </Button>
      <Button component={Link} to="/reports" sx={{ color: "white", justifyContent: "flex-start" }}>
        Reports
      </Button>

      {/* Spacer pushes logout to bottom */}
      <Box sx={{ flexGrow: 1 }} />

      {user && (
        <Button
          onClick={logout}
          sx={{ color: "white", justifyContent: "flex-start" }}
        >
          Logout
        </Button>
      )}
    </Box>
  );
}