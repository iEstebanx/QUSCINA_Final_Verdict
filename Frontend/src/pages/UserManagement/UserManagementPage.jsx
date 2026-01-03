// QUSCINA_BACKOFFICE/src/pages/UserManagement/UserManagementPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Paper, Stack, Button, IconButton, TextField, InputAdornment,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Select, FormControl, InputLabel, Tooltip, Switch,
  LinearProgress, Grid, Divider, CircularProgress, TableContainer,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import { Avatar } from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";

// 🔗 services
import {
  subscribeUsers,
  createUser,
  updateUser,
  deleteUser,
  unlockUser,
  createPinResetTicket,
  revokePinResetTicket,
  getActivePinResetTicket,
} from "@/services/Users/users";

import { useAlert } from "@/context/Snackbar/AlertContext";
import { useConfirm } from "@/context/Cancel&ConfirmDialog/ConfirmContext";

const ROLE_OPTIONS = ["Admin", "Cashier"];

// Same catalog as backend/auth
const SQ_CATALOG = {
  pet: "What is the name of your first pet?",
  school: "What is the name of your elementary school?",
  city: "In what city were you born?",
  mother_maiden: "What is your mother’s maiden name?",
  nickname: "What was your childhood nickname?",
};

const emailRe =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const rtTypographySx = {
  "& .rt-desc": { fontSize: 14.5, lineHeight: 1.35 },     // top description
  "& .rt-name": { fontSize: 15.5, fontWeight: 600, letterSpacing: 0.2 },     // name
  "& .rt-meta": { fontSize: 14, lineHeight: 1.35 },       // EmployeeID/Username/Email lines
  "& .rt-label": { fontSize: 14, fontWeight: 700 },       // "Ticket Code" label
  "& .rt-note": { fontSize: 13.5, lineHeight: 1.35 },     // footnotes
};

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

// ——— util: format Firestore Timestamp | string | Date
function formatLastChanged(val) {
  try {
    if (!val || val === "—") return "—";
    let d = val;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (typeof val === "string") d = new Date(val);
    const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
    return fmt.format(d);
  } catch {
    return "—";
  }
}

function sanitizePhotoUrl(url) {
  if (!url) return "";
  // Don't ever trust blob:/file: URLs from backend; they are origin-bound and transient
  if (url.startsWith("blob:") || url.startsWith("file:")) return "";
  return url;
}

function isLockedForDisplay(row) {
  if (!row) return false;

  const now = Date.now();
  const LOCK_THRESHOLD = 3;

  const isLockedState = (s) => {
    if (!s) return false;
    const perm = !!s.permanentLock;
    const temp = s.lockUntil ? new Date(s.lockUntil).getTime() > now : false;
    const fail = Number(s.failedLoginCount || 0) >= LOCK_THRESHOLD;
    return perm || temp || fail;
  };

  const role = row.role;
  const states = row.lockStates || {};

  // Helper for legacy/global lock when no per-app state exists
  const legacyLocked = (() => {
    const legacyTemp = row.lockUntil
      ? new Date(row.lockUntil).getTime() > now
      : false;
    const legacyPerm = !!row.permanentLock;
    const legacyFail = Number(row.failedLoginCount || 0) >= LOCK_THRESHOLD;
    return legacyTemp || legacyPerm || legacyFail;
  })();

  // Admin = Backoffice lock
  if (role === "Admin") {
    if (states.backoffice) {
      return isLockedState(states.backoffice);
    }
    // fallback to legacy if no per-app record
    return legacyLocked;
  }

  // Cashier = Cashier-POS lock
  if (role === "Cashier") {
    if (states.backoffice) {
      return isLockedState(states.backoffice);
    }
    return legacyLocked;
  }

  // Other roles (if any) – no lock-based override
  return false;
}

export default function UserManagementPage() {
  const alert = useAlert();
  const confirm = useConfirm();

  const [rows, setRows] = useState([]);

  const [photoFile, setPhotoFile] = useState(null);

  // snapshots to compare for dirty checks
  const initialMainRef = useRef(null);    // pristine state for main dialog
  const initialSqRef = useRef(null);      // pristine state for SQ sub-dialog
  const initialPwRef = useRef(null);      // pristine state for PW sub-dialog

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [open, setOpen] = useState(false);

  // === Reset Ticket (POS PIN) dialog state ===
  const [rtOpen, setRtOpen] = useState(false);

  // split loading states
  const [rtChecking, setRtChecking] = useState(false);
  const [rtGenerating, setRtGenerating] = useState(false);

  const [rtError, setRtError] = useState("");
  const [rtData, setRtData] = useState(null); // { token, expiresAt, requestId }

  async function openResetTicketDialog() {
    if (form.role !== "Cashier") return;
    if (!isEditingExisting) {
      alert.info("Create the user first before generating a reset ticket.");
      return;
    }

    setRtError("");
    setRtData(null);
    setRtChecking(true);
    setRtOpen(true);

    try {
      const meta = await getActivePinResetTicket(form.employeeId);
      if (meta?.active) {
        setRtData({
          requestId: meta.requestId,
          expiresAt: meta.expiresAt,
          token: "",
          __metaOnly: true,
        });
      } else {
        setRtData(null);
      }
    } catch (e) {
      setRtError(e?.message || "Failed to check active ticket.");
    } finally {
      setRtChecking(false);
    }
  }

  async function handleRevokeTicket() {
    const reqId = rtData?.requestId;
    if (!reqId) return;

    const ok = await confirm({
      title: "Revoke ticket?",
      content: "This invalidates the ticket immediately.",
      confirmLabel: "Revoke",
      confirmColor: "error",
    });
    if (!ok) return;

    try {
      setRtGenerating(true);
      await revokePinResetTicket(form.employeeId, reqId);
      setRtData(null);
      alert.success("Ticket revoked.");
    } catch (e) {
      alert.error(e?.message || "Failed to revoke.");
    } finally {
      setRtGenerating(false);
    }
  }

  function isTicketActive(d) {
    if (!d?.expiresAt) return false;
    return new Date(d.expiresAt).getTime() > Date.now();
  }

  // === Password sub-dialog state ===
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [pwShow, setPwShow] = useState({ current: false, next: false, confirm: false });
  const [pwFields, setPwFields] = useState({ current: "", next: "", confirm: "" });

  const [pwErrors, setPwErrors] = useState({
    current: "",
    next: "",
    confirm: ""
  });

  const [pwSaving, setPwSaving] = useState(false);

  // === Security Questions sub-dialog state ===
  const [sqDialogOpen, setSqDialogOpen] = useState(false);
  const [sqFields, setSqFields] = useState([
    { id: "", answer: "" },
  ]);
  const [sqError, setSqError] = useState("");
  const [sqSaving, setSqSaving] = useState(false); // ⬅️ new: saving state for sub-dialog
  // For create flow only, remember that user staged SQs
  const [sqTouched, setSqTouched] = useState(false);

  // === PIN sub-dialog state ===
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState("set"); // "set" | "change"
  const [pinVisibility, setPinVisibility] = useState({
    next: false,
    confirm: false,
  });
  const [pinError, setPinError] = useState("");
  const [pinFields, setPinFields] = useState({
    newDigits: Array(6).fill(""),
    confirmDigits: Array(6).fill(""),
  });

  // refs for the 6-digit inputs in the PIN dialog
  const pinNextRefs = Array.from({ length: 6 }).map(() => useRef(null));
  const pinConfirmRefs = Array.from({ length: 6 }).map(() => useRef(null));

  useEffect(() => {
    const unsub = subscribeUsers(
      ({ rows }) => setRows(rows),
      {
        intervalMs: 5000,
        onError: (msg) => alert.error(`Users list error: ${msg}`),
      }
    );
    return () => unsub();
  }, []);

  const [form, setForm] = useState(makeBlank([]));
  const [errors, setErrors] = useState({});

  // 👉 Role-based requirements
  const needsPassword = form.role === "Admin" || form.role === "Manager";
  const needsPin = form.role === "Cashier";

  const isEditingExisting = useMemo(() => {
    return rows.some((r) => String(r.employeeId) === String(form.employeeId));
  }, [rows, form.employeeId]);

  // near your render (inside component)
  const isNewUser = !isEditingExisting;

  // ── Delete guards ─────────────────────────────
  const adminCount = useMemo(
    () => rows.filter(r => String(r.role).trim() === "Admin").length,
    [rows]
  );

  const isLastAdmin =
    isEditingExisting &&
    String(form.role).trim() === "Admin" &&
    adminCount <= 1;

  // already existing
  const isOnlyRemaining = rows.length <= 1;

  // final delete state
  const deleteDisabled = isOnlyRemaining || isLastAdmin;

  // Show Credentials section only if it will contain at least one row
  const showCredentialsSection =
    needsPassword ||
    (form.role !== "Cashier") ||
    (form.role === "Cashier" && isEditingExisting);

  useEffect(() => {
    setErrors((prev) => ({
      ...prev,
      password: undefined,
      pin: undefined,
    }));
  }, [form.role]);

  function nextEmployeeId(allRows) {
    const year = new Date().getFullYear();
    const prefix = String(year);                   // "2025"
    const nums = allRows
      .map(r => String(r.employeeId))
      .filter(id => /^\d{9}$/.test(id) && id.startsWith(prefix))
      .map(id => Number(id));

    const base = Number(`${prefix}00000`);         // 202500000
    const max  = nums.length ? Math.max(...nums) : base;
    const next = String(max + 1);                  // 202500001, 202500002, ...
    return next.padStart(9, "0");
  }

  function makeBlank(allRows) {
    return {
      employeeId: nextEmployeeId(allRows),
      username: "",
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      role: "",
      status: "Active",
      password: "",                  // <- staged here by password dialog
      passwordLastChanged: "—",
      pinDigits: ["", "", "", "", "", ""],
      loginVia: { employeeId: true, username: true, email: true },
      photoUrl: "",
      // staged SQ entries for display only
      securityQuestions: [],
    };
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        String(r.employeeId).toLowerCase().includes(q) ||
        (r.username || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.firstName || "").toLowerCase().includes(q) ||
        (r.lastName || "").toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q) ||
        (r.role || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const start = (page - 1) * rowsPerPage;
  const slice = filtered.slice(start, start + rowsPerPage);

  // Grid layout for tall dialogs: header | scrollable content | footer
  const dialogPaperGrid = {
    sx: {
      display: "grid",
      gridTemplateRows: "auto minmax(0,1fr) auto",
      maxHeight: { xs: "calc(100vh - 24px)", sm: "calc(100vh - 48px)" },
      overflow: "hidden",
    },
  };

  const openDialogFor = (row) => {
    setCreateResult(null);
    if (row) {
      // prefill SQ ids (without exposing hashes)
      const existingSQ = Array.isArray(row.securityQuestions) ? row.securityQuestions : [];
      const sqStage = existingSQ.slice(0, 1).map(q => ({id: q.id || "", answer: "",}));
      while (sqStage.length < 1) sqStage.push({ id: "", answer: "" });

      setForm({
        photoUrl: row.photoUrl || "",
        employeeId: String(row.employeeId),
        username: row.username || "",
        email: row.email || "",
        firstName: row.firstName || "",
        lastName: row.lastName || "",
        phone: row.phone || "",
        role: row.role || "",
        status: row.status || "Active",
        password: "",
        passwordLastChanged: row.passwordLastChanged || "—",
        pinDigits: Array(6).fill(""),
        loginVia: { ...(row.loginVia || { employeeId: true, username: true, email: true }) },
        securityQuestions: existingSQ, // for display count
      });

      setSqFields(sqStage);
    } else {
      const blank = makeBlank(rows);
      setForm(blank);
      setSqFields([
        { id: "", answer: "" },
      ]);
    }
    setErrors({});
    setPwDialogOpen(false);
    setPwFields({ current: "", next: "", confirm: "" });
    setPwErrors({ current: "", next: "", confirm: "" });
    setSqDialogOpen(false);
    setSqError("");
    setSqSaving(false);
    setSqTouched(false);

    // reset PIN dialog staging
    setPinDialogOpen(false);
    setPinError("");
    setPinVisibility({ next: false, confirm: false });
    setPinFields({
      newDigits: Array(6).fill(""),
      confirmDigits: Array(6).fill(""),
    });

    // snapshot pristine state for main dialog
    const nextMain = row
      ? {
          photoUrl: row.photoUrl || "",
          employeeId: String(row.employeeId),
          username: row.username || "",
          email: row.email || "",
          firstName: row.firstName || "",
          lastName: row.lastName || "",
          phone: row.phone || "",
          role: row.role || "",
          status: row.status || "Active",
          pinDigits: Array(6).fill(""),
          loginVia: { ...(row.loginVia || { employeeId: true, username: true, email: true }) },
          // password is empty at open; we only stage later
          password: "",
          securityQuestions: Array.isArray(row.securityQuestions) ? row.securityQuestions : [],
        }
      : makeBlank(rows);
    initialMainRef.current = JSON.parse(JSON.stringify(nextMain));

    setOpen(true);
  };

  const [createResult, setCreateResult] = useState(null);

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (!/^\d{10,11}$/.test(form.phone)) e.phone = "Enter 10–11 digits (e.g. 09559391324)";
    if (!form.role) e.role = "Required";

    const isEditing = rows.some((r) => String(r.employeeId) === String(form.employeeId));

    // 🔐 PASSWORD (role-aware)
    if (needsPassword) {
      if (!isEditing || (isEditing && form.password)) {
        if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d\S]{8,}$/.test(form.password)) {
          e.password = "8+ chars with letters & numbers (special recommended)";
        }
      }
    }

  const uname = form.username.trim().toLowerCase();
  if (!uname) {
    e.username = "Required";
  } else {
    const taken = rows.some(
      (r) =>
        (r.username || "").toLowerCase() === uname &&
        String(r.employeeId) !== String(form.employeeId)
    );
    if (taken) e.username = "Username already in use";
  }

    const email = form.email.trim();
    if (!email) {
      e.email = "Required";
    } else {
      if (!emailRe.test(email)) {
        e.email = "Invalid email";
      } else {
        const taken = rows.some(
          (r) =>
            (r.email || "").toLowerCase() === email.toLowerCase() &&
            String(r.employeeId) !== String(form.employeeId)
        );
        if (taken) e.email = "Email already in use";
      }
    }
    const lv = form.loginVia;
    // Policy: at least ONE login ID (Employee ID or Username) must be enabled
    if (!lv.employeeId && !lv.username) {
      e.loginVia = "At least one login ID (Employee ID or Username) must be enabled";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const pin = form.pinDigits.join("");
    const isEditing = rows.some((r) => String(r.employeeId) === String(form.employeeId));

    const payload = {
      employeeId: String(form.employeeId),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone,
      role: form.role,
      status: form.status,
      username: form.username.trim().toLowerCase(),
      email: form.email.trim(),
      loginVia: { ...form.loginVia },
      photoUrl: form.photoUrl || "",
      ...(needsPassword && form.password ? { password: form.password } : {}),
      ...(needsPin && /^\d{6}$/.test(pin) ? { pin } : {}),
    };

    // create-only: include staged SQs if touched
    if (!isEditing && sqTouched) {
      const filled = sqFields.filter((q) => q.id && q.answer.trim()).slice(0, 2);
      const seen = new Set();
      const sqUnique = [];
      for (const q of filled) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        sqUnique.push({ id: q.id, answer: q.answer.trim() });
      }
      payload.securityQuestions = sqUnique;
    }

    try {
      let res = null;

      if (!photoFile) {
        // JSON
        res = isEditing
          ? await updateUser(form.employeeId, payload)
          : await createUser(payload);
      } else {
        // multipart
        const fd = new FormData();
        fd.append("photo", photoFile);
        fd.append("data", JSON.stringify(payload));

        res = isEditing
          ? await updateUser(form.employeeId, fd, { multipart: true })
          : await createUser(fd, { multipart: true });
      }

      // ✅ IMPORTANT: set ticket BEFORE closing main dialog
      if (!isEditing && form.role === "Cashier" && res?.initialTicket) {
        setCreateResult({
          employeeId: form.employeeId,
          username: form.username,
          email: form.email,
          ticket: res.initialTicket,
          loginVia: { ...(form.loginVia || {}) },
        });
      }

      alert.success(isEditing ? "User updated." : "User created.");
      setOpen(false);
    } catch (e) {
      console.error(e);
      alert.error(e?.message || "Failed to save user.");
    }
  };

  // ===== Password dialog helpers =====
  const editingRow = rows.find((r) => String(r.employeeId) === String(form.employeeId));
  const hasStagedPin = Array.isArray(form.pinDigits) && form.pinDigits.some((d) => d);
  const hasExistingPin = !!editingRow?.hasPin;
  const hasExistingSq =
    Array.isArray(form.securityQuestions) && form.securityQuestions.length > 0;

  const pwScore = scorePassword(pwFields.next);
  const pwRules = ruleChecks(pwFields.next);

  function blurActive() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function openPasswordDialog() {
    blurActive();
    setPwFields({ current: "", next: "", confirm: "" });
    setPwErrors({ current: "", next: "", confirm: "" });
    setPwShow({ current: false, next: false, confirm: false });
    initialPwRef.current = { current: "", next: "", confirm: "" };
    setPwDialogOpen(true);
  }

  function savePasswordDialog() {
    const errs = { current: "", next: "", confirm: "" };
    if (isEditingExisting && !pwFields.current.trim())
      errs.current = "Please enter your current password.";
    if (!pwFields.next || pwFields.next.length < 8)
      errs.next = "New password must be at least 8 characters.";
    if (pwFields.next !== pwFields.confirm)
      errs.confirm = "New password and confirmation do not match.";
    setPwErrors(errs);
    if (errs.current || errs.next || errs.confirm) return;

    if (!isEditingExisting) {
      setForm((f) => ({ ...f, password: pwFields.next }));
      setPwDialogOpen(false);
      return;
    }

    // EDIT flow
    (async () => {
      try {
        setPwSaving(true);
        setPwErrors({ current: "", next: "", confirm: "" });
        await updateUser(form.employeeId, {
          currentPassword: pwFields.current,
          password: pwFields.next,
        });
        setForm((f) => ({ ...f, password: "" }));
        setPwDialogOpen(false);
        alert.success("Password updated.");
      } catch (e) {
        setPwErrors((prev) => ({
          ...prev,
          current: e?.message || "Failed to update password.",
        }));
      } finally {
        setPwSaving(false);
      }
    })();
  }

  function openPinDialog() {
    if (form.role !== "Cashier") return;
    blurActive();
    setPinDialogMode(isEditingExisting ? "change" : "set");
    setPinError("");
    setPinVisibility({ next: false, confirm: false });

    // if there is a staged PIN in the main form, prefill it; otherwise start empty
    const staged = Array.isArray(form.pinDigits) ? form.pinDigits : [];
    const digits = Array(6)
      .fill("")
      .map((_, i) => staged[i] || "");

    setPinFields({
      newDigits: digits,
      confirmDigits: Array(6).fill(""),
    });
    setPinDialogOpen(true);
  }

  function savePinDialog() {
    const pinPattern = /^\d{6}$/;
    const newPin = pinFields.newDigits.join("");
    const confirmPin = pinFields.confirmDigits.join("");

    if (!pinPattern.test(newPin)) {
      setPinError("PIN must be exactly 6 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("New PIN and confirm PIN do not match.");
      return;
    }

    // stage into main form; actual save happens on main Save
    setForm((f) => ({ ...f, pinDigits: [...pinFields.newDigits] }));
    setErrors((prev) => ({ ...prev, pin: undefined }));
    setPinDialogOpen(false);
    setPinError("");
  }

  // ===== Security Questions dialog helpers =====
  function openSqDialog() {
    blurActive();
    setSqError("");
    initialSqRef.current = JSON.parse(JSON.stringify(sqFields));
    setSqDialogOpen(true);
  }

  function resetSqToInitial() {
    const fallback = [{ id: "", answer: "" }];
    const base = Array.isArray(initialSqRef.current) ? initialSqRef.current : fallback;
    setSqFields(JSON.parse(JSON.stringify(base)));
  }

  function shallowEqualObj(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (typeof a[k] === "object" && typeof b[k] === "object") {
        if (!shallowEqualObj(a[k], b[k])) return false;
      } else if (a[k] !== b[k]) return false;
    }
    return true;
  }

  function hasMainChanges() {
    const base = initialMainRef.current;
    if (!base) return false;
    // fields we care about for dirty check
    const cur = {
      photoUrl: form.photoUrl || "",
      employeeId: String(form.employeeId),
      username: form.username || "",
      email: form.email || "",
      firstName: form.firstName || "",
      lastName: form.lastName || "",
      phone: form.phone || "",
      role: form.role || "",
      status: form.status || "Active",
      pinDigits: form.pinDigits || [],
      loginVia: form.loginVia || {},
      password: form.password || "", // staged password counts as dirty
      // for display only, but still a user-visible change in the dialog
      securityQuestions: form.securityQuestions || [],
    };
    return !shallowEqualObj(cur, base);
  }

  function hasSqChanges() {
    if (!initialSqRef.current) return false;
    return JSON.stringify(sqFields) !== JSON.stringify(initialSqRef.current);
  }

  function hasPwChanges() {
    if (!initialPwRef.current) return false;
    return JSON.stringify(pwFields) !== JSON.stringify(initialPwRef.current);
  }

  // ⬇️ Save SQs directly here for existing users. For new users, just stage.
  async function saveSqDialog() {
    setSqError("");

    const filled = sqFields.filter(q => q.id && q.answer.trim());

    // (defensive) more than 1 should never happen but keep guard
    if (filled.length > 1) {
      setSqError("You can save only one security question.");
      return;
    }

    const isEditing = rows.some(
      (r) => String(r.employeeId) === String(form.employeeId)
    );

    // Clear all if nothing filled
    if (filled.length === 0) {
      if (isEditing) {
        try {
          setSqSaving(true);
          await updateUser(form.employeeId, { securityQuestions: [] });
          setForm((f) => ({ ...f, securityQuestions: [] }));
          setSqFields([{ id: "", answer: "" }]);
          setSqDialogOpen(false);
          alert.success("Security question cleared.");
        } catch (e) {
          console.error(e);
          setSqError("Failed to save. Please try again.");
          alert.error(e?.message || "Failed to clear security question.");
        } finally {
          setSqSaving(false);
        }
      } else {
        setForm((f) => ({ ...f, securityQuestions: [] }));
        setSqFields([{ id: "", answer: "" }]);
        setSqTouched(true);
        setSqDialogOpen(false);
        alert.info("Security question will be cleared on Save.");
      }
      return;
    }

    // Build payload (only 1)
    const sqUnique = filled.map(q => ({
      id: q.id,
      answer: q.answer.trim(),
    }));

    if (isEditing) {
      try {
        setSqSaving(true);
        await updateUser(form.employeeId, { securityQuestions: sqUnique });
        setForm((f) => ({
          ...f,
          securityQuestions: sqUnique.map(q => ({
            id: q.id,
            question: SQ_CATALOG[q.id] || "Security question",
          })),
        }));
        const cleared = sqUnique.map(q => ({ id: q.id, answer: "" }));
        while (cleared.length < 1) cleared.push({ id: "", answer: "" });
        setSqFields(cleared);
        initialSqRef.current = JSON.parse(JSON.stringify(cleared));
        setSqDialogOpen(false);
        alert.success("Security question saved.");
      } catch (e) {
        console.error(e);
        setSqError("Failed to save. Please try again.");
        alert.error(e?.message || "Failed to save security question.");
      } finally {
        setSqSaving(false);
      }
    } else {
      setForm((f) => ({
        ...f,
        securityQuestions: sqUnique.map(q => ({
          id: q.id,
          question: SQ_CATALOG[q.id] || "Security question",
        })),
      }));
      setSqTouched(true);
      const cleared = sqUnique.map(q => ({ id: q.id, answer: "" }));
      while (cleared.length < 1) cleared.push({ id: "", answer: "" });
      setSqFields(cleared);
      initialSqRef.current = JSON.parse(JSON.stringify(cleared));
      setSqDialogOpen(false);
      alert.info("Security question will be saved on Create.");
    }
  }

  const selectedSqIds = sqFields.map(f => f.id);

  // ── close handlers using ConfirmContext
  const requestCloseMain = async () => {
    if (hasMainChanges()) {
      const ok = await confirm({
        title: "Discard changes?",
        content: "You have unsaved changes. If you leave now, your changes will be lost.",
        confirmLabel: "Discard",
        confirmColor: "error",
      });
      if (!ok) return;
    }
    setOpen(false);
  };

  const requestClosePw = async () => {
    if (hasPwChanges()) {
      const ok = await confirm({
        title: "Discard password changes?",
        content: "Any text you entered here will be lost.",
        confirmLabel: "Discard",
        confirmColor: "error",
      });
      if (!ok) return;
    }
    setPwDialogOpen(false);
  };

  const requestCloseSq = async () => {
    if (sqSaving) return; // block while saving
    if (hasSqChanges()) {
      const ok = await confirm({
        title: "Discard changes?",
        content: "Your edits to security questions will be lost.",
        confirmLabel: "Discard",
        confirmColor: "error",
      });
      if (!ok) return;
      // ⬅️ restore inputs back to snapshot
      resetSqToInitial();
      setSqTouched(false); // nothing staged anymore
    }
    setSqDialogOpen(false);
  };

  /* ============================
     🔴 DELETE helpers (dialog)
     ============================ */
  const canDeleteAny = rows.length > 1;

  async function handleDelete() {
    if (!isEditingExisting) return;
    if (isLastAdmin) {
      alert.info("You must keep at least one Admin account.");
      return;
    }

    if (!canDeleteAny) {
      alert.info("You must keep at least one user account.");
      return;
    }
    const ok = await confirm({
      title: "Delete this user?",
      content:
        "This will permanently remove the account and its login aliases. This action cannot be undone.",
      confirmLabel: "Delete",
      confirmColor: "error",
    });
    if (!ok) return;

    try {
      await deleteUser(form.employeeId);
      alert.success("User deleted.");
      setOpen(false);
    } catch (e) {
      console.error(e);
      alert.error(e?.message || "Failed to delete user.");
    }
  }

  return (
    <Box p={2} display="grid" gap={2}>
      {/* LIST CARD — header + table, same structure as ItemListPage */}
      <Paper sx={{ overflow: "hidden" }}>
        {/* header */}
        <Box p={2}>
          <Stack
            direction="row"
            useFlexGap
            alignItems="center"
            flexWrap="wrap"
            rowGap={1.5}
            columnGap={2}
            sx={{ minWidth: 0 }}
          >
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              size="small"
              onClick={() => openDialogFor(null)}
              sx={{ flexShrink: 0 }}
            >
              Add User
            </Button>

            {/* spacer */}
            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

            {/* search */}
            <TextField
              placeholder="Search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              size="small"
              sx={{
                // full width on phones, fixed width from sm+
                flex: { xs: "1 1 240px", sm: "0 0 auto" },
                width: { xs: "100%", sm: 320 },
                minWidth: 0,
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Stack>
        </Box>

        <Divider />

        {/* table */}
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{ width: "100%", borderRadius: 1, overflowX: "auto" }}
          >
            <Table
              stickyHeader
              aria-label="items table"
              sx={{ minWidth: { xs: 600, sm: 760, md: 880 } }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Employee ID</TableCell>
                  <TableCell>Username</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>First Name</TableCell>
                  <TableCell>Last Name</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {slice.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No users found
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  slice.map((r) => (
                    <TableRow
                      key={r.id || r.employeeId}
                      hover
                      onClick={() => openDialogFor(r)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{r.employeeId}</TableCell>
                      <TableCell>{r.username}</TableCell>
                      {/* optionally clip super-long emails so rows stay tidy */}
                      <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.email}
                      </TableCell>
                      <TableCell>{r.firstName}</TableCell>
                      <TableCell>{r.lastName}</TableCell>
                      <TableCell>{r.phone}</TableCell>
                        <TableCell>{r.role}</TableCell>
                        <TableCell>
                          {(() => {
                            const locked = isLockedForDisplay(r);

                            // If they are locked for their app, force them to show as Inactive.
                            // Only show "Active" when DB status is Active AND they are not locked.
                            const effectiveStatus =
                              r.status === "Active" && !locked ? "Active" : "Inactive";

                            return (
                              <Chip
                                size="small"
                                label={effectiveStatus}
                                color={effectiveStatus === "Active" ? "success" : "error"}
                                variant="filled"
                                sx={{ minWidth: 72, justifyContent: "center" }} // optional: consistent width
                              />
                            );
                          })()}
                        </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* footer */}
          <Stack direction="row" alignItems="center" spacing={1.25} mt={1} flexWrap="wrap">
            <Paper variant="outlined" sx={{ p: 0.25, display: "inline-flex", alignItems: "center" }}>
              <IconButton size="small" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeftIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRightIcon fontSize="small" /></IconButton>
            </Paper>
            <Typography variant="body2">Page:</Typography>
            <Paper variant="outlined" sx={{ px: 1, py: 0.25, display: "inline-flex", alignItems: "center", gap: 0.75 }}>
              <Typography variant="body2">{page}</Typography>
              <Typography variant="body2" color="text.secondary">of</Typography>
              <Typography variant="body2">{totalPages}</Typography>
            </Paper>
            <Typography variant="body2" sx={{ ml: { xs: 0, sm: 1 } }}>Rows per page:</Typography>
            <TextField select size="small" value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }} sx={{ width: 76 }}>
              {[5, 10, 25, 50].map((n) => (<MenuItem key={n} value={n}>{n}</MenuItem>))}
            </TextField>
          </Stack>
        </Box>
      </Paper>

      {/* main dialog */}
      <Dialog
        open={open}
        onClose={requestCloseMain}
        maxWidth="md"
        fullWidth
        disableRestoreFocus
        PaperProps={dialogPaperGrid}
      >
        <DialogTitle sx={{ pb: 0.5, fontSize: 18 }}>
          {rows.some((r) => String(r.employeeId) === String(form.employeeId)) ? "Edit User" : "New User"}
        </DialogTitle>

        <DialogContent
          dividers
          sx={{
            p: 0,                 // keep padding in the inner <Box> you already have
            overflowY: "auto",
            overscrollBehaviorY: "contain",
            scrollbarGutter: "stable both-edges",

            /* optional, nice WebKit scrollbar polish */
            "&::-webkit-scrollbar": { width: 12 },
            "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
            "&::-webkit-scrollbar-thumb": (t) => ({
              backgroundColor: t.palette.action.disabled,
              borderRadius: 8,
              border: `3px solid ${t.palette.background.paper}`,
            }),
          }}
        >
          <Box
            sx={{
              p: { xs: 1.5, md: 2 },
              "& .MuiFormHelperText-root": { mt: 0.25, fontSize: 12 },
              "& .MuiInputBase-root": { minHeight: 36 },
            }}
          >

            {/* ===== Profile ===== */}
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Profile</Typography>

            <Grid container spacing={1.5} alignItems="flex-start" wrap="nowrap">
              {/* LEFT: Photo */}
              <Grid item xs={12} md="auto" sx={{ width: { md: 280 }, flexShrink: 0 }}>
                <Paper sx={{ p: 1, height: "100%" }}>
                  <Stack alignItems="center" spacing={1}>
                    <Avatar
                      src={form.photoUrl || undefined}
                      alt={`${form.firstName || "User"} ${form.lastName || ""}`}
                      sx={{ width: 88, height: 88 }}
                    />
                    <Stack direction="row" spacing={0.75}>
                      <input
                        id="user-photo-input"
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          setPhotoFile(file); // <-- store actual file
                          const previewUrl = URL.createObjectURL(file);
                          setForm((f) => ({ ...f, photoUrl: previewUrl })); // preview only
                        }}
                      />
                      <label htmlFor="user-photo-input">
                        <Button component="span" size="small" startIcon={<PhotoCameraOutlinedIcon />} variant="outlined">
                          Upload
                        </Button>
                      </label>
                      {form.photoUrl && (
                        <Button size="small" color="error" 
                          onClick={() => {
                            setPhotoFile(null);
                            setForm((f) => ({ ...f, photoUrl: "" }));
                          }}>
                          Remove
                        </Button>
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">JPG/PNG</Typography>
                  </Stack>
                </Paper>
              </Grid>

              {/* RIGHT: Employee ID / Username / Email */}
              <Grid item xs sx={{ minWidth: 0 }}>
                <Grid container spacing={1.5}>
                  {/* Employee ID */}
                  <Grid item xs={12}>
                    <TextField
                      sx={{ width: 250 }}
                      size="small"
                      label="Employee ID"
                      value={form.employeeId}
                      disabled={!form.loginVia.employeeId}
                      slotProps={{
                        htmlInput: { readOnly: true },
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <BadgeOutlinedIcon fontSize="small" />
                            </InputAdornment>
                          ),
                          endAdornment: isEditingExisting ? (
                            <InputAdornment position="end">
                              <Switch
                                size="small"
                                checked={form.loginVia.employeeId}
                                onChange={(_, c) => {
                                  const next = { ...form.loginVia, employeeId: c };
                                  if (!next.employeeId && !next.username) return;
                                  setForm((f) => ({ ...f, loginVia: next }));
                                }}
                              />
                            </InputAdornment>
                          ) : null,
                        },
                      }}
                    />
                  </Grid>

                  {/* Username */}
                  <Grid item xs={12} sx={{ minWidth: 0 }}>
                    <TextField
                      sx={{ width: 300 }}
                      size="small"
                      label={
                        <>
                          Username<span style={{ color: "#d32f2f" }}> *</span>
                        </>
                      }
                      value={form.username}
                      error={!!errors.username}
                      helperText={errors.username || "Required — must be unique"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((f) => ({ ...f, username: v }));

                        if (errors.username) {
                          setErrors((prev) => ({ ...prev, username: undefined }));
                        }
                      }}
                      slotProps={{
                        htmlInput: {
                          readOnly: false,
                          autoComplete: "username",
                          inputMode: "text",
                          "aria-label": "Username",
                        },
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <AccountCircleOutlinedIcon fontSize="small" />
                            </InputAdornment>
                          ),
                          endAdornment: isEditingExisting ? (
                            <InputAdornment position="end">
                              <Switch
                                size="small"
                                checked={form.loginVia.username}
                                onChange={(_, c) => {
                                  const next = { ...form.loginVia, username: c };
                                  if (!next.employeeId && !next.username) return;
                                  setForm((f) => ({ ...f, loginVia: next }));
                                }}
                              />
                            </InputAdornment>
                          ) : null,
                          sx: undefined,
                        },
                      }}
                    />
                  </Grid>

                  {/* Email */}
                  <Grid size={{ xs: 12 }} sx={{ minWidth: 0 }}>
                    <TextField
                      sx={{ width: 300 }}
                      size="small"
                      label={
                        <>
                          Email<span style={{ color: "#d32f2f" }}> *</span>
                        </>
                      }
                      type="email"
                      value={form.email}
                      error={!!errors.email}
                      helperText={errors.email || "Required — unique, valid email format"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((f) => ({ ...f, email: v }));

                        if (errors.email) {
                          setErrors((prev) => ({ ...prev, email: undefined }));
                        }
                      }}
                      slotProps={{
                        htmlInput: {
                          autoComplete: "email",
                          inputMode: "email",
                          "aria-label": "Email",
                        },
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <MailOutlineIcon fontSize="small" />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                  </Grid>
                </Grid>
              </Grid>
            </Grid>

            {/* ===== Name ===== */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>First Name, Last Name</Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  size="small"
                  label={
                    <>
                      First Name<span style={{ color: "#d32f2f" }}> *</span>
                    </>
                  }
                  value={form.firstName}
                  error={!!errors.firstName}
                  helperText={errors.firstName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, firstName: v }));

                    if (errors.firstName) {
                      setErrors((prev) => ({ ...prev, firstName: undefined }));
                    }
                  }}
                  fullWidth
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonOutlineIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                    htmlInput: {
                      autoComplete: "given-name",
                      "aria-label": "First name",
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  size="small"
                  label={<>Last Name<span style={{ color: "#d32f2f" }}> *</span></>}
                  value={form.lastName}
                  error={!!errors.lastName}
                  helperText={errors.lastName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, lastName: v }));

                    if (errors.lastName) {
                      setErrors((prev) => ({ ...prev, lastName: undefined }));
                    }
                  }}
                  fullWidth
                />
              </Grid>
            </Grid>

            {/* ===== Contact & Access ===== */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Contact & Access</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <TextField
                  sx={{ width: 200 }}
                  size="small"
                  label={<>Phone<span style={{ color: "#d32f2f" }}> *</span></>}
                  placeholder="09559391324"
                  value={form.phone}
                  error={!!errors.phone}
                  helperText={errors.phone}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                    setForm((f) => ({ ...f, phone: v }));

                    // ✅ clear stale error highlight
                    if (errors.phone) {
                      setErrors((prev) => ({ ...prev, phone: undefined }));
                    }
                  }}
                  fullWidth
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PhoneOutlinedIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12, md: 3 }} sx={{ flexShrink: 0, minWidth: 150 }}>
                <FormControl fullWidth size="small" error={!!errors.role}>
                  <InputLabel required>Role</InputLabel>
                  <Select
                    label="Role"
                    value={form.role}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, role: e.target.value }));
                      if (errors.role) {
                        setErrors((prev) => ({ ...prev, role: undefined }));
                      }
                    }}
                  >
                    {ROLE_OPTIONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>

            </Grid>

            {/* ===== Credentials (left) + Security & Lock (right) ===== */}
            {(showCredentialsSection || isEditingExisting) && (
              <>
                <Divider sx={{ my: 2 }} />

                <Grid container spacing={2} alignItems="flex-start">
                  {/* LEFT COLUMN — Credentials */}
                  {showCredentialsSection && (
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                        Credentials
                      </Typography>

                      <Grid container spacing={2} alignItems="stretch">
                        {/* Row 1: Password + Security Questions (side-by-side) */}
                        {(needsPassword || form.role !== "Cashier") && (
                          <>
                            {needsPassword && (
                              <Grid item xs={12} md={6}>
                                <Paper
                                  variant="outlined"
                                  onClick={openPasswordDialog}
                                  sx={{
                                    p: 1,
                                    cursor: "pointer",
                                    "&:hover": { bgcolor: "action.hover" },
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    minHeight: 62,          // a bit taller so both tiles feel balanced
                                    height: "100%",
                                  }}
                                >
                                  <Stack direction="row" spacing={1.25} alignItems="center">
                                    <LockOutlinedIcon fontSize="small" />
                                    <Box>
                                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                                        {`Last added/changed: ${formatLastChanged(form.passwordLastChanged)}`}
                                      </Typography>
                                      <Typography variant="body2" sx={{ mt: 0.25 }}>
                                        Password{form.password ? " (staged)" : ""}
                                      </Typography>
                                    </Box>
                                  </Stack>
                                  <ChevronRightOutlinedIcon fontSize="small" />
                                </Paper>

                                {errors.password && (
                                  <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                                    {errors.password}
                                  </Typography>
                                )}
                              </Grid>
                            )}

                            {form.role !== "Cashier" && (
                              <Grid item xs={12} md={6}>
                                <Paper
                                  variant="outlined"
                                  onClick={openSqDialog}
                                  sx={{
                                    p: 1,
                                    cursor: "pointer",
                                    "&:hover": { bgcolor: "action.hover" },
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    minHeight: 62,
                                    height: "100%",
                                  }}
                                >
                                  <Stack direction="row" spacing={1.25} alignItems="center">
                                    <HelpOutlineOutlinedIcon fontSize="small" />
                                    <Box>
                                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                                        {hasExistingSq ? "Question and Answer configured" : "None configured"}
                                      </Typography>
                                      <Typography variant="body2" sx={{ mt: 0.25 }}>
                                        Security Questions
                                      </Typography>
                                    </Box>
                                  </Stack>
                                  <ChevronRightOutlinedIcon fontSize="small" />
                                </Paper>
                              </Grid>
                            )}
                          </>
                        )}

                        {/* Row 2: Reset Ticket (full-width, stays on its own row) */}
                        {needsPin && isEditingExisting && (
                          <Grid item xs={12}>
                            <Paper
                              variant="outlined"
                              onClick={openResetTicketDialog}
                              sx={{
                                p: 1,
                                cursor: "pointer",
                                "&:hover": { bgcolor: "action.hover" },
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                minHeight: 46,
                              }}
                            >
                              <Stack direction="row" spacing={1.25} alignItems="center">
                                <LockOutlinedIcon fontSize="small" />
                                <Box>
                                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                                    Generate a one-time ticket so cashier can set a NEW POS PIN
                                  </Typography>
                                  <Typography variant="body2" sx={{ mt: 0.25 }}>
                                    Reset Ticket (POS PIN)
                                  </Typography>
                                </Box>
                              </Stack>
                              <ChevronRightOutlinedIcon fontSize="small" />
                            </Paper>
                          </Grid>
                        )}
                      </Grid>

                    </Grid>
                  )}

                  {/* RIGHT COLUMN — Security & Lock */}
                  {isEditingExisting && (
                    <Grid item xs={12} md={6}>
                      {/* ✅ NOTE: this is your same logic, just without the md:8 limiter */}
                      {(() => {
                        const row = rows.find((r) => String(r.employeeId) === String(form.employeeId));
                        if (!row) {
                          return (
                            <Typography variant="body2" color="text.secondary">
                              No lock info.
                            </Typography>
                          );
                        }

                        const now = Date.now();
                        const LOCK_THRESHOLD = 3;

                        const isLockedState = (s) => {
                          if (!s) return false;
                          const perm = !!s.permanentLock;
                          const temp = s.lockUntil ? new Date(s.lockUntil).getTime() > now : false;
                          const fail = Number(s.failedLoginCount || 0) >= LOCK_THRESHOLD;
                          return perm || temp || fail;
                        };

                        // Legacy/global (migration-only)
                        const legacyTemp = row.lockUntil ? new Date(row.lockUntil).getTime() > now : false;
                        const legacyPerm = !!row.permanentLock;
                        const legacyFail = Number(row.failedLoginCount || 0) >= LOCK_THRESHOLD;
                        const legacyLocked = legacyTemp || legacyPerm || legacyFail;

                        const userRole = form.role;

                        const shouldShowApp = (appKey) => {
                          if (userRole === "Cashier") return appKey !== "pos";       // hide POS for Cashier
                          if (userRole === "Admin") return appKey !== "pos";         // (optional) Admin also doesn't need POS
                          return true;
                        };

                        const rawEntries = Object.entries(row.lockStates || {});
                        const entries = rawEntries.filter(([appKey]) => shouldShowApp(appKey));

                        const lockedApps = entries
                          .filter(([_, s]) => isLockedState(s))
                          .map(([k]) => k);

                        const showLegacy = rawEntries.length === 0 && legacyLocked;

                        let primaryLabel = "All systems unlocked";
                        let primaryDisabled = true;
                        let primaryOnClick = null;

                        if (lockedApps.length === 1) {
                          const target = lockedApps[0];
                          primaryLabel = "Unlock";
                          primaryDisabled = false;
                          primaryOnClick = async () => {
                            const ok = await confirm({
                              title: "Unlock system?",
                              content: `This clears ${
                                target === "backoffice" ? "QUSCINA POS" : target
                              } lock and failed attempts.`,
                              confirmLabel: "Unlock",
                            });
                            if (!ok) return;

                            try {
                              await unlockUser(form.employeeId, { app: target });
                              setRows((prev) =>
                                prev.map((r) =>
                                  String(r.employeeId) === String(form.employeeId)
                                    ? {
                                        ...r,
                                        failedLoginCount: 0,
                                        lockUntil: null,
                                        permanentLock: false,
                                        lockStates: {
                                          ...(r.lockStates || {}),
                                          [target]: {
                                            failedLoginCount: 0,
                                            lockUntil: null,
                                            permanentLock: 0,
                                            lastFailedLogin: null,
                                          },
                                        },
                                      }
                                    : r
                                )
                              );
                              alert.success("Unlock successful.");
                            } catch (e) {
                              alert.error(e?.message || "Failed to unlock.");
                            }
                          };
                        } else if (lockedApps.length >= 2) {
                          primaryLabel = "Unlock All";
                          primaryDisabled = false;
                          primaryOnClick = async () => {
                            const ok = await confirm({
                              title: "Unlock ALL systems?",
                              content: "This clears locks and failed attempts for every system.",
                              confirmLabel: "Unlock All",
                            });
                            if (!ok) return;

                            try {
                              await unlockUser(form.employeeId, { scope: "all" });
                              setRows((prev) =>
                                prev.map((r) =>
                                  String(r.employeeId) === String(form.employeeId)
                                    ? {
                                        ...r,
                                        failedLoginCount: 0,
                                        lockUntil: null,
                                        permanentLock: false,
                                        lockStates: Object.fromEntries(
                                          Object.keys(r.lockStates || {}).map((k) => [
                                            k,
                                            { failedLoginCount: 0, lockUntil: null, permanentLock: 0, lastFailedLogin: null },
                                          ])
                                        ),
                                      }
                                    : r
                                )
                              );
                              alert.success("All systems unlocked.");
                            } catch (e) {
                              alert.error(e?.message || "Failed to unlock all.");
                            }
                          };
                        } else if (showLegacy) {
                          primaryLabel = "Unlock";
                          primaryDisabled = false;
                          primaryOnClick = async () => {
                            const ok = await confirm({
                              title: "Unlock (legacy)?",
                              content: "This clears legacy/global locks and failed attempts.",
                              confirmLabel: "Unlock",
                            });
                            if (!ok) return;

                            try {
                              await unlockUser(form.employeeId, {});
                              setRows((prev) =>
                                prev.map((r) =>
                                  String(r.employeeId) === String(form.employeeId)
                                    ? { ...r, failedLoginCount: 0, lockUntil: null, permanentLock: false }
                                    : r
                                )
                              );
                              alert.success("Unlock successful.");
                            } catch (e) {
                              alert.error(e?.message || "Failed to unlock.");
                            }
                          };
                        }

                        const labelFor = (key) => {
                          if (key === "pos") return "POS";            // optional: keep generic or hide it anyway
                          if (key === "backoffice") return "QUSCINA POS";
                          return key.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                        };

                        return (
                          <>
                            {/* ✅ Header row: title left, action/status right (SAME ROW) */}
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={1}
                              sx={{ mb: 1 }}
                            >
                              <Typography variant="subtitle2">
                                Security &amp; Lock
                              </Typography>

                              {primaryDisabled ? (
                                <Chip
                                  size="small"
                                  label="All systems unlocked"
                                  variant="filled"
                                  sx={(t) => ({
                                    bgcolor: t.palette.action.disabledBackground,
                                    color: t.palette.text.secondary,
                                    fontWeight: 600,
                                  })}
                                />
                              ) : (
                                <Button
                                  variant="contained"
                                  color="warning"
                                  size="small"
                                  onClick={primaryOnClick}
                                  sx={{ flexShrink: 0 }}
                                >
                                  {primaryLabel}
                                </Button>
                              )}
                            </Stack>

                            {/* ✅ Flat list: NO outer Paper wrapper (removes “box inside box”) */}
                            {entries.length ? (
                              <Stack spacing={1}>
                                {entries.map(([appKey, s]) => {
                                  const untilMs = s.lockUntil ? new Date(s.lockUntil).getTime() : 0;
                                  const tempLocked = untilMs > now;
                                  const permLocked = !!s.permanentLock;
                                  const failLocked = Number(s.failedLoginCount || 0) >= LOCK_THRESHOLD;
                                  const locked = permLocked || tempLocked || failLocked;

                                  return (
                                    <Paper
                                      key={appKey}
                                      variant="outlined"
                                      sx={{
                                        p: 1,
                                        borderRadius: 1,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <Typography variant="body2" sx={{ fontWeight: 600, mr: 0.5 }}>
                                        {labelFor(appKey)}
                                      </Typography>

                                      <Chip
                                        size="small"
                                        label={
                                          permLocked
                                            ? "PERMANENT LOCK"
                                            : tempLocked
                                            ? "TEMP LOCKED"
                                            : failLocked
                                            ? "FAILED LOCK"
                                            : "UNLOCKED"
                                        }
                                        color={locked ? "error" : "success"}
                                        variant={locked ? "filled" : "outlined"}
                                      />

                                      <Chip
                                        size="small"
                                        variant="outlined"
                                        label={`Failed: ${s.failedLoginCount ?? 0}`}
                                      />

                                      {tempLocked && (
                                        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                                          until {new Date(untilMs).toLocaleString()}
                                        </Typography>
                                      )}
                                    </Paper>
                                  );
                                })}
                              </Stack>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                No per-system lock states found.
                              </Typography>
                            )}

                            {/* Legacy stays as-is (optional: you can also flatten it the same style) */}
                            {showLegacy && (
                              <Paper variant="outlined" sx={{ p: 1, mt: 1 }}>
                                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                                  <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
                                    Legacy/Global
                                  </Typography>
                                  <Chip size="small" label="LOCKED" color="error" variant="filled" />
                                  {legacyTemp && (
                                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                                      until {new Date(row.lockUntil).toLocaleString()}
                                    </Typography>
                                  )}
                                </Stack>
                              </Paper>
                            )}
                          </>
                        );

                      })()}
                    </Grid>
                  )}
                </Grid>
              </>
            )}

            {errors.loginVia && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                {errors.loginVia}
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 1.5 }}>
          {isEditingExisting && (
            <Tooltip
              title={
                isOnlyRemaining
                  ? "You must keep at least one user"
                  : isLastAdmin
                  ? "You must keep at least one Admin account"
                  : "Delete this user"
              }
            >
              <span>
                <Button
                  onClick={handleDelete}
                  color="error"
                  variant="outlined"
                  size="small"
                  disabled={deleteDisabled}
                  sx={{ mr: "auto" }}
                >
                  Delete
                </Button>
              </span>
            </Tooltip>
          )}
          <Button onClick={requestCloseMain} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleSave} variant="contained" size="small">Save</Button>
        </DialogActions>
      </Dialog>

      {/* ===== Change Password sub-dialog ===== */}
      <Dialog open={pwDialogOpen} onClose={requestClosePw} maxWidth="xs" fullWidth disableAutoFocus disableRestoreFocus  TransitionProps={{ onEnter: blurActive }} PaperProps={dialogPaperGrid}>
        <DialogTitle sx={{ pb: 0.5 }}>
          {isEditingExisting ? "Change Password" : "New Password"}
        </DialogTitle>
          <DialogContent
            dividers
            sx={{
              overflowY: "auto",
              overscrollBehaviorY: "contain",
              scrollbarGutter: "stable both-edges",
            }}
          >
          <Stack spacing={1.25}>
            {isEditingExisting && (
              <TextField
                size="small"
                type={pwShow.current ? "text" : "password"}
                label="Current Password"
                value={pwFields.current}
                onChange={(e) => {
                  const v = e.target.value;
                  setPwFields((s) => ({ ...s, current: v }));
                  if (pwErrors.current) setPwErrors((p) => ({ ...p, current: "" }));
                }}
                error={!!pwErrors.current}
                helperText={pwErrors.current}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setPwShow((s) => ({ ...s, current: !s.current }))}
                          aria-label={pwShow.current ? "Hide password" : "Show password"}
                        >
                          {pwShow.current ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                  htmlInput: {
                    autoComplete: "current-password",
                    "aria-label": "Current password",
                  },
                }}
              />
            )}

            {/* New + Confirm */}
            <TextField
              size="small"
              type={pwShow.next ? "text" : "password"}
              label="New Password"
              required={!isEditingExisting}
              value={pwFields.next}
              onChange={(e) => {
                const v = e.target.value;
                setPwFields((s) => ({ ...s, next: v }));
                if (pwErrors.next) setPwErrors((p) => ({ ...p, next: "" }));
              }}
              error={!!pwErrors.next}
              helperText={pwErrors.next}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setPwShow((s) => ({ ...s, next: !s.next }))}
                        aria-label={pwShow.next ? "Hide new password" : "Show new password"}
                      >
                        {pwShow.next ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
                htmlInput: {
                  autoComplete: "new-password",
                  "aria-label": "New password",
                },
              }}
            />
            <TextField
              size="small"
              type={pwShow.confirm ? "text" : "password"}
              label={isEditingExisting ? "Confirm New Password" : "Confirm Password"}
              required={!isEditingExisting}
              value={pwFields.confirm}
              onChange={(e) => {
                const v = e.target.value;
                setPwFields((s) => ({ ...s, confirm: v }));
                if (pwErrors.confirm) setPwErrors((p) => ({ ...p, confirm: "" }));
              }}
              error={!!pwErrors.confirm}
              helperText={pwErrors.confirm}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setPwShow((s) => ({ ...s, confirm: !s.confirm }))}
                        aria-label={pwShow.confirm ? "Hide confirm password" : "Show confirm password"}
                      >
                        {pwShow.confirm ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
                htmlInput: {
                  autoComplete: "new-password",
                  "aria-label": "Confirm password",
                },
              }}
            />

            {pwFields.next.length > 0 && (
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
                    Weak password. Must contain:
                  </Typography>
                  <Stack spacing={0.25}>
                    {[
                      { ok: pwRules.len8, text: "At least 8 characters" },
                      { ok: pwRules.num, text: "At least 1 number" },
                      { ok: pwRules.lower, text: "At least 1 lowercase letter" },
                      { ok: pwRules.upper, text: "At least 1 uppercase letter" },
                      { ok: pwRules.special, text: "At least 1 special character" },
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
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 1.25, gap: 1 }}>
          <Button onClick={requestClosePw} variant="outlined" size="small" disabled={pwSaving}>Cancel</Button>
          <Button onClick={savePasswordDialog} variant="contained" size="small" disabled={pwSaving}>
            {pwSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Security Questions sub-dialog ===== */}
      <Dialog 
        open={sqDialogOpen} 
        onClose={requestCloseSq} 
        maxWidth="sm" 
        fullWidth 
        disableAutoFocus 
        disableRestoreFocus  
        TransitionProps={{ onEnter: blurActive }} 
        PaperProps={dialogPaperGrid}
      >
        <DialogTitle sx={{ pb: 0.5 }}>Security Questions</DialogTitle>
          <DialogContent
            dividers
            sx={{
              overflowY: "auto",
              overscrollBehaviorY: "contain",
              scrollbarGutter: "stable both-edges",
            }}
          >
          <Stack spacing={2}>
            {/* Single column layout for question */}
            <FormControl fullWidth size="small" disabled={sqSaving}>
              <InputLabel>Question</InputLabel>
              <Select
                label="Question"
                value={sqFields[0].id}
                onChange={(e) => {
                  const id = e.target.value;
                  setSqFields((arr) => {
                    const next = [...arr];
                    next[0] = { ...next[0], id };
                    return next;
                  });
                }}
              >
                {Object.entries(SQ_CATALOG).map(([id, text]) => (
                  <MenuItem key={id} value={id}>
                    {text}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Single column layout for answer */}
            <TextField
              size="small"
              label="Answer"
              value={sqFields[0].answer}
              onChange={(e) => {
                const v = e.target.value;
                setSqFields((arr) => {
                  const next = [...arr];
                  next[0] = { ...next[0], answer: v };
                  return next;
                });
              }}
              fullWidth
              helperText="Not case-sensitive (we normalize)"
              disabled={sqSaving}
            />

            {!!sqError && (
              <Typography variant="caption" color="error">
                {sqError}
              </Typography>
            )}

            <Typography variant="caption" color="text.secondary">
              Tip: set a security question. The answer is securely hashed and never shown again.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 1.25, gap: 1 }}>
          {sqSaving && <CircularProgress size={18} />}
          <Button onClick={requestCloseSq} variant="outlined" size="small" disabled={sqSaving}>Cancel</Button>
          <Button onClick={saveSqDialog} variant="contained" size="small" disabled={sqSaving}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* ===== New Cashier Account (POS PIN) dialog ===== */}
      <Dialog
        open={!!createResult}
        onClose={() => {}}
        disableEscapeKeyDown
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>New Cashier Account</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.25}>
            <Typography variant="body2" color="text.secondary">
              Save these details. The ticket is shown once. If lost, generate a new one later.
            </Typography>

            {/* Enabled login IDs hint */}
            <Typography variant="caption" color="text.secondary">
              Login ID(s) enabled:{" "}
              {[
                createResult?.loginVia?.employeeId ? "Employee ID" : null,
                createResult?.loginVia?.username ? "Username" : null,
                // Email is always required on your form; backend may also allow it as alias.
                // If you track loginVia.email, show it. Otherwise assume it can be used.
                createResult?.loginVia?.email ? "Email" : "Email",
              ]
                .filter(Boolean)
                .join(", ")}
            </Typography>

            {/* 3 login identifiers */}
            <TextField
              size="small"
              label="Employee ID"
              value={createResult?.employeeId || ""}
              InputProps={{ readOnly: true }}
              fullWidth
            />

            <TextField
              size="small"
              label="Username"
              value={createResult?.username || ""}
              InputProps={{ readOnly: true }}
              helperText={createResult?.username ? undefined : "Username is required"}
              fullWidth
            />

            <TextField
              size="small"
              label="Email"
              value={createResult?.email || ""}
              InputProps={{ readOnly: true }}
              fullWidth
            />

            <Divider sx={{ my: 0.5 }} />

            <TextField
              size="small"
              label="Setup Ticket (NEW POS PIN)"
              value={createResult?.ticket?.token || ""}
              InputProps={{ readOnly: true }}
              fullWidth
            />

            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  try {
                    const exp = createResult?.ticket?.expiresAt
                      ? new Date(createResult.ticket.expiresAt).toLocaleString()
                      : "—";

                    const text =
                      `New Cashier Account\n` +
                      `Employee ID: ${createResult?.employeeId || ""}\n` +
                      `Username: ${createResult?.username || "—"}\n` +
                      `Email: ${createResult?.email || ""}\n` +
                      `Setup Ticket (NEW POS PIN): ${createResult?.ticket?.token || ""}\n` +
                      `Expires: ${exp}\n`;

                    await navigator.clipboard.writeText(text);
                    alert.success("Copied account details.");
                  } catch {
                    alert.error("Copy failed.");
                  }
                }}
              >
                Copy All
              </Button>

              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(createResult?.ticket?.token || "");
                    alert.success("Copied ticket.");
                  } catch {
                    alert.error("Copy failed.");
                  }
                }}
              >
                Copy Ticket Only
              </Button>
            </Stack>

            <Typography variant="caption" color="text.secondary">
              Expires:{" "}
              {createResult?.ticket?.expiresAt
                ? new Date(createResult.ticket.expiresAt).toLocaleString()
                : "—"}
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="contained" onClick={() => setCreateResult(null)}>
            Confirm & Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Reset Ticket (POS PIN) dialog ===== */}
      <Dialog
        open={rtOpen}
        onClose={() => {
          setRtOpen(false);
          setRtError("");
          setRtChecking(false);
          setRtGenerating(false);
          setRtData(null); // ✅ reset snapshot so next open is clean
        }}
        maxWidth="xs"
        fullWidth
        disableAutoFocus
        disableRestoreFocus
        TransitionProps={{ onEnter: blurActive }}
        PaperProps={dialogPaperGrid}
      >
        <DialogTitle sx={{ pb: 0.5 }}>Reset Ticket (POS PIN)</DialogTitle>

        <DialogContent
          dividers
          sx={{
            overflowY: "auto",
            overscrollBehaviorY: "contain",
            ...rtTypographySx,
          }}
        >
          <Stack spacing={1.5}>
            <Typography className="rt-desc" color="text.secondary">
              This generates a <b>one-time ticket</b>. Give it to the cashier so they can create a new PIN.
            </Typography>

            {!!rtError && (
              <Typography variant="body2" color="error">
                {rtError}
              </Typography>
            )}

            {rtChecking && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Checking active ticket…
                </Typography>
              </Stack>
            )}

            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Stack spacing={1}>
                {/* Always show who this ticket is for */}
                <Box>
                  <Typography className="rt-name">
                    {form.firstName} {form.lastName}
                  </Typography>

                  <Stack spacing={0.35} sx={{ mt: 0.75 }}>
                    <Typography className="rt-meta" color="text.secondary">
                      Employee ID: <b>{form.employeeId}</b>
                    </Typography>

                    <Typography className="rt-meta" color="text.secondary">
                      Username: <b>{form.username?.trim() ? form.username : "(missing)"}</b>
                    </Typography>

                    <Typography className="rt-meta" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                      Email: <b>{form.email || "—"}</b>
                    </Typography>
                  </Stack>
                  <Divider sx={{ my: 1 }} />  
                </Box>

                {/* ✅ If no ticket yet */}
                {rtData?.__metaOnly ? (
                  <>
                    <Chip
                      size="small"
                      color={isTicketActive(rtData) ? "warning" : "default"}
                      label={isTicketActive(rtData) ? "Active ticket exists" : "Expired ticket found"}
                    />

                    <Typography className="rt-note" variant="body2" color="text.secondary">
                      Expires: {rtData.expiresAt ? new Date(rtData.expiresAt).toLocaleString() : "—"}
                    </Typography>

                    <Typography className="rt-note" variant="body2" color="text.secondary">
                      The ticket code is shown only once at creation time. To get a new code, generate again
                      (this revokes the current one).
                    </Typography>

                    {/* ✅ ADD THIS: revoke even when token is not visible */}
                    {hasExistingPin && isTicketActive(rtData) && !!rtData.requestId && (
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={handleRevokeTicket}
                          disabled={rtChecking || rtGenerating}
                        >
                          Revoke
                        </Button>
                      </Stack>
                    )}
                  </>
                ) : rtData ? (
                  <>
                    <Typography className="rt-label" color="text.secondary">
                      Ticket Code
                    </Typography>

                    <TextField
                      size="small"
                      value={rtData.token || ""}
                      InputProps={{
                        readOnly: true,
                        sx: {
                          "& input": {
                            fontSize: 18,
                            fontWeight: 800,
                            letterSpacing: 1.2,
                            textAlign: "center",
                            py: 1.1, // taller input
                          },
                        },
                      }}
                      fullWidth
                    />

                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(rtData.token || "");
                            alert.success("Copied ticket.");
                          } catch {
                            alert.error("Copy failed.");
                          }
                        }}
                      >
                        Copy
                      </Button>

                      {isTicketActive(rtData) && !!rtData.requestId && (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={handleRevokeTicket}
                          disabled={rtChecking || rtGenerating}
                        >
                          Revoke
                        </Button>
                      )}
                    </Stack>

                    <Typography className="rt-note" variant="body2" color="text.secondary">
                      Expires: {rtData.expiresAt ? new Date(rtData.expiresAt).toLocaleString() : "—"}
                    </Typography>
                  </>
                ) : null}
              </Stack>
            </Paper>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 1.25, gap: 1 }}>
          <Button
            onClick={() => setRtOpen(false)}
            variant="outlined"
            size="small"
            disabled={rtChecking || rtGenerating}
          >
            Close
          </Button>

          <Button
            onClick={async () => {
              try {
                function normalizeTicket(res) {
                  return res?.ticket || res?.initialTicket || res?.data?.ticket || res?.data || res;
                }

                setRtGenerating(true);
                setRtError("");

                const res = await createPinResetTicket(form.employeeId);
                const data = normalizeTicket(res);

                if (!data?.token) {
                  throw new Error(
                    `Backend did not return token. Got keys: ${Object.keys(data || {}).join(", ") || "(empty)"}`
                  );
                }

                const hadTicket = !!rtData;
                setRtData(data);
                alert.success(hadTicket ? "New ticket generated." : "Reset ticket generated.");
              } catch (e) {
                setRtError(e?.message || "Failed to generate ticket.");
              } finally {
                setRtGenerating(false);
              }
            }}
            variant="contained"
            size="small"
            disabled={rtChecking || rtGenerating}
          >
            {rtGenerating ? "Generating..." : rtData ? "Generate Again" : "Generate Ticket"}
          </Button>
        </DialogActions>

      </Dialog>

    </Box>
  );
}