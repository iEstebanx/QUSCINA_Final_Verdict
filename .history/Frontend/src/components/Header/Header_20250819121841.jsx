// src/components/Header/Header.jsx
import { Link } from "react-router-dom";
import { AppBar, Toolbar, Typography, Button } from "@mui/material";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <AppBar position="static" elevation={0}>
      <Toolbar>
        <Typography sx={{ flexGrow: 1 }} variant="h6">
          QUSCINA Admin
        </Typography>

        <Button component={Link} to="/dashboard">Dashboard</Button>
        <Button component={Link} to="/users">Users</Button>
        <Button component={Link} to="/menu">Menu</Button>
        <Button component={Link} to="/orders">Orders</Button>
        <Button component={Link} to="/shifts">Shifts</Button>
        <Button component={Link} to="/reports">Reports</Button>

        {user && <Button onClick={logout}>Logout</Button>}
      </Toolbar>
    </AppBar>
  );
}