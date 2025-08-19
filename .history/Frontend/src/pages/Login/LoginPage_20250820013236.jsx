// src/pages/Login/LoginPage.jsx
import { useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  TextField,
  Button,
  IconButton,
  Tooltip,
  Divider,
  FormControlLabel,
  Switch,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import FacebookIcon from "@mui/icons-material/Facebook";
import GitHubIcon from "@mui/icons-material/GitHub";
import GoogleIcon from "@mui/icons-material/Google";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useAlert } from "@/context/AlertContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { login /*, loginWithProvider */ } = useAuth();
  const nav = useNavigate();
  const alert = useAlert();
  const theme = useTheme();

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password, { remember });
      alert.success("Welcome back!");
      nav("/dashboard");
    } catch (err) {
      alert.error(err?.message || "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: 2,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          width: 420,
          maxWidth: "100%",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {/* Header with title + social buttons */}
        <Box
          sx={{
            px: 4,
            py: 3,
            background: `linear-gradient(180deg,
              ${alpha(theme.palette.primary.main, 0.18)} 0%,
              ${alpha(theme.palette.primary.main, 0.10)} 60%,
              ${alpha(theme.palette.primary.main, 0.06)} 100%
            )`,
          }}
        >
          <Typography variant="h5" align="center" sx={{ fontWeight: 700 }}>
            Sign in
          </Typography>

          <Stack
            direction="row"
            justifyContent="center"
            spacing={2.5}
            sx={{ mt: 2 }}
          >
            <Tooltip title="Continue with Facebook">
              <IconButton size="large" aria-label="Facebook login" disabled>
                <FacebookIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Continue with GitHub">
              <IconButton size="large" aria-label="GitHub login" disabled>
                <GitHubIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Continue with Google">
              <IconButton size="large" aria-label="Google login" disabled>
                <GoogleIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        <Divider />

        {/* Form body */}
        <Box component="form" onSubmit={onSubmit} noValidate sx={{ p: 4 }}>
          <Stack spacing={2.25}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              fullWidth
              slotProps={{ input: { inputProps: { "data-qa": "login-email" } } }}
            />

            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              fullWidth
              slotProps={{ input: { inputProps: { "data-qa": "login-password" } } }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
              }
              label="Remember me"
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}