// Frontend/src/pages/Login/LoginPage.jsx
import { useState } from "react";
import {
  Box, Paper, Stack, Typography, TextField, Button, Divider,
  FormControlLabel, Switch, InputAdornment, IconButton
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import GoogleIcon from "@mui/icons-material/Google";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useAlert } from "@/context/AlertContext";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { login, loginWithProvider } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const alert = useAlert();
  const theme = useTheme();

  const onSubmit = async (e) => {
    e.preventDefault();

    // fallback to FormData in case browser autofill didn't update state
    const fd = new FormData(e.currentTarget);
    const idVal = (identifier || fd.get("identifier") || "").toString().trim();
    const pwVal = (password || fd.get("password") || "").toString();

    if (!idVal || !pwVal) return; // still prevent empty submits

    setSubmitting(true);
    try {
      await login(idVal, pwVal, { remember });
      alert.success("Welcome back!");
      const dest = loc.state?.from?.pathname || "/dashboard";
      nav(dest, { replace: true });
    } catch (err) {
      alert.error(err?.message || "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    if (!loginWithProvider) {
      alert.info("Google sign-in is not configured yet.");
      return;
    }
    setSubmitting(true);
    try {
      await loginWithProvider("google");
      alert.success("Signed in with Google");
      nav("/dashboard");
    } catch (err) {
      alert.error(err?.message || "Google sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ width: "100%", maxWidth: 440, borderRadius: 3, overflow: "hidden" }}>
      {/* Header */}
      <Box
        sx={{
          px: { xs: 3, sm: 4 },
          py: { xs: 2.5, sm: 3 },
          background: `linear-gradient(
            180deg,
            ${alpha(theme.palette.primary.main, 0.18)} 0%,
            ${alpha(theme.palette.primary.main, 0.10)} 60%,
            ${alpha(theme.palette.primary.main, 0.06)} 100%
          )`,
        }}
      >
        <Typography variant="h5" align="center" sx={{ fontWeight: 800, letterSpacing: 0.2 }}>
          Sign in
        </Typography>
        <Typography variant="body2" align="center" color="text.secondary" sx={{ mt: 0.5 }}>
          Admin Dashboard (Admin/Manager only)
        </Typography>
      </Box>

      <Divider />

      {/* Form */}
      <Box component="form" onSubmit={onSubmit} noValidate sx={{ p: { xs: 3, sm: 4 } }}>
        <Stack spacing={2.25}>
          <TextField
            name="identifier"
            label="Employee ID / Username / Email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onInput={(e) => setIdentifier(e.currentTarget.value)}   // catches autofill
            autoComplete="username"
            required
            fullWidth
            placeholder="e.g. 202500001  ·  ced  ·  ced@domain.com"
          />

          <TextField
            name="password"
            label="Password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onInput={(e) => setPassword(e.currentTarget.value)}     // catches autofill
            autoComplete="current-password"
            required
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPw((v) => !v)} edge="end" aria-label={showPw ? "Hide password" : "Show password"}>
                    {showPw ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <FormControlLabel
            control={<Switch checked={remember} onChange={(e) => setRemember(e.target.checked)} />}
            label="Remember me"
          />

          {/* IMPORTANT: don't gate by inputs; only by 'submitting' */}
          <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting}>
            {submitting ? "Signing in..." : "Sign In"}
          </Button>

          <Divider sx={{ my: 0.5 }}>or</Divider>

          <Button
            onClick={onGoogle}
            variant="outlined"
            size="large"
            fullWidth
            startIcon={<GoogleIcon />}
            disabled={submitting || !loginWithProvider}
          >
            Continue with Google
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}