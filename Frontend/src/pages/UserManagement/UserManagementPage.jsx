// Frontend/src/pages/UserManagement/UserManagementPage.jsx
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
} from "@/services/Users/users";

import { useAlert } from "@/context/Snackbar/AlertContext";
import { useConfirm } from "@/context/Cancel&ConfirmDialog/ConfirmContext";

const ROLE_OPTIONS = ["Admin", "Manager", "Cashier"];

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

  // Admin / Manager = Backoffice lock
  if (role === "Admin" || role === "Manager") {
    if (states.backoffice) {
      return isLockedState(states.backoffice);
    }
    // fallback to legacy if no per-app record
    return legacyLocked;
  }

  // Cashier = Cashier-POS lock
  if (role === "Cashier") {
    if (states.pos) {
      return isLockedState(states.pos);
    }
    // fallback to legacy if no per-app record
    return legacyLocked;
  }

  // Other roles (if any) – no lock-based override
  return false;
}

export default function UserManagementPage() {
  const alert = useAlert();
  const confirm = useConfirm();

  const [rows, setRows] = useState([]);

  // snapshots to compare for dirty checks
  const initialMainRef = useRef(null);    // pristine state for main dialog
  const initialSqRef = useRef(null);      // pristine state for SQ sub-dialog
  const initialPwRef = useRef(null);      // pristine state for PW sub-dialog

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [open, setOpen] = useState(false);

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

    // 🔢 PIN (role-aware)
    const pin = form.pinDigits.join("");
    if (needsPin) {
      if (!isEditing || (isEditing && pin.trim() !== "")) {
        if (!/^\d{6}$/.test(pin)) e.pin = "6 digits required";
      }
    }

    const uname = form.username.trim().toLowerCase();
    if (uname) {
      const taken = rows.some(
        (r) => (r.username || "").toLowerCase() === uname && String(r.employeeId) !== String(form.employeeId)
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
      // Only include password if present AND role actually uses it
      ...(needsPassword && form.password ? { password: form.password } : {}),
      // Only include PIN if role uses PIN and it's a valid 6-digit value
      ...(needsPin && /^\d{6}$/.test(pin) ? { pin } : {}),
    };

    const isEditing = rows.some((r) => String(r.employeeId) === String(form.employeeId));

    // For CREATE flow only, include any staged SQs from the SQ dialog
    if (!isEditing && sqTouched) {
      const filled = sqFields.filter(q => q.id && q.answer.trim()).slice(0, 2);
      const seen = new Set();
      const sqUnique = [];
      for (const q of filled) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        sqUnique.push({ id: q.id, answer: q.answer.trim() });
      }
      payload.securityQuestions = sqUnique; // or [] if user saved "clear" during create
    }

    try {
      if (isEditing) {
        await updateUser(form.employeeId, payload); // PATCH
        alert.success("User updated.");
      } else {
        await createUser(payload); // POST
        alert.success("User created.");
      }
      setOpen(false);
    } catch (e) {
      console.error(e);
      alert.error(e?.message || "Failed to save user.");
    }
  };

  // ===== Password dialog helpers =====
  const isEditingExisting = rows.some((r) => String(r.employeeId) === String(form.employeeId));
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

  async function handleRowDelete(row) {
    if (rows.length <= 1) {
      alert.info("You must keep at least one user account.");
      return;
    }
    const ok = await confirm({
      title: "Delete this user?",
      content: `This will permanently remove ${row.firstName || ""} ${row.lastName || ""} (${row.employeeId}).`,
      confirmLabel: "Delete",
      confirmColor: "error",
    });
    if (!ok) return;

    try {
      await deleteUser(row.employeeId);
      alert.success("User deleted.");
    } catch (e) {
      console.error(e);
      alert.error(e?.message || "Failed to delete user.");
    }
  }

  /* ============================
     🔴 DELETE helpers (dialog)
     ============================ */
  const isOnlyRemaining = rows.length <= 1;
  const canDeleteAny = rows.length > 1;

  async function handleDelete() {
    if (!isEditingExisting) return;
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
            sx={{ width: "100%", borderRadius: 1, maxHeight: 520, overflowX: "auto" }}
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
              <Grid size={{ xs: 12, md: "auto" }} sx={{ width: { md: 280 }, flexShrink: 0 }}>
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
                          const url = URL.createObjectURL(file);
                          setForm((f) => ({ ...f, photoUrl: url }));
                        }}
                      />
                      <label htmlFor="user-photo-input">
                        <Button component="span" size="small" startIcon={<PhotoCameraOutlinedIcon />} variant="outlined">
                          Upload
                        </Button>
                      </label>
                      {form.photoUrl && (
                        <Button size="small" color="error" onClick={() => setForm((f) => ({ ...f, photoUrl: "" }))}>
                          Remove
                        </Button>
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">JPG/PNG</Typography>
                  </Stack>
                </Paper>
              </Grid>

              {/* RIGHT: Employee ID / Username / Email */}
              <Grid size={{ xs: true }} sx={{ minWidth: 0 }}>
                <Grid container spacing={1.5}>
                  {/* Employee ID */}
                  <Grid size={{ xs: 12 }}>
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
                  <Grid size={{ xs: 12 }} sx={{ minWidth: 0 }}>
                    <TextField
                      sx={{ width: 300 }}
                      size="small"
                      label="Username"
                      value={form.username}
                      error={!!errors.username}
                      helperText={errors.username || "Optional — must be unique"}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, username: e.target.value }))
                      }
                      slotProps={{
                        htmlInput: {
                          readOnly: !form.loginVia.username,
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
                          sx: !form.loginVia.username
                            ? { bgcolor: "action.disabledBackground" }
                            : undefined,
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
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
              <Grid size={{ xs: 12, md: 6 }}>
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
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
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
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  size="small"
                  label={<>Last Name<span style={{ color: "#d32f2f" }}> *</span></>}
                  value={form.lastName}
                  error={!!errors.lastName}
                  helperText={errors.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  fullWidth
                />
              </Grid>
            </Grid>

            {/* ===== Contact & Access ===== */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Contact & Access</Typography>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 4 }}>
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
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    {ROLE_OPTIONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>

            </Grid>

            {/* ===== Credentials ===== */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Credentials</Typography>

            <Grid container spacing={3} alignItems="center">
              {/* Password row (hidden for Cashier) */}
              {needsPassword && (
                <Grid size={{ xs: 12, md: 6 }}>
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
                      minHeight: 46,
                    }}
                  >
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <LockOutlinedIcon fontSize="small" />
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                          {`Last added/changed: ${formatLastChanged(form.passwordLastChanged)}`}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.25 }}>
                          Password
                          {rows.some((r) => String(r.employeeId) === String(form.employeeId)) ? "" : "*"}
                          {form.password ? " (staged)" : ""}
                          {form.role === "Cashier" && " (not required for Cashier)"}
                        </Typography>
                      </Box>
                    </Stack>
                    <ChevronRightOutlinedIcon fontSize="small" />
                  </Paper>
                  {errors.password && (
                    <Typography
                      variant="caption"
                      color="error"
                      sx={{ mt: 0.5, display: "block" }}
                    >
                      {errors.password}
                    </Typography>
                  )}
                </Grid>
              )}

              {/* Security Questions row – unchanged, still available for everyone */}
              {form.role !== "Cashier" && (
                <Grid size={{ xs: 12, md: 6 }}>
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
                      minHeight: 46,
                    }}
                  >
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <HelpOutlineOutlinedIcon fontSize="small" />
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                          {hasExistingSq
                            ? "Question and Answer configured"
                            : "None configured"}
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

              {/* POS PIN row */}
              {needsPin && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper
                    variant="outlined"
                    onClick={openPinDialog}
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
                          {hasStagedPin
                            ? (isEditingExisting
                                ? "New PIN staged — will be saved when you click Save"
                                : "PIN set — will be saved when you create this user")
                            : isEditingExisting
                            ? (hasExistingPin
                                ? "PIN configured — tap to change"
                                : "No PIN configured yet — tap to set")
                            : "Required before saving this user"}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.25 }}>
                          POS PIN
                          {!isEditingExisting && <span style={{ color: "#d32f2f" }}> *</span>}
                        </Typography>
                      </Box>
                    </Stack>
                    <ChevronRightOutlinedIcon fontSize="small" />
                  </Paper>
                  {errors.pin && (
                    <Typography
                      variant="caption"
                      color="error"
                      sx={{ mt: 0.5, display: "block" }}
                    >
                      {errors.pin}
                    </Typography>
                  )}
                </Grid>
              )}
            </Grid>

            {/* ===== Security & Lock ===== */}
            {isEditingExisting && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Security & Lock
                </Typography>

                <Grid container spacing={2} alignItems="flex-start">
                  <Grid size={{ xs: 12, md: 8 }}>
                    {(() => {
                      const row = rows.find(
                        (r) => String(r.employeeId) === String(form.employeeId)
                      );
                      if (!row) {
                        return (
                          <Typography variant="body2" color="text.secondary">
                            No lock info.
                          </Typography>
                        );
                      }

                      // --- helpers
                      const now = Date.now();
                      const LOCK_THRESHOLD = 3;

                      const isLockedState = (s) => {
                        if (!s) return false;
                        const perm = !!s.permanentLock;
                        const temp = s.lockUntil
                          ? new Date(s.lockUntil).getTime() > now
                          : false;
                        const fail = Number(s.failedLoginCount || 0) >= LOCK_THRESHOLD;
                        return perm || temp || fail;
                      };

                      // Legacy/global (migration-only)
                      const legacyTemp = row.lockUntil
                        ? new Date(row.lockUntil).getTime() > now
                        : false;
                      const legacyPerm = !!row.permanentLock;
                      const legacyFail = Number(row.failedLoginCount || 0) >= LOCK_THRESHOLD;
                      const legacyLocked = legacyTemp || legacyPerm || legacyFail;

                      // ── Per-app states = source of truth (role-aware)
                      const userRole = form.role;

                      const shouldShowApp = (appKey) => {
                        // Cashier: hide Backoffice
                        if (userRole === "Cashier") {
                          return appKey !== "backoffice";
                        }
                        // Admin / Manager: hide Cashier POS (pos)
                        if (userRole === "Admin" || userRole === "Manager") {
                          return appKey !== "pos";
                        }
                        // Fallback: show everything
                        return true;
                      };

                      const rawEntries = Object.entries(row.lockStates || {});
                      const entries = rawEntries.filter(([appKey]) => shouldShowApp(appKey));

                      // Which *visible* apps are locked?
                      const lockedApps = entries
                        .filter(([_, s]) => isLockedState(s))
                        .map(([k]) => k);

                      // Show legacy row ONLY if we have no per-app states from backend AND it’s locked
                      const showLegacy = rawEntries.length === 0 && legacyLocked;

                      // Primary action
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
                              target === "pos"
                                ? "Cashier-POS"
                                : target === "backoffice"
                                ? "Backoffice"
                                : target
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
                            content:
                              "This clears locks and failed attempts for every system.",
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
                                          {
                                            failedLoginCount: 0,
                                            lockUntil: null,
                                            permanentLock: 0,
                                            lastFailedLogin: null,
                                          },
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
                            await unlockUser(form.employeeId, {}); // backend clears legacy without app/scope
                            setRows((prev) =>
                              prev.map((r) =>
                                String(r.employeeId) === String(form.employeeId)
                                  ? {
                                      ...r,
                                      failedLoginCount: 0,
                                      lockUntil: null,
                                      permanentLock: false,
                                    }
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
                        if (key === "pos") return "Cashier-POS";
                        if (key === "backoffice") return "Backoffice";
                        return key
                          .replace(/[-_]/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase());
                      };

                      return (
                        <>
                          {/* Smart primary action */}
                          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                            <Button
                              variant="contained"
                              color={primaryDisabled ? "inherit" : "warning"}
                              size="small"
                              disabled={primaryDisabled}
                              onClick={primaryOnClick}
                            >
                              {primaryLabel}
                            </Button>
                          </Stack>

                          {/* Per-system rows (compact, 2-up per row) */}
                          {entries.length ? (
                            <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
                              <Grid container spacing={1} alignItems="stretch">
                                {entries.map(([appKey, s]) => {
                                  const untilMs = s.lockUntil
                                    ? new Date(s.lockUntil).getTime()
                                    : 0;
                                  const tempLocked = untilMs > now;
                                  const permLocked = !!s.permanentLock;
                                  const failLocked =
                                    Number(s.failedLoginCount || 0) >= LOCK_THRESHOLD;
                                  const locked = permLocked || tempLocked || failLocked;

                                  return (
                                    <Grid key={appKey} size={{ xs: 12, sm: 6 }}>
                                      <Box
                                        sx={{
                                          p: 1,
                                          height: "100%",
                                          borderRadius: 1,
                                          border: "1px solid",
                                          borderColor: "divider",
                                        }}
                                      >
                                        <Stack
                                          direction="row"
                                          alignItems="center"
                                          spacing={1}
                                          flexWrap="wrap"
                                        >
                                          <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 600, mr: 1 }}
                                          >
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
                                            <Typography
                                              variant="body2"
                                              color="text.secondary"
                                              sx={{ ml: 1 }}
                                            >
                                              until {new Date(untilMs).toLocaleString()}
                                            </Typography>
                                          )}

                                          <Box sx={{ flex: 1 }} />
                                        </Stack>
                                      </Box>
                                    </Grid>
                                  );
                                })}
                              </Grid>
                            </Paper>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              No per-system lock states found.
                            </Typography>
                          )}

                          {/* Legacy row only in migration edge-case (and only when locked) */}
                          {showLegacy && (
                            <Paper variant="outlined" sx={{ p: 1, mt: 1 }}>
                              <Stack
                                direction="row"
                                alignItems="center"
                                spacing={1}
                                flexWrap="wrap"
                              >
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 600, mr: 1 }}
                                >
                                  Legacy/Global
                                </Typography>
                                <Chip
                                  size="small"
                                  label="LOCKED"
                                  color="error"
                                  variant="filled"
                                />
                                {legacyTemp && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ ml: 1 }}
                                  >
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
            <Tooltip title={isOnlyRemaining ? "You must keep at least one user" : "Delete this user"}>
              <span>
                <Button
                  onClick={handleDelete}
                  color="error"
                  variant="outlined"
                  size="small"
                  disabled={isOnlyRemaining}
                  sx={{ mr: "auto" }} // pushes the others to the right
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

      {/* ===== POS PIN sub-dialog ===== */}
      <Dialog
        open={pinDialogOpen}
        onClose={() => setPinDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        disableAutoFocus
        disableRestoreFocus
        TransitionProps={{ onEnter: blurActive }}
        PaperProps={dialogPaperGrid}
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          {pinDialogMode === "change" ? "Change POS PIN" : "Set POS PIN"}
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            overflowY: "auto",
            overscrollBehaviorY: "contain",
            scrollbarGutter: "stable both-edges",
          }}
        >
          <Stack spacing={2}>
            {/* New PIN row */}
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                New PIN
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="nowrap">
                <LockOutlinedIcon fontSize="small" />
                <Stack direction="row" spacing={0.5}>
                  {pinFields.newDigits.map((d, i) => {
                    const visible = pinVisibility.next;
                    return (
                      <TextField
                        key={i}
                        size="small"
                        inputRef={pinNextRefs[i]}
                        value={visible ? d : d ? "•" : ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(-1);
                          setPinFields((prev) => {
                            const arr = [...prev.newDigits];
                            arr[i] = v;
                            return { ...prev, newDigits: arr };
                          });
                          if (v && i < 5) pinNextRefs[i + 1].current?.focus();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !pinFields.newDigits[i] && i > 0) {
                            pinNextRefs[i - 1].current?.focus();
                          }
                        }}
                        slotProps={{
                          htmlInput: {
                            inputMode: "numeric",
                            pattern: "[0-9]*",
                            maxLength: 1,
                            style: { textAlign: "center", width: 28 },
                            "aria-label": `New PIN digit ${i + 1}`,
                          },
                        }}
                        sx={{ "& .MuiInputBase-input": { p: "8px 6px" }, width: 34 }}
                      />
                    );
                  })}
                </Stack>
                <Tooltip title={pinVisibility.next ? "Hide PIN" : "Show PIN"}>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setPinVisibility((prev) => ({ ...prev, next: !prev.next }))
                    }
                  >
                    {pinVisibility.next ? (
                      <VisibilityOutlinedIcon />
                    ) : (
                      <VisibilityOffOutlinedIcon />
                    )}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            {/* Confirm PIN row */}
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Confirm new PIN
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="nowrap">
                <LockOutlinedIcon fontSize="small" />
                <Stack direction="row" spacing={0.5}>
                  {pinFields.confirmDigits.map((d, i) => {
                    const visible = pinVisibility.confirm;
                    return (
                      <TextField
                        key={i}
                        size="small"
                        inputRef={pinConfirmRefs[i]}
                        value={visible ? d : d ? "•" : ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(-1);
                          setPinFields((prev) => {
                            const arr = [...prev.confirmDigits];
                            arr[i] = v;
                            return { ...prev, confirmDigits: arr };
                          });
                          if (v && i < 5) pinConfirmRefs[i + 1].current?.focus();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !pinFields.confirmDigits[i] && i > 0) {
                            pinConfirmRefs[i - 1].current?.focus();
                          }
                        }}
                        slotProps={{
                          htmlInput: {
                            inputMode: "numeric",
                            pattern: "[0-9]*",
                            maxLength: 1,
                            style: { textAlign: "center", width: 28 },
                            "aria-label": `Confirm PIN digit ${i + 1}`,
                          },
                        }}
                        sx={{ "& .MuiInputBase-input": { p: "8px 6px" }, width: 34 }}
                      />
                    );
                  })}
                </Stack>
                <Tooltip title={pinVisibility.confirm ? "Hide PIN" : "Show PIN"}>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setPinVisibility((prev) => ({
                        ...prev,
                        confirm: !prev.confirm,
                      }))
                    }
                  >
                    {pinVisibility.confirm ? (
                      <VisibilityOutlinedIcon />
                    ) : (
                      <VisibilityOffOutlinedIcon />
                    )}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            <Typography variant="caption" color="text.secondary">
              Use a 6-digit numeric PIN. Avoid obvious patterns like 000000 or 123456.
            </Typography>

            {pinError && (
              <Typography variant="body2" color="error">
                {pinError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 1.25, gap: 1 }}>
          <Button
            onClick={() => setPinDialogOpen(false)}
            variant="outlined"
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={savePinDialog}
            variant="contained"
            size="small"
          >
            Save PIN
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}