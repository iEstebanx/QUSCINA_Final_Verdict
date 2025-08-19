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
  InputAdornment,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import FacebookIcon from "@mui/icons-material/Facebook";
import GitHubIcon from "@mui/icons-material/GitHub";
import GoogleIcon from "@mui/icons-material/Google";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useAlert } from "@/context/AlertContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { login /* , loginWithProvider */ } = useAuth();
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
    // No full-height container here — EmptyLayout handles centering/viewport
    <Paper
      elevation={3}
      sx={{
        width: "100%",
        maxWidth: 440,             // grows down to phones, caps on desktop
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      {/* Header with gradient + social logins */}
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
        <Typography
          variant="h5"
          align="center"
          sx={{ fontWeight: 800, letterSpacing: 0.2 }}
        >
          Sign in
        </Typography>

        <Stack
          direction="row"
          justifyContent="center"
          spacing={2}
          sx={{ mt: 2 }}
        >
          <Tooltip title="Continue with Facebook">
            <span>
              <IconButton size="large" aria-label="Facebook login" disabled>
                <FacebookIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Continue with GitHub">
            <span>
              <IconButton size="large" aria-label="GitHub login" disabled>
                <GitHubIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Continue with Google">
            <span>
              <IconButton size="large" aria-label="Google login" disabled>
                <GoogleIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      <Divider />

      {/* Form */}
      <Box component="form" onSubmit={onSubmit} noValidate sx={{ p: { xs: 3, sm: 4 } }}>
        <Stack spacing={2.25}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            fullWidth
            inputMode="email"
            slotProps={{ input: { inputProps: { "data-qa": "login-email" } } }}
          />

          <TextField
            label="Password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            slotProps={{
              input: {
                inputProps: { "data-qa": "login-password" },
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPw ? "Hide password" : "Show password"}
                      onClick={() => setShowPw((v) => !v)}
                      edge="end"
                    >
                      {showPw ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
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
  );
}