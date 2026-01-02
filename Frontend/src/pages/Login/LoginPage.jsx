// QUSCINA_BACKOFFICE/Frontend/src/pages/Login/LoginPage.jsx
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  TextField,
  Button,
  Divider,
  FormControlLabel,
  Switch,
  InputAdornment,
  IconButton,
  Dialog,
  AppBar,
  Toolbar,
  Slide,
  MenuItem,
  CircularProgress,
  LinearProgress,
  Select,
  FormControl,
  InputLabel,
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
const join = (p) =>
  `${API_BASE}`.replace(/\/+$/, "") + `/${String(p || "").replace(/^\/+/, "")}`;

async function safeJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || res.statusText || "Invalid response" };
  }
}

function resolvePostLoginDest(role, fromPath) {
  const r = String(role || "");
  const from = String(fromPath || "");

  const isPos = from.startsWith("/pos");
  const isRoot = from === "/" || from === "";

  if (r === "Admin") {
    // Admin should not land in POS routes
    if (!isRoot && !isPos) return from;
    return "/dashboard";
  }

  // Cashier (or anything else) should land in POS routes only
  if (!isRoot && isPos) return from;
  return "/pos/menu";
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
  s +=
    (hasLower ? 10 : 0) +
    (hasUpper ? 10 : 0) +
    (hasDigit ? 15 : 0) +
    (hasSpecial ? 15 : 0);
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
const PW_REGEX_ENFORCE =
  /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

/* ===== Cooldown (fixed message, no countdown UI) ===== */
const COOLDOWN_MESSAGE =
  "A verification code is already active. Please wait 10 minutes before requesting another.";
const nowMs = () => Date.now();

export default function LoginPage() {
  // --------- Login step + identity ---------
  const [loginStep, setLoginStep] = useState("id"); // "id" | "secret"
  const [identifier, setIdentifier] = useState("");
  const [loginMode, setLoginMode] = useState("password"); // "password" | "pin"
  const [roleHint, setRoleHint] = useState(""); // "Admin" | "Cashier" | ""
  const [employeeIdHint, setEmployeeIdHint] = useState(""); // resolved employeeId from precheck

  // secret input
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // ----- PIN keypad behavior (Backoffice) -----
  const PIN_LEN = 6; // set to 6 to match Cashier POS; if you want 4–8, see note below
  const [pinValue, setPinValue] = useState("");

  // dots slots
  const pinSlots = useMemo(
    () => Array.from({ length: PIN_LEN }, (_, i) => `pin-slot-${i}`),
    []
  );

  const activeSecretValue = loginMode === "pin" ? pinValue : secret;

  // keep secret state in sync for submit()
  useEffect(() => {
    if (loginMode !== "pin") return;
    setSecret(pinValue); // so onSubmit continues to work without rewriting logic
  }, [loginMode, pinValue, setSecret]);

  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prechecking, setPrechecking] = useState(false);

  const [idError, setIdError] = useState("");
  const [secretError, setSecretError] = useState("");

  const { login, user, ready, precheckLogin } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const alert = useAlert();
  const theme = useTheme();

  // --------- Forgot dialog (role-aware) ---------
  const [forgotOpen, setForgotOpen] = useState(false);
  // "identify" | "choose-admin" | "email" | "otp" | "reset" | "sq-identify" | "sq-answers"
  const [fpStep, setFpStep] = useState("identify");

  const [fpIdentifier, setFpIdentifier] = useState(""); // login id entered in forgot flow
  const [fpRole, setFpRole] = useState(""); // "Admin" | "Cashier" | ""
  const [fpEmployeeId, setFpEmployeeId] = useState(""); // resolved
  const [fpLoginMode, setFpLoginMode] = useState("password"); // or pin
  const [fpIdentifySubmitting, setFpIdentifySubmitting] = useState(false);
  const [fpIdentifyError, setFpIdentifyError] = useState("");

  // Ticket flow
  const [ticketActive, setTicketActive] = useState(false);
  const [ticketExpiresAt, setTicketExpiresAt] = useState("");
  const [ticketCreatedAt, setTicketCreatedAt] = useState("");
  const [ticketRequestId, setTicketRequestId] = useState(null);

  const [ticketCode, setTicketCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  // ----- Cashier Reset Ticket -> PIN reset inside Enter PIN keypad -----
  const [cashierTicketOpen, setCashierTicketOpen] = useState(false);
  const [cashierTicketCode, setCashierTicketCode] = useState("");
  const [cashierTicketSubmitting, setCashierTicketSubmitting] = useState(false);

  const [cashierResetRequestId, setCashierResetRequestId] = useState(null);

  const [pinResetMode, setPinResetMode] = useState(false); // true = keypad is for setting new pin
  const [pinResetStage, setPinResetStage] = useState("new"); // "new" | "confirm"
  const [pinResetFirst, setPinResetFirst] = useState(""); // stores first entry
  const [pinResetError, setPinResetError] = useState("");
  const [pinResetTicket, setPinResetTicket] = useState(""); // stored verified ticket

  // Existing Admin forgot-password flow state (kept as-is)
  const [fpEmail, setFpEmail] = useState("");
  const [fpEmailSubmitting, setFpEmailSubmitting] = useState(false);
  const [fpEmailError, setFpEmailError] = useState("");

  const [otpCooldownUntil, setOtpCooldownUntil] = useState(null); // ISO string
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [cooldownEmail, setCooldownEmail] = useState("");

  const [otpValues, setOtpValues] = useState(["", "", "", "", "", ""]);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState("");

  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [lockUntilIso, setLockUntilIso] = useState(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const [lockPermanent, setLockPermanent] = useState(false);

  // Security Questions (Admin)
  const SQ_CATALOG = [
    { id: "pet", prompt: "What is the name of your first pet?" },
    { id: "school", prompt: "What is the name of your elementary school?" },
    { id: "city", prompt: "In what city were you born?" },
    { id: "mother_maiden", prompt: "What is your mother’s maiden name?" },
    { id: "nickname", prompt: "What was your childhood nickname?" },
  ];

  const [sqIdentifier, setSqIdentifier] = useState("");
  const [sqLoading, setSqLoading] = useState(false);
  const [sqError, setSqError] = useState("");
  const [sqToken, setSqToken] = useState("");
  const [sqSelectedId, setSqSelectedId] = useState(SQ_CATALOG[0].id);
  const [sqAnswer, setSqAnswer] = useState("");

  const [sqLockSecondsLeft, setSqLockSecondsLeft] = useState(0);
  const [sqLockUntilIso, setSqLockUntilIso] = useState(null);
  const [sqLockedIdKey, setSqLockedIdKey] = useState(null);

  const otpRefs = useRef(Array.from({ length: 6 }, () => null));
  const didRedirectRef = useRef(false);
  const pinConfirmInFlightRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) return;
    if (didRedirectRef.current) return;

    const role = String(user?.role || "");
    const from = loc.state?.from?.pathname;

    const dest = resolvePostLoginDest(role, from);

    if (loc.pathname === dest) return;

    didRedirectRef.current = true;
    nav(dest, { replace: true });
  }, [ready, user, nav, loc.pathname, loc.state]);


  // Focus first empty OTP box when step opens
  useEffect(() => {
    if (fpStep !== "otp") return;
    const idx = Math.max(0, otpValues.findIndex((d) => !d));
    const el = otpRefs.current[idx === -1 ? 0 : idx];
    const t = setTimeout(() => {
      if (el && typeof el.focus === "function") el.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [fpStep, otpValues]);

  // Silent cooldown ticking (for disabling buttons)
  useEffect(() => {
    if (!otpCooldownUntil) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((new Date(otpCooldownUntil).getTime() - nowMs()) / 1000)
      );
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
      const left = Math.max(
        0,
        Math.ceil((new Date(lockUntilIso).getTime() - Date.now()) / 1000)
      );
      setLockSecondsLeft(left);
      if (left <= 0) setLockUntilIso(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockUntilIso]);

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

  // Normalize like backend: 9 digits = employee_id, else lowercase
  const idKey = (s) => {
    const t = String(s || "").trim();
    return /^\d{9}$/.test(t) ? t : t.toLowerCase();
  };
  const [lockedIdKey, setLockedIdKey] = useState(null);

  const fmtMMSS = (t) => {
    const m = Math.floor(t / 60).toString().padStart(2, "0");
    const s = (t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatLocalPH = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";
  
  const isLockedForCurrentId =
    lockedIdKey === idKey(identifier) && (lockPermanent || lockSecondsLeft > 0);

  const secretLabel = loginMode === "pin" ? "PIN" : "Password";
  const secretAutoComplete =
    loginMode === "pin" ? "one-time-code" : "current-password";

  const isPinResetUi = loginStep === "secret" && loginMode === "pin" && pinResetMode;

  // ---------------------- Login: Next (precheck) ----------------------
  const onNext = async () => {
    const idVal = String(identifier || "").trim();
    setIdError("");
    setSecretError("");

    if (!idVal) {
      setIdError("Login ID is required.");
      return;
    }

    setPrechecking(true);
    try {
      const info = await precheckLogin(idVal); // { role, loginMode, employeeId, ... }
      const role = String(info?.role || "");
      const mode = String(info?.loginMode || "password");
      setRoleHint(role || "");
      setEmployeeIdHint(String(info?.employeeId || ""));
      setLoginMode(mode === "pin" ? "pin" : "password");
      setLoginStep("secret");
      setSecret("");
      setPinValue("");
      setShowSecret(false);

      // Some cashier flows may need to show “PIN not set” hint
      if (info?.loginMode === "pin" && info?.pinNotSet) {
        alert.info("PIN is not set yet. Please use the Cashier Setup / Ticket flow to set your PIN.");
      }
    } catch (err) {
      const status = err?.status ?? 0;
      const data = err?.data ?? {};
      const code = data?.code || "";

      if (status === 423) {
        const seconds = Number(data?.remaining_seconds || 0);

        setLockedIdKey(idKey(idVal));

        if (seconds > 0) {
          setLockPermanent(false);
          setLockUntilIso(new Date(Date.now() + seconds * 1000).toISOString());
          const m = Math.floor(seconds / 60), s = seconds % 60;
          alert.error(`Account temporarily locked. Try again in ${m}m ${s}s.`);
        } else {
          // permanent lock
          setLockPermanent(true);
          setLockUntilIso(null);
          setLockSecondsLeft(0);
          alert.error("Account locked. Please contact an Admin.");
        }
        return;
      }

      if (status === 404 || code === "UNKNOWN_IDENTIFIER") {
        setIdError("Invalid Login ID");
        return;
      }
      if (status === 403) {
        alert.error(err?.message || data?.error || "Not authorized.");
        return;
      }
      if (status === 0) {
        alert.error("Unable to reach server. Check your connection.");
        return;
      }
      alert.error(err?.message || data?.error || "Unable to continue.");
    } finally {
      setPrechecking(false);
    }
  };

  const onBackToId = () => {
    setLoginStep("id");
    setSecret("");
    setPinValue("");
    setSecretError("");
    setShowSecret(false);
    setRoleHint("");
    setEmployeeIdHint("");
    setLoginMode("password");
  };

// ----- PIN keypad handlers (Backoffice) -----
const handlePinDigit = (digit) => {
  if (submitting || prechecking || ticketSubmitting || isLockedForCurrentId) return;

  setPinValue((prev) => {
    if (prev.length >= PIN_LEN) return prev;
    const next = prev + String(digit);

    if (next.length === PIN_LEN) {
      setTimeout(() => {
        // If resetting PIN, do NOT submit login — drive reset stages
        if (pinResetMode) {
          if (pinResetStage === "new") {
            setPinResetFirst(next);
            setPinResetStage("confirm");
            setPinResetError("");
            setPinValue("");
            return;
          }

          // confirm
          if (next !== pinResetFirst) {
            setPinResetError("PINs do not match. Try again.");
            setPinResetStage("new");
            setPinResetFirst("");
            setPinValue("");
            return;
          }

          setPinValue("");
          submitNewPinConfirm(next);
          return;
        }

        // ✅ normal login (submit exact pin)
        setPinValue("");
        setSecret("");
        submitPinLogin(next);
      }, 120);
    }

    return next;
  });
};


const handlePinDelete = () => {
  if (submitting || prechecking || ticketSubmitting || isLockedForCurrentId) return;
  setPinValue((prev) => prev.slice(0, -1));
};

const handlePinBack = () => {
  if (submitting || prechecking || ticketSubmitting) return;

  if (pinResetMode) {
    // back inside reset flow
    if (pinResetStage === "confirm") {
      setPinResetStage("new");
      setPinResetFirst("");
      setPinResetError("");
      setPinValue("");
      return;
    }
    // stage "new" -> cancel reset mode
    cancelPinResetMode();
    return;
  }

  setPinValue("");
  setSecret("");
  onBackToId();
};

const openCashierTicket = () => {
  // Must already be in PIN login for cashier
  if (loginStep !== "secret" || loginMode !== "pin") return;

  if (!/cashier/i.test(String(roleHint || ""))) {
    alert.info("Reset Ticket is for Cashier PIN only.");
    return;
  }

  if (!String(employeeIdHint || "").trim()) {
    alert.error("Missing employee ID. Please re-enter your Login ID.");
    setLoginStep("id");
    return;
  }

  setCashierTicketCode("");
  setCashierTicketOpen(true);
};

const closeCashierTicket = () => {
  setCashierTicketOpen(false);
  setCashierTicketSubmitting(false);
};

const verifyCashierTicket = async (e) => {
  e.preventDefault();

  const empId = String(employeeIdHint || "").trim();
  const code = String(cashierTicketCode || "").trim();

  if (!/^\d{8}$/.test(code)) return alert.error("Ticket code must be 8 digits.");

  setCashierTicketSubmitting(true);
  try {
    // verify only (recommended). If you don't have this endpoint, you can skip verify and go straight to confirm later.
    const resp = await fetch(join("/api/auth/pin-reset/verify-ticket"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App": "backoffice" },
      credentials: "include",
      body: JSON.stringify({ employeeId: empId, ticket: code }),
    });
    const j = await safeJson(resp);
    if (!resp.ok) throw new Error(j?.error || "Invalid / expired ticket.");

    setCashierResetRequestId(j?.requestId ?? null);
    if (!j?.requestId) throw new Error("Missing requestId from server.");

    // ticket ok -> enter reset mode on the keypad
    setPinResetTicket(code);
    setPinResetMode(true);
    setPinResetStage("new");
    setPinResetFirst("");
    setPinResetError("");
    setPinValue(""); // clear dots
    closeCashierTicket();

    alert.success("Ticket verified. Enter your new PIN.");
  } catch (err) {
    alert.error(err?.message || "Unable to verify ticket.");
  } finally {
    setCashierTicketSubmitting(false);
  }
};

const cancelPinResetMode = () => {
  setPinResetMode(false);
  setPinResetStage("new");
  setPinResetFirst("");
  setPinResetError("");
  setPinResetTicket("");
  setCashierResetRequestId(null);
  setPinValue("");
  setSecret("");
  setCashierTicketOpen(false);
};

const submitNewPinConfirm = async (finalPin) => {
  if (ticketSubmitting) return;
  if (pinConfirmInFlightRef.current) return; // ✅ prevent double fire
  pinConfirmInFlightRef.current = true;

  const empId = String(employeeIdHint || "").trim();
  const ticket = String(pinResetTicket || "").trim();
  const reqId = String(cashierResetRequestId || "").trim();

  if (!empId) { pinConfirmInFlightRef.current = false; return alert.error("Missing employee ID."); }
  if (!/^\d{8}$/.test(ticket)) { pinConfirmInFlightRef.current = false; return alert.error("Missing / invalid ticket."); }
  if (!reqId) { pinConfirmInFlightRef.current = false; return alert.error("Missing reset requestId. Please verify ticket again."); }

  setTicketSubmitting(true);
  try {
    const resp = await fetch(join("/api/auth/pin-reset/confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App": "backoffice" },
      credentials: "include",
      body: JSON.stringify({ employeeId: empId, ticket, requestId: reqId, newPin: String(finalPin) }),
    });

    const j = await safeJson(resp);
    if (!resp.ok) {
      if (j.code === "TICKET_EXPIRED" || j.code === "TICKET_INVALID") {
        throw new Error(j.error || "Ticket expired or already used. Please ask Admin to issue a new one.");
      }
      throw new Error(j.error || "Unable to set PIN");
    }

    alert.success("PIN updated successfully! Enter your new PIN to sign in.");

    // ✅ do NOT let any old “full pin” still sit in state
    setPinValue("");
    setSecret("");
    setSecretError("");

    // ✅ exit reset mode cleanly (but don’t re-open ticket)
    setPinResetMode(false);
    setPinResetStage("new");
    setPinResetFirst("");
    setPinResetError("");
    setPinResetTicket("");
    setCashierResetRequestId(null);
    setCashierTicketOpen(false);

    setLoginStep("secret");
    setLoginMode("pin");
  } catch (err) {
    console.error("PIN reset error:", err);
    alert.error(err.message || "Unable to set PIN. Please try again.");

    // If ticket truly invalid, send them back to ticket dialog
    if (String(err.message || "").toLowerCase().includes("expired") || String(err.message || "").toLowerCase().includes("used")) {
      setPinResetMode(false);
      setPinResetStage("new");
      setPinResetFirst("");
      setPinResetError("Ticket expired/used. Please enter a new ticket.");
      setPinResetTicket("");
      setCashierTicketOpen(true);
    } else {
      // generic
      setPinResetMode(false);
      setPinResetStage("new");
      setPinResetFirst("");
      setPinResetError("");
      setPinResetTicket("");
      setCashierResetRequestId(null);
      setCashierTicketOpen(false);
      setPinValue("");
      setSecret("");
    }
  } finally {
    setTicketSubmitting(false);
    pinConfirmInFlightRef.current = false; // ✅ release guard
  }
};

  // ---------------------- Login: Submit (role-aware) ----------------------
  const onSubmit = async (e) => {
    e.preventDefault();

    // ✅ If we're in PIN reset mode, never submit login from the form
    if (loginMode === "pin" && pinResetMode) {
      return; // pin reset flow uses submitNewPinConfirm() only
    }

    // (optional but recommended) also avoid form-submit for PIN mode entirely
    if (loginMode === "pin") {
      return; // keypad calls submitPinLogin() when PIN is complete
    }

    const idVal = String(identifier || "").trim();
    const secVal = String(loginMode === "pin" ? pinValue : (secret || ""));

    if (!idVal) return setIdError("Login ID is required.");
    if (!secVal) return setSecretError(`${secretLabel} is required.`);

    setSubmitting(true);
    try {
      await login(idVal, secVal, { remember, loginMode });

      alert.success("Welcome back!");

      const from = loc.state?.from?.pathname;
      const role = roleHint || user?.role || "";
      const dest = resolvePostLoginDest(role, from);

      nav(dest, { replace: true });
    } catch (err) {
      const status = err?.status ?? err?.response?.status ?? 0;
      const data = err?.data ?? err?.response?.data ?? {};
      const code = data?.code || "";
      const msg = err?.message || data?.error || "Sign in failed";

      setIdError("");
      setSecretError("");

      if (status === 423) {
        const seconds = Number(data?.remaining_seconds || 0);

        setLockedIdKey(idKey(idVal));

        if (seconds > 0) {
          setLockPermanent(false);
          setLockUntilIso(new Date(Date.now() + seconds * 1000).toISOString());
          const m = Math.floor(seconds / 60), s = seconds % 60;
          alert.error(`Account temporarily locked. Try again in ${m}m ${s}s.`);
        } else {
          setLockPermanent(true);
          setLockUntilIso(null);
          setLockSecondsLeft(0);
          alert.error("Account locked. Please contact an Admin.");
        }
        return;
      } else if (status === 403) {
        alert.error(msg);
      } else if (status === 404 || code === "UNKNOWN_IDENTIFIER") {
        setIdError("Invalid Login ID");
        setLoginStep("id");
      } else if (status === 401) {
        setSecretError(loginMode === "pin" ? "Invalid PIN" : "Invalid Password");
      } else if (status === 400 && code === "PIN_NOT_SET") {
        alert.error(
          "PIN is not set yet. Use “Forgot Password / PIN” to set up using a Reset Ticket."
        );
      } else if (status === 0) {
        alert.error("Unable to reach server. Check your connection.");
      } else {
        alert.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

const submitPinLogin = async (finalPin) => {
  const idVal = String(identifier || "").trim();
  const secVal = String(finalPin || "").trim();

  if (!idVal) return setIdError("Login ID is required.");
  if (!secVal) return setSecretError("PIN is required.");

  // prevent double submits
  if (submitting) return;

  setSubmitting(true);
  try {
    await login(idVal, secVal, { remember, loginMode: "pin" });
    alert.success("Welcome back!");

    const from = loc.state?.from?.pathname;
    const role = roleHint || user?.role || "";
    const dest = resolvePostLoginDest(role, from);
    nav(dest, { replace: true });
  } catch (err) {
    const status = err?.status ?? err?.response?.status ?? 0;
    const data = err?.data ?? err?.response?.data ?? {};
    const code = data?.code || "";
    const msg = err?.message || data?.error || "Sign in failed";

    setIdError("");
    setSecretError("");

    if (status === 423) {
      const seconds = Number(data?.remaining_seconds || 0);
      setLockedIdKey(idKey(idVal));
      if (seconds > 0) {
        setLockPermanent(false);
        setLockUntilIso(new Date(Date.now() + seconds * 1000).toISOString());
        const m = Math.floor(seconds / 60), s = seconds % 60;
        alert.error(`Account temporarily locked. Try again in ${m}m ${s}s.`);
      } else {
        setLockPermanent(true);
        setLockUntilIso(null);
        setLockSecondsLeft(0);
        alert.error("Account locked. Please contact an Admin.");
      }
      return;
    }

    if (status === 401) {
      setSecretError("Invalid PIN");
      return;
    }
    if (status === 404 || code === "UNKNOWN_IDENTIFIER") {
      setIdError("Invalid Login ID");
      setLoginStep("id");
      return;
    }

    alert.error(msg);
  } finally {
    setSubmitting(false);
  }
};

  // ---------- Cooldown derived flags (PER EMAIL) ----------
  const normalizedFpEmail = fpEmail.trim().toLowerCase();
  const cooldownActive =
    !!otpCooldownUntil &&
    cooldownLeft > 0 &&
    !!normalizedFpEmail &&
    normalizedFpEmail === cooldownEmail;

  // ---------- Forgot dialog open/close ----------
  const resetForgotState = () => {
    setFpStep("identify");
    setFpIdentifier("");
    setFpRole("");
    setFpEmployeeId("");
    setFpLoginMode("password");
    setFpIdentifyError("");
    setTicketActive(false);
    setTicketExpiresAt("");
    setTicketCreatedAt("");
    setTicketRequestId(null);
    setTicketCode("");
    setNewPin("");
    setConfirmPin("");

    // admin forgot state reset (safe defaults)
    setFpEmail("");
    setFpEmailError("");
    setResetToken("");
    setNewPw("");
    setConfirmPw("");
    setOtpValues(["", "", "", "", "", ""]);
    setSqIdentifier("");
    setSqError("");
    setSqToken("");
    setSqSelectedId(SQ_CATALOG[0].id);
    setSqAnswer("");
  };

  const onOpenForgot = () => {
    // Safety: Forgot Password is Admin-only
    if (String(roleHint || "").toLowerCase() === "cashier") {
      alert.info("Cashier accounts don’t use Forgot Password. Please use Cashier Setup / PIN flow.");
      return;
    }

    setForgotOpen(true);
    resetForgotState();

    // Prefill identifier if user already typed it
    if (String(identifier || "").trim()) setFpIdentifier(String(identifier || "").trim());
  };

  const onCloseForgot = () => {
    setForgotOpen(false);
    setTimeout(() => resetForgotState(), 250);
  };

  // ---------- Forgot: identify (role-aware precheck) ----------
  const onForgotIdentifyNext = async (e) => {
    e.preventDefault();
    setFpIdentifyError("");
    const idVal = String(fpIdentifier || "").trim();
    if (!idVal) {
      setFpIdentifyError("Login ID is required.");
      return;
    }

    setFpIdentifySubmitting(true);
    try {
      const info = await precheckLogin(idVal);
      const role = String(info?.role || "");
      const mode = String(info?.loginMode || "password");
      const empId = String(info?.employeeId || "");

      setFpRole(role);
      setFpEmployeeId(empId);
      setFpLoginMode(mode === "pin" ? "pin" : "password");

      if (/cashier/i.test(role) || mode === "pin") {
        setFpIdentifyError("Cashier accounts don’t use Forgot Password. Please use Cashier Setup / PIN flow.");
        return;
      }

      setFpStep("choose-admin");
    } catch (err) {
      const status = err?.status ?? 0;
      const data = err?.data ?? {};
      const code = data?.code || "";

      if (status === 404 || code === "UNKNOWN_IDENTIFIER") {
        setFpIdentifyError("Invalid Login ID");
      } else if (status === 0) {
        setFpIdentifyError("Unable to reach server. Check your connection.");
      } else {
        setFpIdentifyError(err?.message || data?.error || "Unable to continue.");
      }
    } finally {
      setFpIdentifySubmitting(false);
    }
  };

  async function loadActiveTicket(employeeId) {
    try {
      const resp = await fetch(
        join(`/api/users/${encodeURIComponent(employeeId)}/pin-reset-ticket/active`),
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { "X-App": "backoffice" },
        }
      );
      const j = await safeJson(resp);
      if (!resp.ok) {
        setTicketActive(false);
        setTicketExpiresAt("");
        setTicketCreatedAt("");
        setTicketRequestId(null);
        return;
      }

      const active = !!j?.active;
      setTicketActive(active);
      setTicketExpiresAt(j?.expiresAt || "");
      setTicketCreatedAt(j?.createdAt || "");
      setTicketRequestId(j?.requestId ?? null);
    } catch {
      setTicketActive(false);
      setTicketExpiresAt("");
      setTicketCreatedAt("");
      setTicketRequestId(null);
    }
  }

  const pinOk =
    /^\d{4,8}$/.test(String(newPin || "")) &&
    String(newPin) === String(confirmPin);

  const onTicketSubmit = async (e) => {
    e.preventDefault();
    const empId = String(fpEmployeeId || "").trim();
    const code = String(ticketCode || "").trim();
    if (!empId) return alert.error("Missing employeeId.");
    if (!/^\d{8}$/.test(code)) return alert.error("Ticket code must be 8 digits.");
    if (!/^\d{4,8}$/.test(String(newPin || "")))
      return alert.error("PIN must be 4–8 digits.");
    if (String(newPin) !== String(confirmPin))
      return alert.error("PINs do not match.");

    setTicketSubmitting(true);
    try {
      const resp = await fetch(join("/api/auth/pin-reset/confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
        credentials: "include",
        body: JSON.stringify({
          employeeId: empId,
          ticket: code,
          newPin: String(newPin),
        }),
      });
      const j = await safeJson(resp);
      if (!resp.ok) throw new Error(j?.error || resp.statusText || "Unable to set PIN");

      alert.success("PIN updated. You can now sign in.");
      onCloseForgot();
    } catch (err) {
      alert.error(err?.message || "Unable to set PIN.");
      // refresh ticket status in case it was used/expired
      if (fpEmployeeId) loadActiveTicket(fpEmployeeId);
    } finally {
      setTicketSubmitting(false);
    }
  };

  // ---------- Forgot (Admin): step navigation ----------
  const goChooseAdmin = () => setFpStep("choose-admin");
  const goEmail = () => {
    setFpStep("email");
    if (cooldownActive) setFpEmailError(COOLDOWN_MESSAGE);
    else setFpEmailError("");
  };
  const goOtp = () => setFpStep("otp");
  const goReset = () => setFpStep("reset");
  const goSqIdentify = () => setFpStep("sq-identify");
  const goSqAnswers = () => setFpStep("sq-answers");
  const goIdentify = () => setFpStep("identify");

  // ---------- Forgot (Admin): choose handlers ----------
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

  // ---------- Forgot (Admin): email verify submit (OTP path) ----------
  const DUP_RE = /duplicate entry/i;

  const onEmailVerifySubmit = async (e) => {
    e.preventDefault();
    setFpEmailError("");

    const email = normalizedFpEmail;
    if (!email) {
      setFpEmailError("Email is required.");
      return;
    }

    if (
      otpCooldownUntil &&
      new Date(otpCooldownUntil).getTime() > nowMs() &&
      email === cooldownEmail
    ) {
      setFpEmailError(COOLDOWN_MESSAGE);
      return;
    }

    setFpEmailSubmitting(true);
    try {
      const resp = await fetch(join("/api/auth/forgot/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      const j = await safeJson(resp);

      if (resp.status === 429) {
        if (j?.expiresAt) {
          setOtpCooldownUntil(j.expiresAt);
          setCooldownEmail(email);
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
        setCooldownEmail(email);
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
    if (
      otpCooldownUntil &&
      new Date(otpCooldownUntil).getTime() > nowMs() &&
      normalizedFpEmail === cooldownEmail
    ) {
      return alert.info(COOLDOWN_MESSAGE);
    }

    try {
      const resp = await fetch(join("/api/auth/forgot/resend"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedFpEmail }),
      });
      const j = await safeJson(resp);

      if (resp.status === 429) {
        if (j?.expiresAt) {
          setOtpCooldownUntil(j.expiresAt);
          setCooldownEmail(normalizedFpEmail);
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
        setCooldownEmail(normalizedFpEmail);
      }
      alert.info("A new code has been sent.");
    } catch (err) {
      alert.error(err?.message || "Resend failed.");
    }
  };

  // ---------- OTP helpers ----------
  const onChangeOtp = (index, value) => {
    const val = value.replace(/\D/g, "").slice(0, 1);
    setOtpValues((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
    if (val && index < 5 && otpRefs.current[index + 1])
      otpRefs.current[index + 1].focus();
  };

  const onKeyDownOtp = (index, e) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) {
      e.preventDefault();
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      otpRefs.current[index + 1]?.focus();
    }
  };

  const otpCode = useMemo(() => otpValues.join(""), [otpValues]);

  const onOtpSubmit = async (e) => {
    e.preventDefault();
    if (otpCode.length !== 6) return alert.error("Please enter the 6-digit code.");
    setOtpSubmitting(true);
    try {
      const resp = await fetch(join("/api/auth/forgot/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedFpEmail, code: otpCode }),
      });
      const j = await safeJson(resp);
      if (!resp.ok) {
        const code = j?.code;
        if (code === "OTP_INVALID")
          throw new Error("Invalid code. Please check and try again.");
        if (code === "OTP_EXPIRED")
          throw new Error("This code has expired. Please request a new one.");
        if (code === "OTP_NOT_FOUND")
          throw new Error("No active verification code. Please request a new one.");
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

  // ---------- Security Questions (Admin): start ----------
  const onSqStart = async (e) => {
    e.preventDefault();
    setSqError("");
    const id = (sqIdentifier || "").trim();
    if (!id) {
      setSqError("Please enter your email / username / employee ID.");
      return;
    }

    setSqLoading(true);
    try {
      const resp = await fetch(join("/api/auth/forgot/sq/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
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

  // ---------- Security Questions (Admin): verify ----------
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
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
        credentials: "include",
        body: JSON.stringify({ sqToken, answers: answerPayload }),
      });
      const j = await safeJson(resp);

      if (!resp.ok) {
        if (resp.status === 423) {
          const secs = Number(j?.remaining_seconds || 900);
          const idKeyVal = sqIdentifier.trim().toLowerCase();
          setSqLockedIdKey(idKeyVal);
          setSqLockUntilIso(new Date(Date.now() + secs * 1000).toISOString());
          throw new Error(
            "Too many incorrect answers. Please wait 15 minutes before trying again."
          );
        }
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

  // ---------- Reset password (Admin) ----------
  const rules = ruleChecks(newPw);
  const pwScore = scorePassword(newPw);
  const rulesPass =
    rules.len8 && rules.num && rules.lower && rules.upper && rules.special;
  const confirmPass = newPw && confirmPw && newPw === confirmPw;

  const onResetSubmit = async (e) => {
    e.preventDefault();
    if (!resetToken) return alert.error("Missing reset token.");
    if (!PW_REGEX_ENFORCE.test(newPw)) {
      return alert.error(
        "Password must be 8+ chars with 1 number, 1 lowercase, 1 uppercase, and 1 special character."
      );
    }
    if (newPw !== confirmPw) return alert.error("Passwords do not match.");

    setResetSubmitting(true);
    try {
      const resp = await fetch(join("/api/auth/forgot/reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App": "backoffice" },
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

  // Keep the effect that explains disabled state while on email step
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
            background: (theme) =>
              `linear-gradient(180deg,
              ${alpha(theme.palette.primary.main, 0.18)} 0%,
              ${alpha(theme.palette.primary.main, 0.10)} 60%,
              ${alpha(theme.palette.primary.main, 0.06)} 100%)`,
          }}
        >
          <Typography
            variant="h5"
            align="center"
            sx={{
              fontWeight: 800,
              letterSpacing: 0.2,
              fontSize: { xs: 20, sm: 22, md: 24 },
            }}
          >
            Sign in
          </Typography>

          <Typography
            variant="body2"
            align="center"
            color="text.secondary"
            sx={{ mt: 0.5, fontSize: { xs: 12.5, sm: 13 } }}
          >
            Quscina Login (Admin / Cashier)
          </Typography>

          {loginStep === "secret" && (
            <Typography
              variant="caption"
              align="center"
              color="text.secondary"
              sx={{ display: "block", mt: 0.75 }}
            >
              {roleHint
                ? `Signing in as: ${roleHint} (${loginMode === "pin" ? "PIN" : "Password"})`
                : `Signing in (${loginMode === "pin" ? "PIN" : "Password"})`}
            </Typography>
          )}
        </Box>

        <Divider />

        {/* Form */}
        <Box component="form" onSubmit={onSubmit} noValidate sx={{ p: { xs: 2.5, sm: 3, md: 4 } }}>
          <Stack spacing={{ xs: 1.75, sm: 2, md: 2.25 }}>
            <TextField
              name="identifier"
              label="Login ID"
              value={identifier}
              onChange={(e) => {
                const nextVal = e.target.value;
                const prevKey = idKey(identifier);
                const nextKey = idKey(nextVal);

                setIdentifier(nextVal);
                setIdError("");

                // If switching to a DIFFERENT id, clear lock UI
                if (nextKey !== prevKey) {
                  setLockUntilIso(null);
                  setLockSecondsLeft(0);
                  setLockPermanent(false);
                  setLockedIdKey(null);
                }

                if (loginStep === "secret") {
                  setLoginStep("id");
                  setRoleHint("");
                  setEmployeeIdHint("");
                  setLoginMode("password");
                  setSecret("");
                  setPinValue("");
                }
              }}
              autoComplete="username"
              required
              fullWidth
              placeholder="Employee ID / Username / Email"
              error={!!idError}
              helperText={idError || " "}
              disabled={submitting || prechecking}
            />

            {loginStep === "secret" && loginMode === "password" && (
              <TextField
                name="secret"
                label={secretLabel}
                type={showSecret ? "text" : "password"}
                value={secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setSecretError("");
                }}
                autoComplete={secretAutoComplete}
                required
                fullWidth
                error={!!secretError}
                helperText={secretError || " "}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowSecret((v) => !v)}
                          edge="end"
                          disabled={submitting}
                        >
                          {showSecret ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}

            {loginStep === "secret" && loginMode === "pin" && (
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    {pinResetMode
                      ? pinResetStage === "new"
                        ? "Set New PIN"
                        : "Confirm New PIN"
                      : "Enter PIN"}
                  </Typography>
                </Stack>

                {!!pinResetError && (
                  <Typography color="error" variant="body2" sx={{ textAlign: "center", mb: 1 }}>
                    {pinResetError}
                  </Typography>
                )}

                {/* Dots */}
                <Box sx={{ display: "flex", justifyContent: "center", gap: 1.25, mb: 2 }}>
                  {pinSlots.map((k, i) => (
                    <Box
                      key={k}
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 18,
                        lineHeight: 1,
                        color: "text.primary",
                      }}
                    >
                      {i < pinValue.length ? "•" : "○"}
                    </Box>
                  ))}
                </Box>

                {!!secretError && (
                  <Typography color="error" variant="body2" sx={{ textAlign: "center", mb: 1 }}>
                    {secretError}
                  </Typography>
                )}

                {/* Keypad */}
                <Box sx={{ maxWidth: 320, mx: "auto" }}>
                  {[
                    [1, 2, 3],
                    [4, 5, 6],
                    [7, 8, 9],
                    ["Back", 0, "<"],
                  ].map((row, ri) => (
                    <Box key={`row-${ri}`} sx={{ display: "flex", gap: 1, mb: 1 }}>
                      {row.map((key) => (
                        <Button
                          type="button"
                          key={`k-${key}`}
                          variant="contained"
                          fullWidth
                          disabled={
                            ticketSubmitting ||
                            submitting ||
                            prechecking ||
                            (key !== "Back" && isLockedForCurrentId) ||
                            (key === "Back" && pinResetMode)
                          }
                          onClick={() => {
                            if (key === "Back") {
                              if (pinResetMode) return;
                              handlePinBack();
                              return;
                            }
                            if (key === "<") return handlePinDelete();
                            handlePinDigit(key);
                          }}
                          sx={{
                            py: 1.4,
                            fontSize: 16,
                            textTransform: "none",
                            borderRadius: 2,
                            fontWeight: 700,
                          }}
                        >
                          {key}
                        </Button>
                      ))}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {loginStep === "secret" && !isPinResetUi && (
              <FormControlLabel
                sx={{ ml: 0 }}
                control={
                  <Switch
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={submitting || prechecking}
                  />
                }
                label="Remember me"
              />
            )}

            {loginStep === "id" ? (
              <Button
                type="button"
                variant="contained"
                size="large"
                fullWidth
                onClick={onNext}
                disabled={prechecking || submitting || isLockedForCurrentId}
              >
                {isLockedForCurrentId
                  ? (lockPermanent ? "Locked" : `Locked: ${fmtMMSS(lockSecondsLeft)}`)
                  : prechecking
                  ? "Checking..."
                  : "Next"}
              </Button>
            ) : isPinResetUi ? null : (   // ✅ HIDE ALL ACTION BUTTONS during pin reset
              (() => {
                const isCashier = /cashier/i.test(String(roleHint || ""));
                const hideBackBesideSignIn = isCashier && loginMode === "pin"; // cashier pin keypad already has "Back"

                if (hideBackBesideSignIn) {
                  return (
                    <Button
                      type={loginMode === "pin" ? "button" : "submit"}
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={submitting || isLockedForCurrentId}
                    >
                      {isLockedForCurrentId
                        ? lockPermanent
                          ? "Locked"
                          : `Locked: ${fmtMMSS(lockSecondsLeft)}`
                        : submitting
                        ? "Signing in..."
                        : "Sign In"}
                    </Button>
                  );
                }

                return (
                  <Stack direction="row" spacing={1.5}>
                    <Button
                      type="button"
                      variant="outlined"
                      onClick={onBackToId}
                      disabled={submitting || prechecking}
                      sx={{ minWidth: 110 }}
                    >
                      Back
                    </Button>

                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={submitting || isLockedForCurrentId}
                    >
                      {isLockedForCurrentId
                        ? lockPermanent
                          ? "Locked"
                          : `Locked: ${fmtMMSS(lockSecondsLeft)}`
                        : submitting
                        ? "Signing in..."
                        : "Sign In"}
                    </Button>
                  </Stack>
                );
              })()
            )}

            {isLockedForCurrentId && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }} aria-live="polite">
                {lockPermanent
                  ? "This account is locked. Please contact an Admin or sign in with a different account."
                  : `This account is locked. Please wait ${fmtMMSS(lockSecondsLeft)} or sign in with a different account.`}
              </Typography>
            )}

            {/* Show Forgot Password ONLY after Next (secret step) AND ONLY for Admin */}
            {loginStep === "secret" && String(roleHint || "") === "Admin" && loginMode === "password" && (
              <>
                <Divider sx={{ my: { xs: 0, sm: 0.5 } }}>or</Divider>

                <Button
                  onClick={onOpenForgot}
                  variant="outlined"
                  size="large"
                  fullWidth
                  disabled={submitting || prechecking}
                >
                  Forgot Password
                </Button>
              </>
            )}

            {/* Show Reset Ticket ONLY after Next (secret step) AND ONLY for Cashier PIN */}
            {loginStep === "secret" &&
              /cashier/i.test(String(roleHint || "")) &&
              loginMode === "pin" &&
              !pinResetMode && ( // don’t show while already resetting
                <>
                  <Divider sx={{ my: { xs: 0, sm: 0.5 } }}>or</Divider>

                  <Button
                    onClick={openCashierTicket}
                    variant="outlined"
                    size="large"
                    fullWidth
                    disabled={submitting || prechecking || ticketSubmitting || isLockedForCurrentId}
                  >
                    Use Reset Ticket
                  </Button>
                </>
              )}
          </Stack>
        </Box>
      </Paper>
      
      {/* ---- Cashier Reset Ticket Dialog (PIN reset entry) ---- */}
      <Dialog open={cashierTicketOpen} onClose={closeCashierTicket} maxWidth="xs" fullWidth>
        <Box component="form" onSubmit={verifyCashierTicket} noValidate>
          <Box sx={{ p: 2.25 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Enter Reset Ticket
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Enter the 8-digit ticket issued by Admin to reset your PIN.
            </Typography>

            <TextField
              sx={{ mt: 2 }}
              label="Reset Ticket Code (8 digits)"
              value={cashierTicketCode}
              onChange={(e) => setCashierTicketCode(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
              fullWidth
              required
              placeholder="12345678"
              slotProps={{ input: { inputMode: "numeric" } }}
            />

            <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
              <Button onClick={closeCashierTicket} variant="text" disabled={cashierTicketSubmitting}>
                Cancel
              </Button>
              <Box sx={{ flex: 1 }} />
              <Button type="submit" variant="contained" disabled={cashierTicketSubmitting}>
                {cashierTicketSubmitting ? <CircularProgress size={22} /> : "Verify"}
              </Button>
            </Stack>
          </Box>
        </Box>
      </Dialog>

      {/* ---------- Forgot Password/PIN Dialog ---------- */}
      <Dialog fullScreen open={forgotOpen} onClose={onCloseForgot} TransitionComponent={Transition}>
        <AppBar sx={{ position: "relative" }} elevation={0} color="default">
          <Toolbar>
            {fpStep !== "identify" ? (
              <IconButton
                edge="start"
                onClick={() => {
                  // basic back behavior:
                  if (fpStep === "choose-admin") return goIdentify();
                  if (fpStep === "email" || fpStep === "sq-identify") return goChooseAdmin();
                  if (fpStep === "otp") return goEmail();
                  if (fpStep === "sq-answers") return goSqIdentify();
                  if (fpStep === "reset") return goChooseAdmin();
                  return goIdentify();
                }}
                aria-label="back"
              >
                <ArrowBackIcon />
              </IconButton>
            ) : null}

            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              Forgot Password
            </Typography>
            <IconButton edge="end" onClick={onCloseForgot} aria-label="close">
              <CloseIcon />
            </IconButton>
          </Toolbar>
        </AppBar>

        <Box sx={{ p: { xs: 3, sm: 4 }, maxWidth: 720, mx: "auto", width: "100%" }}>
          {/* Identify */}
          {fpStep === "identify" && (
            <Box component="form" onSubmit={onForgotIdentifyNext} noValidate sx={{ mt: 1 }}>
              <Stack spacing={2.25}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  Find your account
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Enter your <strong>Login ID</strong> so we can show the correct recovery method.
                </Typography>

                <TextField
                  label="Login ID"
                  value={fpIdentifier}
                  onChange={(e) => {
                    setFpIdentifier(e.target.value);
                    setFpIdentifyError("");
                  }}
                  fullWidth
                  required
                  placeholder="Employee ID / Username / Email"
                />

                {!!fpIdentifyError && (
                  <Typography color="error" variant="body2">
                    {fpIdentifyError}
                  </Typography>
                )}

                <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                  <Button onClick={onCloseForgot} variant="text" disabled={fpIdentifySubmitting}>
                    Cancel
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={fpIdentifySubmitting}>
                    {fpIdentifySubmitting ? <CircularProgress size={22} /> : "Next"}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}

          {/* Admin choose */}
          {fpStep === "choose-admin" && (
            <Stack spacing={3}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Choose a recovery method
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Account detected as <strong>{fpRole || "Admin"}</strong>.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button variant="contained" size="large" onClick={onChooseEmailOtp} sx={{ flex: 1 }}>
                  Email OTP
                </Button>
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
                    if (fpEmailError && fpEmailError !== COOLDOWN_MESSAGE) setFpEmailError("");
                  }}
                  placeholder="e.g. admin@domain.com"
                  fullWidth
                  required
                />

                {!!fpEmailError && (
                  <Typography color="error" variant="body2">
                    {fpEmailError}
                  </Typography>
                )}

                <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                  <Button onClick={goChooseAdmin} variant="text" disabled={fpEmailSubmitting}>
                    Back
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={fpEmailSubmitting || cooldownActive}>
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
                  <Button onClick={goEmail} variant="text" disabled={otpSubmitting}>
                    Back
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={otpSubmitting}>
                    {otpSubmitting ? "Verifying..." : "Verify Code"}
                  </Button>
                </Stack>

                <Button variant="text" disabled={otpSubmitting || cooldownActive} onClick={onResend}>
                  {cooldownActive ? "Resend code (after cooldown)" : "Resend code"}
                </Button>
              </Stack>
            </Box>
          )}

          {/* Security Questions — Identify */}
          {fpStep === "sq-identify" && (
            <Box component="form" onSubmit={onSqStart} noValidate sx={{ mt: 1 }}>
              <Stack spacing={2.25}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Verify using security questions
                </Typography>
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
                  <Button onClick={goChooseAdmin} variant="text" disabled={sqLoading}>
                    Back
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={sqLoading || sqLockSecondsLeft > 0}>
                    {sqLockSecondsLeft > 0
                      ? `Locked: ${fmtMMSS(sqLockSecondsLeft)}`
                      : sqLoading
                      ? <CircularProgress size={22} />
                      : "Verify Answer"}
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

          {/* Reset Password (Admin) */}
          {fpStep === "reset" && (
            <Box component="form" onSubmit={onResetSubmit} noValidate sx={{ mt: 1 }}>
              <Stack spacing={2.25}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Set a new password
                </Typography>

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
                  <Button onClick={() => setFpStep("choose-admin")} variant="text" disabled={resetSubmitting}>
                    Back
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button type="submit" variant="contained" disabled={resetSubmitting || !rulesPass || !confirmPass}>
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