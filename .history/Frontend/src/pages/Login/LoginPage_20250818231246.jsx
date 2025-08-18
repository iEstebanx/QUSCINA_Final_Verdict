import { useState } from "react";
import { Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useAlert } from "../../context/AlertContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const nav = useNavigate();
  const alert = useAlert();

  const onSubmit = async (e) => {
    e.preventDefault();
    await login(email, password);
    alert.success("Welcome back!");
    nav("/dashboard");
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Paper sx={{ p: 4, minWidth: 360 }}>
        <Typography variant="h6" gutterBottom>Admin Login</Typography>
        <Stack component="form" onSubmit={onSubmit} spacing={2}>
          <TextField label="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <TextField label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          <Button type="submit" variant="contained">Sign in</Button>
        </Stack>
      </Paper>
    </Box>
  );
}