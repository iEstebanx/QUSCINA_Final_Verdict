// Frontend/src/pages/Login/LoginPage.jsx
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Paper, Stack, Typography, TextField, Button, Divider,
  FormControlLabel, Switch, InputAdornment, IconButton, Dialog,
  AppBar, Toolbar, Slide, MenuItem, FormHelperText, CircularProgress,
  Select, FormControl, InputLabel,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useAlert } from "@/context/Snackbar/AlertContext";
import { ALNUM_DASH_RE } from "@/utils/patterns";

const API_BASE = import.meta.env?.VITE_API_BASE ?? "";

const Transition = forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function LoginPage() {
  // --------- Login state ---------
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const alert = useAlert();
  const theme = useTheme();

  // --------- Forgot Password dialog state ---------
  const [forgotOpen, setForgotOpen] = useState(false);
  // "choose" | "email" | "otp" | "reset" | "sq-identify" | "sq-answers"
  const [fpStep, setFpStep] = useState("choose");

  // Step: choose
  const onOpenForgot = () => { setForgotOpen(true); setFpStep("choose"); };
  const onCloseForgot = () => { setForgotOpen(false); setTimeout(() => setFpStep("choose"), 250); };

  // Step: email verification (OTP path)
  const [fpEmail, setFpEmail] = useState("");
  const [fpVerifyType, setFpVerifyType] = useState("employeeId");
  const [fpVerifyValue, setFpVerifyValue] = useState("");
  const [fpEmailSubmitting, setFpEmailSubmitting] = useState(false);
  const [fpEmailError, setFpEmailError] = useState("");

  // Step: OTP
  const [otpValues, setOtpValues] = useState(["", "", "", "", "", ""]);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState("");

  // Step: Reset
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // --------- Security Questions (fixed 5) ---------
  const SQ_CATALOG = [
    { id: "pet",           prompt: "What is the name of your first pet?" },
    { id: "school",        prompt: "What is the name of your elementary school?" },
    { id: "city",          prompt: "In what city were you born?" },
    { id: "mother_maiden", prompt: "What is your mother’s maiden name?" },
    { id: "nickname",      prompt: "What was your childhood nickname?" },
  ];

  const [sqIdentifier, setSqIdentifier] = useState(""); // email/username/employeeId
  const [sqLoading, setSqLoading] = useState(false);
  const [sqError, setSqError] = useState("");
  const [sqToken, setSqToken] = useState("");
  const [sqSelectedId, setSqSelectedId] = useState(SQ_CATALOG[0].id);
  const [sqAnswer, setSqAnswer] = useState("");

  // Refs for OTP inputs
  const otpRefs = useRef(Array.from({ length: 6 }, () => null));

  useEffect(() => {
    if (fpStep !== "otp") return;
    const idx = Math.max(0, otpValues.findIndex((d) => !d));
    const el = otpRefs.current[idx === -1 ? 0 : idx];
    const t = setTimeout(() => { if (el && typeof el.focus === "function") el.focus(); }, 0);
    return () => clearTimeout(t);
  }, [fpStep, otpValues]);

  // ---------- Login handlers ----------
  const onSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const idVal = (identifier || fd.get("identifier") || "").toString().trim();
    const pwVal = (password || fd.get("password") || "").toString();
    if (!idVal || !pwVal) return;

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

  // ---------- Forgot Password: step navigation ----------
  const goChoose = () => setFpStep("choose");
  const goEmail = () => setFpStep("email");
  const goOtp = () => setFpStep("otp");
  const goReset = () => setFpStep("reset");
  const goSqIdentify = () => setFpStep("sq-identify");
  const goSqAnswers = () => setFpStep("sq-answers");

  // ---------- Forgot Password: choose handlers ----------
  const onChooseEmailOtp = () => {
    setFpEmail(""); setFpVerifyType("employeeId"); setFpVerifyValue("");
    setFpEmailError(""); setResetToken(""); setNewPw(""); setConfirmPw("");
    setOtpValues(["", "", "", "", "", ""]);
    goEmail();
  };

  const onChooseSecurityQuestions = () => {
    setSqIdentifier("");
    setSqLoading(false);
    setSqError("");
    setSqToken("");
    setSqSelectedId(SQ_CATALOG[0].id);
    setSqAnswer("");
    setResetToken("");
    setNewPw("");
    setConfirmPw("");
    goSqIdentify();
  };

  // ---------- Forgot Password: email verify submit (OTP path) ----------
  const onEmailVerifySubmit = async (e) => {
    e.preventDefault();
    setFpEmailError("");
    const email = fpEmail.trim().toLowerCase();
    if (!email) {
      setFpEmailError("Email is required.");
      return;
    }
    const extra = fpVerifyValue.trim();
    if (extra && fpVerifyType === "employeeId" && !ALNUM_DASH_RE.test(extra)) {
      setFpEmailError("Employee ID contains invalid characters.");
      return;
    }

    setFpEmailSubmitting(true);
    try {
      const payload = {
        email,
        verifyType: extra ? fpVerifyType : undefined,
        verifyValue: extra || undefined,
      };

      const resp = await fetch(`${API_BASE}/api/auth/forgot/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error || "Failed to send code");
      
      // success -> go OTP
      alert.success("We’ve sent a 6-digit code to your email.");
      setOtpValues(["", "", "", "", "", ""]);
      goOtp();
    } catch (err) {
      setFpEmailError(err?.message || "Unable to verify right now.");
    } finally {
      setFpEmailSubmitting(false);
    }
  };

  // ---------- OTP helpers ----------
  const onChangeOtp = (index, value) => {
    const val = value.replace(/\D/g, "").slice(0, 1);
    setOtpValues((prev) => { const next = [...prev]; next[index] = val; return next; });
    if (val && index < 5 && otpRefs.current[index + 1]) otpRefs.current[index + 1].focus();
  };

  const onKeyDownOtp = (index, e) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) {
      e.preventDefault(); otpRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) { e.preventDefault(); otpRefs.current[index - 1]?.focus(); }
    if (e.key === "ArrowRight" && index < 5) { e.preventDefault(); otpRefs.current[index + 1]?.focus(); }
  };

  const otpCode = useMemo(() => otpValues.join(""), [otpValues]);

  const onOtpSubmit = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) return alert.error("Please enter the 6-digit code.");
    setOtpSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/api/auth/forgot/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: fpEmail.trim().toLowerCase(), code: otpCode }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error || "Invalid code");

      setResetToken(j.resetToken || "");
      alert.success("OTP verified. You can now reset your password.");
      goReset();
    } catch (err) {
      alert.error(err?.message || "Invalid code. Please try again.");
    } finally {
      setOtpSubmitting(false);
    }
  };

  const onResend = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/auth/forgot/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: fpEmail.trim().toLowerCase() }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error || "Could not resend yet. Try again shortly.");
      alert.info("A new code has been sent.");
    } catch (err) {
      alert.error(err?.message || "Resend failed.");
    }
  };

  // ---------- Security Questions: start ----------
  const onSqStart = async (e) => {
    e.preventDefault();
    setSqError("");
    const id = (sqIdentifier || "").trim();
    if (!id) { setSqError("Please enter your email / username / employee ID."); return; }

    setSqLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/auth/forgot/sq/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: id }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error || "Unable to start security questions");

      // Backend returns only { ok, sqToken }
      setSqToken(j.sqToken);
      setSqSelectedId(SQ_CATALOG[0].id);
      setSqAnswer("");
      goSqAnswers();
    } catch (err) {
      setSqError(err?.message || "Unable to start security questions.");
    } finally {
      setSqLoading(false);
    }
  };

  // ---------- Security Questions: verify ----------
  const onSqVerify = async (e) => {
    e.preventDefault();
    if (!sqToken) return alert.error("Missing verification token.");
    if (!sqSelectedId || !sqAnswer.trim()) {
      return alert.error("Please choose a question and enter your answer.");
    }

    const answers = [{ id: sqSelectedId, answer: sqAnswer.trim() }];

    setSqLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/auth/forgot/sq/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sqToken, answers }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error || "Verification failed");

      setResetToken(j.resetToken || "");
      alert.success("Verified! You can now reset your password.");
      goReset();
    } catch (err) {
      alert.error(err?.message || "Verification failed.");
    } finally {
      setSqLoading(false);
    }
  };

  // ---------- Reset password (shared) ----------
  const onResetSubmit = async (e) => {
    e.preventDefault();
    if (!resetToken) return alert.error("Missing reset token.");
    if (!newPw || newPw.length < 8) return alert.error("Password must be at least 8 characters.");
    if (newPw !== confirmPw) return alert.error("Passwords do not match.");

    setResetSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/api/auth/forgot/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resetToken, newPassword: newPw }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error || "Reset failed");

      alert.success("Password updated. Please sign in with your new password.");
      onCloseForgot();
    } catch (err) {
      alert.error(err?.message || "Reset failed");
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <>
      <Paper elevation={3} sx={{ width: "100%", maxWidth: 440, borderRadius: 3, overflow: "hidden" }}>
        {/* Header */}
        <Box sx={{
          px: { xs: 3, sm: 4 }, py: { xs: 2.5, sm: 3 },
          background: `linear-gradient(180deg,
            ${alpha(theme.palette.primary.main, 0.18)} 0%,
            ${alpha(theme.palette.primary.main, 0.10)} 60%,
            ${alpha(theme.palette.primary.main, 0.06)} 100%)`,
        }}>
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
              onInput={(e) => setIdentifier(e.currentTarget.value)}
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
              autoComplete="current-password"
              required
              fullWidth
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPw((v) => !v)}
                        edge="end"
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <FormControlLabel
              control={<Switch checked={remember} onChange={(e) => setRemember(e.target.checked)} />}
              label="Remember me"
            />

            <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting}>
              {submitting ? "Signing in..." : "Sign In"}
            </Button>

            <Divider sx={{ my: 0.5 }}>or</Divider>

            <Button onClick={onOpenForgot} variant="outlined" size="large" fullWidth disabled={submitting}>
              Forgot Password
            </Button>
          </Stack>
        </Box>
      </Paper>

      {/* ---------- Forgot Password Dialog ---------- */}
      <Dialog fullScreen open={forgotOpen} onClose={onCloseForgot} TransitionComponent={Transition}>
        <AppBar sx={{ position: "relative" }} elevation={0} color="default">
          <Toolbar>
            {fpStep !== "choose" ? (
              <IconButton edge="start" onClick={goChoose} aria-label="back"><ArrowBackIcon /></IconButton>
            ) : null}
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              Forgot Password
            </Typography>
            <IconButton edge="end" onClick={onCloseForgot} aria-label="close"><CloseIcon /></IconButton>
          </Toolbar>
        </AppBar>

        <Box sx={{ p: { xs: 3, sm: 4 }, maxWidth: 720, mx: "auto", width: "100%" }}>
          {/* Choose */}
          {fpStep === "choose" && (
            <Stack spacing={3}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>Choose a recovery method</Typography>
              <Typography variant="body2" color="text.secondary">Select how you want to recover your account.</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button variant="contained" size="large" onClick={onChooseEmailOtp} sx={{ flex: 1 }}>Email OTP</Button>
                <Button variant="outlined" size="large" onClick={onChooseSecurityQuestions} sx={{ flex: 1 }}>
                  Security Questions
                </Button>
              </Stack>
            </Stack>
          )}

          {/* Email verify (OTP path) */}
          {fpStep === "email" && (
            <Box component="form" onSubmit={onEmailVerifySubmit} noValidate sx={{ mt: 1 }}>
              <Stack spacing={2.25}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Verify your email</Typography>
                <Typography variant="body2" color="text.secondary">
                  Please enter your registered email address and (optionally) one of the extra details below for verification.
                </Typography>

                <TextField label="Registered Email Address *" type="email" value={fpEmail}
                  onChange={(e) => setFpEmail(e.target.value)} placeholder="e.g. admin@quscina.com" fullWidth required />

                <TextField select label="Choose information for verification (optional)"
                  value={fpVerifyType} onChange={(e) => setFpVerifyType(e.target.value)} fullWidth>
                  <MenuItem value="employeeId">Employee ID</MenuItem>
                  <MenuItem value="username">Username</MenuItem>
                </TextField>

                <TextField
                  label={fpVerifyType === "employeeId" ? "Enter your Employee ID (optional)" : "Enter your Username (optional)"}
                  value={fpVerifyValue} onChange={(e) => setFpVerifyValue(e.target.value)} fullWidth
                />
                <FormHelperText>
                  If you provide the extra info, it must match our records for this email.
                </FormHelperText>

                {!!fpEmailError && <Typography color="error" variant="body2">{fpEmailError}</Typography>}

                <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                  <Button onClick={goChoose} variant="text" disabled={fpEmailSubmitting}>Back</Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={fpEmailSubmitting}>
                    {fpEmailSubmitting ? "Checking..." : "Submit"}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}

          {/* OTP */}
          {fpStep === "otp" && (
            <Box component="form" onSubmit={onOtpSubmit} noValidate sx={{ mt: 1 }}>
              <Stack spacing={2.25} alignItems="center">
                <Typography variant="h6" sx={{ fontWeight: 700, textAlign: "center" }}>
                  Enter verification code
                </Typography>
                <Typography variant="body2" color="text.secondary" align="center">
                  We sent a 6-digit code to <strong>{fpEmail}</strong>. Enter it below to continue.
                </Typography>

                <Stack direction="row" spacing={1.25} sx={{ mt: 1 }}>
                  {otpValues.map((val, idx) => (
                    <TextField
                      key={idx}
                      value={val}
                      onChange={(e) => onChangeOtp(idx, e.target.value)}
                      onKeyDown={(e) => onKeyDownOtp(idx, e)}
                      inputRef={(el) => (otpRefs.current[idx] = el)}
                      slotProps={{
                        htmlInput: {
                          inputMode: "numeric",
                          pattern: "[0-9]*",
                          maxLength: 1,
                          style: { textAlign: "center", fontSize: 24, width: 44 },
                          "aria-label": `Digit ${idx + 1}`,
                        },
                      }}
                    />
                  ))}
                </Stack>

                <Stack direction="row" spacing={2} sx={{ width: "100%", pt: 1 }}>
                  <Button onClick={goEmail} variant="text" disabled={otpSubmitting}>Back</Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={otpSubmitting}>
                    {otpSubmitting ? "Verifying..." : "Verify Code"}
                  </Button>
                </Stack>

                <Button variant="text" disabled={otpSubmitting} onClick={onResend}>Resend code</Button>
              </Stack>
            </Box>
          )}

          {/* Security Questions — Identify */}
          {fpStep === "sq-identify" && (
            <Box component="form" onSubmit={onSqStart} noValidate sx={{ mt: 1 }}>
              <Stack spacing={2.25}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Verify using security questions</Typography>
                <Typography variant="body2" color="text.secondary">
                  Enter your <strong>email</strong>, <strong>username</strong>, or <strong>employee ID</strong> to continue.
                </Typography>

                <TextField
                  label="Email / Username / Employee ID"
                  value={sqIdentifier}
                  onChange={(e) => setSqIdentifier(e.target.value)}
                  fullWidth
                  required
                />

                {!!sqError && <Typography color="error" variant="body2">{sqError}</Typography>}

                <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                  <Button onClick={goChoose} variant="text" disabled={sqLoading}>Back</Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={sqLoading}>
                    {sqLoading ? <CircularProgress size={22} /> : "Continue"}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}

          {/* Security Questions — Answer */}
          {fpStep === "sq-answers" && (
            <Box component="form" onSubmit={onSqVerify} noValidate sx={{ mt: 1 }}>
              <Stack spacing={2.25}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Answer your security question
                </Typography>

                <FormControl fullWidth>
                  <InputLabel id="sq-select-label">Choose a question</InputLabel>
                  <Select
                    labelId="sq-select-label"
                    label="Choose a question"
                    value={sqSelectedId}
                    onChange={(e) => setSqSelectedId(e.target.value)}
                    required
                  >
                    {SQ_CATALOG.map((q) => (
                      <MenuItem key={q.id} value={q.id}>
                        {q.prompt}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Your answer"
                  value={sqAnswer}
                  onChange={(e) => setSqAnswer(e.target.value)}
                  fullWidth
                  required
                />

                <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                  <Button onClick={goSqIdentify} variant="text" disabled={sqLoading}>
                    Back
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={sqLoading}>
                    {sqLoading ? <CircularProgress size={22} /> : "Verify Answer"}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}

          {/* Reset Password (shared for OTP/SQ) */}
          {fpStep === "reset" && (
            <Box component="form" onSubmit={onResetSubmit} noValidate sx={{ mt: 1 }}>
              <Stack spacing={2.25}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Set a new password</Typography>
                <TextField
                  label="New password" type="password" value={newPw}
                  onChange={(e) => setNewPw(e.target.value)} required fullWidth
                />
                <TextField
                  label="Confirm new password" type="password" value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)} required fullWidth
                />
                <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                  <Button onClick={() => setFpStep("choose")} variant="text" disabled={resetSubmitting}>Back</Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={resetSubmitting}>
                    {resetSubmitting ? "Saving..." : "Update Password"}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </Box>
      </Dialog>
    </>
  );
}