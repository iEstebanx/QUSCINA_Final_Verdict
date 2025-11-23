// QUSCINA_BACKOFFICE/Frontend/src/pages/Login/LoginPage.jsx
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Paper, Stack, Typography, TextField, Button, Divider,
  FormControlLabel, Switch, InputAdornment, IconButton, Dialog,
  AppBar, Toolbar, Slide, MenuItem, CircularProgress, LinearProgress,
  Select, FormControl, InputLabel,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
  import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";

import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useAlert } from "@/context/Snackbar/AlertContext";

const API_BASE = import.meta.env?.VITE_API_BASE ?? "";
const join = (p) => `${API_BASE}`.replace(/\/+$/,"") + `/${String(p||"").replace(/^\/+/, "")}`;

async function safeJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: text || res.statusText || "Invalid response" }; }
}

const Transition = forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

/* ===== Password helpers (same concept as User Management) ===== */
function scorePassword(pw) {
  if (!pw) return 0;
  let s = 0;
  const len = pw.length;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  s += Math.min(50, len * 5);
  s += (hasLower ? 10 : 0) + (hasUpper ? 10 : 0) + (hasDigit ? 15 : 0) + (hasSpecial ? 15 : 0);
  if (len >= 12 && hasDigit && hasSpecial) s += 10;
  return Math.max(0, Math.min(100, s));
}
const ruleChecks = (pw) => ({
  len8: pw.length >= 8,
  num: /\d/.test(pw),
  lower: /[a-z]/.test(pw),
  upper: /[A-Z]/.test(pw),
  special: /[^A-Za-z0-9]/.test(pw),
});
const PW_REGEX_ENFORCE = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

/* ===== Cooldown (fixed message, no countdown UI) ===== */
const COOLDOWN_MESSAGE =
  "A verification code is already active. Please wait 10 minutes before requesting another.";
const nowMs = () => Date.now();

export default function LoginPage() {
  // --------- Login state ---------
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [idError, setIdError] = useState("");
  const [pwError, setPwError] = useState("");

  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const alert = useAlert();
  const { user, ready } = useAuth();
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
  const [fpEmailSubmitting, setFpEmailSubmitting] = useState(false);
  const [fpEmailError, setFpEmailError] = useState("");

  // OTP cooldown state (authoritative comes from server via expiresAt)
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(null); // ISO string
  const [cooldownLeft, setCooldownLeft] = useState(0); // used only for disabling logic (silent)
  const [cooldownEmail, setCooldownEmail] = useState(""); // NEW – which email the cooldown belongs to

  // Step: OTP
  const [otpValues, setOtpValues] = useState(["", "", "", "", "", ""]);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState("");

  // Step: Reset
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [lockUntilIso, setLockUntilIso] = useState(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);

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

  // 🔒 Security Question lock state (15-minute lockout)
  const [sqLockSecondsLeft, setSqLockSecondsLeft] = useState(0);
  const [sqLockUntilIso, setSqLockUntilIso] = useState(null);
  const [sqLockedIdKey, setSqLockedIdKey] = useState(null);

  // Refs for OTP inputs
  const otpRefs = useRef(Array.from({ length: 6 }, () => null));

  useEffect(() => {
    if (ready && user) {
      const dest = (loc.state?.from?.pathname && loc.state.from.pathname !== "/")
        ? loc.state.from.pathname
        : "/dashboard";
      nav(dest, { replace: true });
    }
  }, [ready, user]); 

  // Focus first empty OTP box when step opens
  useEffect(() => {
    if (fpStep !== "otp") return;
    const idx = Math.max(0, otpValues.findIndex((d) => !d));
    const el = otpRefs.current[idx === -1 ? 0 : idx];
    const t = setTimeout(() => { if (el && typeof el.focus === "function") el.focus(); }, 0);
    return () => clearTimeout(t);
  }, [fpStep, otpValues]);

  // Silent cooldown ticking (for disabling buttons), based on otpCooldownUntil
  useEffect(() => {
    if (!otpCooldownUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(otpCooldownUntil).getTime() - nowMs()) / 1000));
      setCooldownLeft(left);
      if (left <= 0) setOtpCooldownUntil(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [otpCooldownUntil]);

  useEffect(() => {
    if (!lockUntilIso) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(lockUntilIso).getTime() - Date.now()) / 1000));
      setLockSecondsLeft(left);
      if (left <= 0) setLockUntilIso(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockUntilIso]);

  // 🔒 Security Question lock countdown (15-minute lock)
  useEffect(() => {
    if (!sqLockUntilIso) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((new Date(sqLockUntilIso).getTime() - Date.now()) / 1000)
      );
      setSqLockSecondsLeft(left);
      if (left <= 0) setSqLockUntilIso(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sqLockUntilIso]);

  // Normalize like the backend: 9 digits = employee_id (keep), else lowercase
  const idKey = (s) => {
    const t = String(s || "").trim();
    return /^\d{9}$/.test(t) ? t : t.toLowerCase();
  };

  const [lockedIdKey, setLockedIdKey] = useState(null); // which account is locked

  const fmtMMSS = (t) => {
    const m = Math.floor(t / 60).toString().padStart(2, "0");
    const s = (t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };
  const isLockedForCurrentId = lockSecondsLeft > 0 && lockedIdKey === idKey(identifier);

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
      const status = err?.status ?? err?.response?.status ?? 0;
      const data   = err?.data   ?? err?.response?.data   ?? {};
      const code   = data?.code || "";
      const msg    = err?.message || data?.error || "Sign in failed";

      setIdError("");
      setPwError("");

      if (status === 423) {
        const seconds = Number(data?.remaining_seconds || 0);
        if (seconds > 0) {
          setLockedIdKey(idKey(idVal));
          setLockUntilIso(new Date(Date.now() + seconds * 1000).toISOString());
          const m = Math.floor(seconds / 60), s = seconds % 60;
          alert.error(`Account temporarily locked. Try again in ${m}m ${s}s.`);
        } else {
          alert.error("Account locked. Please contact an Admin or Manager.");
        }
      } else if (status === 403) {
        alert.error(msg);
      } else if (status === 404 || code === "UNKNOWN_IDENTIFIER") {
        setIdError("Invalid Login ID");
      } else if (status === 401 && (code === "INVALID_PASSWORD" || !code)) {
        setPwError("Invalid Password");
      } else if (status === 0) {
        alert.error("Unable to reach server. Check your connection.");
      } else {
        alert.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Cooldown derived flags (PER EMAIL) ----------
  const normalizedFpEmail = fpEmail.trim().toLowerCase();                 // NEW
  const cooldownActive = !!otpCooldownUntil
    && cooldownLeft > 0
    && !!normalizedFpEmail
    && normalizedFpEmail === cooldownEmail;                                // NEW

  // ---------- Forgot Password: step navigation ----------
  const goChoose = () => setFpStep("choose");
  const goEmail = () => {
    setFpStep("email");
    // Show message only if cooldown applies to the current email
    if (cooldownActive) {
      setFpEmailError(COOLDOWN_MESSAGE);
    } else {
      setFpEmailError("");
    }
  };
  const goOtp = () => setFpStep("otp");
  const goReset = () => setFpStep("reset");
  const goSqIdentify = () => setFpStep("sq-identify");
  const goSqAnswers = () => setFpStep("sq-answers");

  // ---------- Forgot Password: choose handlers ----------
  const onChooseEmailOtp = () => {
    setFpEmail("");
    setFpEmailError("");
    setResetToken("");
    setNewPw("");
    setConfirmPw("");
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
  const DUP_RE = /duplicate entry/i;

  const onEmailVerifySubmit = async (e) => {
    e.preventDefault();
    setFpEmailError("");

    const email = normalizedFpEmail;                           // NEW – already normalized
    if (!email) { setFpEmailError("Email is required."); return; }

    // Local guard: block only if cooldown applies to THIS email
    if (
      otpCooldownUntil &&
      new Date(otpCooldownUntil).getTime() > nowMs() &&
      email === cooldownEmail                                        // NEW
    ) {
      setFpEmailError(COOLDOWN_MESSAGE);
      return;
    }

    setFpEmailSubmitting(true);
    try {
      const resp = await fetch(join("/api/auth/forgot/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      const j = await safeJson(resp);

      if (resp.status === 429) {
        if (j?.expiresAt) {
          setOtpCooldownUntil(j.expiresAt);
          setCooldownEmail(email);                               // NEW
        }
        throw new Error(j?.error || COOLDOWN_MESSAGE);
      }

      if (!resp.ok) {
        const msg = String(j?.error || resp.statusText || "Failed to send code");
        if (DUP_RE.test(msg)) throw new Error(COOLDOWN_MESSAGE);
        throw new Error(msg);
      }

      if (j?.expiresAt) {
        setOtpCooldownUntil(j.expiresAt);
        setCooldownEmail(email);                                 // NEW
      }
      alert.success("We’ve sent a 6-digit code to your email.");
      setOtpValues(["", "", "", "", "", ""]);
      goOtp();
    } catch (err) {
      setFpEmailError(err?.message || "Unable to verify right now.");
    } finally {
      setFpEmailSubmitting(false);
    }
  };

  const onResend = async () => {
    // Local guard – only if cooldown belongs to this email
    if (
      otpCooldownUntil &&
      new Date(otpCooldownUntil).getTime() > nowMs() &&
      normalizedFpEmail === cooldownEmail                       // NEW
    ) {
      return alert.info(COOLDOWN_MESSAGE);
    }
    try {
      const resp = await fetch(join("/api/auth/forgot/resend"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedFpEmail }),
      });
      const j = await safeJson(resp);

      if (resp.status === 429) {
        if (j?.expiresAt) {
          setOtpCooldownUntil(j.expiresAt);
          setCooldownEmail(normalizedFpEmail);                  // NEW
        }
        return alert.info(COOLDOWN_MESSAGE);
      }

      if (!resp.ok) {
        const msg = String(j?.error || resp.statusText || "Could not resend yet.");
        if (DUP_RE.test(msg)) return alert.info(COOLDOWN_MESSAGE);
        throw new Error(msg);
      }

      if (j?.expiresAt) {
        setOtpCooldownUntil(j.expiresAt);
        setCooldownEmail(normalizedFpEmail);                    // NEW
      }
      alert.info("A new code has been sent.");
    } catch (err) {
      alert.error(err?.message || "Resend failed.");
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
      const resp = await fetch(join("/api/auth/forgot/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedFpEmail, code: otpCode }),
      });
      const j = await safeJson(resp);
      if (!resp.ok) {
        const code = j?.code;
        if (code === "OTP_INVALID") {
          throw new Error("Invalid code. Please check and try again.");
        }
        if (code === "OTP_EXPIRED") {
          throw new Error("This code has expired. Please request a new one.");
        }
        if (code === "OTP_NOT_FOUND") {
          throw new Error("No active verification code. Please request a new one.");
        }
        throw new Error(j?.error || "Invalid code. Please try again.");
      }

      setResetToken(j.resetToken || "");
      alert.success("OTP verified. You can now reset your password.");
      goReset();
    } catch (err) {
      alert.error(err?.message || "Invalid code. Please try again.");
    } finally {
      setOtpSubmitting(false);
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
      const resp = await fetch(join("/api/auth/forgot/sq/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: id }),
      });
      const j = await safeJson(resp);
      if (!resp.ok) throw new Error(j?.error || "Unable to start security questions");

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

    const answerPayload = [{ id: sqSelectedId, answer: sqAnswer.trim() }];

    setSqLoading(true);
    try {
      const resp = await fetch(join("/api/auth/forgot/sq/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sqToken, answers: answerPayload }),
      });
      const j = await safeJson(resp);

      if (!resp.ok) {
        // 🔒 SQ lock: show fixed 10-minute message, ignore remaining_seconds
        if (resp.status === 423) {
          const secs = Number(j?.remaining_seconds || 900);
          const idKeyVal = sqIdentifier.trim().toLowerCase();

          setSqLockedIdKey(idKeyVal);
          setSqLockUntilIso(new Date(Date.now() + secs * 1000).toISOString());

          throw new Error("Too many incorrect answers. Please wait 15 minutes before trying again.");
        }

        // Other errors: use backend message or fallback
        throw new Error(j?.error || "Verification failed.");
      }

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
  const rules = ruleChecks(newPw);
  const pwScore = scorePassword(newPw);
  const rulesPass = rules.len8 && rules.num && rules.lower && rules.upper && rules.special;
  const confirmPass = newPw && confirmPw && newPw === confirmPw;

  const onResetSubmit = async (e) => {
    e.preventDefault();
    if (!resetToken) return alert.error("Missing reset token.");
    if (!PW_REGEX_ENFORCE.test(newPw)) {
      return alert.error("Password must be 8+ chars with 1 number, 1 lowercase, 1 uppercase, and 1 special character.");
    }
    if (newPw !== confirmPw) return alert.error("Passwords do not match.");

    setResetSubmitting(true);
    try {
      const resp = await fetch(join("/api/auth/forgot/reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resetToken, newPassword: newPw }),
      });
      const j = await safeJson(resp);
      if (!resp.ok) throw new Error(j?.error || "Reset failed");

      alert.success("Password updated. Please sign in with your new password.");
      onCloseForgot();
    } catch (err) {
      alert.error(err?.message || "Reset failed");
    } finally {
      setResetSubmitting(false);
    }
  };

  // Keep the effect that explains the disabled state while on email step
  useEffect(() => {
    if (fpStep !== "email") return;
    if (cooldownActive) {
      setFpEmailError(COOLDOWN_MESSAGE);
    } else {
      setFpEmailError((prev) => (prev === COOLDOWN_MESSAGE ? "" : prev));
    }
  }, [fpStep, cooldownActive]);

  return (
    <>
      <Paper
        elevation={3}
        sx={{
          width: "100%",
          maxWidth: { xs: 420, sm: 440, md: 480 },
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: { xs: 2.5, sm: 3.5, md: 4 },
            py: { xs: 2, sm: 2.5, md: 3 },
            background: (theme) => `linear-gradient(180deg,
              ${alpha(theme.palette.primary.main, 0.18)} 0%,
              ${alpha(theme.palette.primary.main, 0.10)} 60%,
              ${alpha(theme.palette.primary.main, 0.06)} 100%)`,
          }}
        >
          <Typography
            variant="h5"
            align="center"
            sx={{ fontWeight: 800, letterSpacing: 0.2, fontSize: { xs: 20, sm: 22, md: 24 } }}
          >
            Sign in
          </Typography>
          <Typography
            variant="body2"
            align="center"
            color="text.secondary"
            sx={{ mt: 0.5, fontSize: { xs: 12.5, sm: 13 } }}
          >
            Admin Dashboard (Admin/Manager only)
          </Typography>
        </Box>

        <Divider />

        {/* Form */}
        <Box component="form" onSubmit={onSubmit} noValidate sx={{ p: { xs: 2.5, sm: 3, md: 4 } }}>
          <Stack spacing={{ xs: 1.75, sm: 2, md: 2.25 }}>
            <TextField
              name="identifier"
              label="Employee ID / Username / Email"
              value={identifier}
              onChange={(e) => { setIdentifier(e.target.value); setIdError(""); }}
              autoComplete="username"
              required
              fullWidth
              placeholder="e.g. 202500001 · ced · ced@domain.com"
              error={!!idError}
              helperText={idError || " "}
            />

            <TextField
              name="password"
              label="Password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPwError(""); }}
              autoComplete="current-password"
              required
              fullWidth
              error={!!pwError}
              helperText={pwError || " "}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPw((v) => !v)} edge="end">
                        {showPw ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <FormControlLabel
              sx={{ ml: 0 }}
              control={<Switch checked={remember} onChange={(e) => setRemember(e.target.checked)} />}
              label="Remember me"
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={submitting || isLockedForCurrentId}
            >
              {isLockedForCurrentId
                ? `Locked: ${fmtMMSS(lockSecondsLeft)}`
                : (submitting ? "Signing in..." : "Sign In")}
            </Button>

            {isLockedForCurrentId && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: -0.5 }}
                aria-live="polite"
              >
                This account is locked. Please wait {fmtMMSS(lockSecondsLeft)} or sign in with a different account.
              </Typography>
            )}

            <Divider sx={{ my: { xs: 0, sm: 0.5 } }}>or</Divider>

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
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Verify your email
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Please enter your registered email address for verification.
                </Typography>

                <TextField
                  label="Registered Email Address *"
                  type="email"
                  value={fpEmail}
                  onChange={(e) => {
                    setFpEmail(e.target.value);
                    // Clear non-cooldown errors while typing
                    if (fpEmailError && fpEmailError !== COOLDOWN_MESSAGE) {
                      setFpEmailError("");
                    }
                  }}
                  placeholder="e.g. admin@quscina.com"
                  fullWidth
                  required
                />

                {!!fpEmailError && (
                  <Typography color="error" variant="body2">
                    {fpEmailError}
                  </Typography>
                )}

                <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                  <Button onClick={goChoose} variant="text" disabled={fpEmailSubmitting}>
                    Back
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={fpEmailSubmitting || cooldownActive}
                  >
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

                {cooldownActive && (
                  <Typography variant="body2" color="text.secondary" align="center">
                    {COOLDOWN_MESSAGE}
                  </Typography>
                )}

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

                <Button
                  variant="text"
                  disabled={otpSubmitting || cooldownActive}
                  onClick={onResend}
                >
                  {cooldownActive ? "Resend code (after cooldown)" : "Resend code"}
                </Button>
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
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={sqLoading || sqLockSecondsLeft > 0}
                  >
                    {sqLockSecondsLeft > 0
                      ? `Locked: ${fmtMMSS(sqLockSecondsLeft)}`
                      : (sqLoading ? <CircularProgress size={22} /> : "Verify Answer")}
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
                  <InputLabel id="sq-select-label">Security question</InputLabel>
                  <Select
                    labelId="sq-select-label"
                    label="Security question"
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
                  label="New password"
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  fullWidth
                />

                {newPw.length > 0 && (
                  <>
                    <LinearProgress
                      variant="determinate"
                      value={pwScore}
                      sx={{
                        height: 6,
                        borderRadius: 4,
                        "& .MuiLinearProgress-bar": (theme) => ({
                          backgroundColor:
                            pwScore < 40
                              ? theme.palette.error.main
                              : pwScore < 70
                              ? theme.palette.warning.main
                              : theme.palette.success.main,
                        }),
                      }}
                    />
                    <Box>
                      <Typography variant="subtitle2" sx={{ mt: 0.5, mb: 0.25 }}>
                        Must contain:
                      </Typography>
                      <Stack spacing={0.25}>
                        {[
                          { ok: rules.len8, text: "At least 8 characters" },
                          { ok: rules.num, text: "At least 1 number" },
                          { ok: rules.lower, text: "At least 1 lowercase letter" },
                          { ok: rules.upper, text: "At least 1 uppercase letter" },
                          { ok: rules.special, text: "At least 1 special character" },
                        ].map((r, i) => (
                          <Stack key={i} direction="row" spacing={0.75} alignItems="center">
                            {r.ok ? (
                              <CheckCircleOutlineIcon fontSize="small" color="success" />
                            ) : (
                              <CancelOutlinedIcon fontSize="small" color="error" />
                            )}
                            <Typography variant="body2" color={r.ok ? "success.main" : "text.primary"}>
                              {r.text}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  </>
                )}

                <TextField
                  label="Confirm new password"
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  required
                  fullWidth
                  error={!!confirmPw && !confirmPass}
                  helperText={!!confirmPw && !confirmPass ? "Passwords do not match." : " "}
                />

                <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                  <Button onClick={() => setFpStep("choose")} variant="text" disabled={resetSubmitting}>
                    Back
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={resetSubmitting || !rulesPass || !confirmPass}
                  >
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