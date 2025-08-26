// Frontend/src/pages/Users/UserManagementPage.jsx
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
} from "@/services/Users/users";

import { useAlert } from "@/context/Snackbar/AlertContext";
import { useConfirm } from "@/context/Cancel&ConfirmDialog/ConfirmContext";

const ROLE_OPTIONS = ["Admin", "Manager", "Chef", "Cashier"];
const STATUS_OPTIONS = ["Active", "Inactive"];

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
    { id: "", answer: "" },
  ]);
  const [sqError, setSqError] = useState("");
  const [sqSaving, setSqSaving] = useState(false); // ⬅️ new: saving state for sub-dialog
  // For create flow only, remember that user staged SQs
  const [sqTouched, setSqTouched] = useState(false);

  const [pinHidden, setPinHidden] = useState(true);
  const pinRefs = Array.from({ length: 6 }).map(() => useRef(null));

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

  function nextEmployeeId(allRows) {
    const year = new Date().getFullYear();
    const base = year * 1000000;
    const nums = allRows
      .map((r) => Number(String(r.employeeId).replace(/\D/g, "")))
      .filter((n) => Number.isFinite(n));
    const max = nums.length ? Math.max(...nums) : base;
    const next = String(max + 1).padStart(9, "0");
    return next;
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

  const openDialogFor = (row) => {
    if (row) {
      // prefill SQ ids (without exposing hashes)
      const existingSQ = Array.isArray(row.securityQuestions) ? row.securityQuestions : [];
      const sqStage = existingSQ.slice(0, 2).map(q => ({ id: q.id || "", answer: "" }));
      while (sqStage.length < 2) sqStage.push({ id: "", answer: "" });

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
        pinDigits: ("".padStart(6)).split(""),
        loginVia: { ...(row.loginVia || { employeeId: true, username: true, email: true }) },
        securityQuestions: existingSQ, // for display count
      });

      setSqFields(sqStage);
    } else {
      const blank = makeBlank(rows);
      setForm(blank);
      setSqFields([
        { id: "", answer: "" },
        { id: "", answer: "" },
      ]);
    }
    setErrors({});
    setPinHidden(true);
    setPwDialogOpen(false);
    setPwFields({ current: "", next: "", confirm: "" });
    setPwErrors({ current: "", next: "", confirm: "" });
    setSqDialogOpen(false);
    setSqError("");
    setSqSaving(false);
    setSqTouched(false);

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
          pinDigits: ("".padStart(6)).split(""),
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
    if (!form.status) e.status = "Required";

    // password required on create; optional on edit
    const isEditing = rows.some((r) => String(r.employeeId) === String(form.employeeId));
    if (!isEditing || (isEditing && form.password)) {
      if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d\S]{8,}$/.test(form.password))
        e.password = "8+ chars with letters & numbers (special recommended)";
    }

    const pin = form.pinDigits.join("");
    if (!isEditing || (isEditing && pin.trim() !== "")) {
      if (!/^\d{6}$/.test(pin)) e.pin = "6 digits required";
    }

    const uname = form.username.trim().toLowerCase();
    if (uname) {
      const taken = rows.some(
        (r) => (r.username || "").toLowerCase() === uname && String(r.employeeId) !== String(form.employeeId)
      );
      if (taken) e.username = "Username already in use";
    }
    const email = form.email.trim();
    if (email) {
      if (!emailRe.test(email)) e.email = "Invalid email";
      const taken = rows.some(
        (r) => (r.email || "").toLowerCase() === email.toLowerCase() && String(r.employeeId) !== String(form.employeeId)
      );
      if (taken) e.email = "Email already in use";
    }
    const lv = form.loginVia;
    if (!lv.employeeId && !lv.username && !lv.email)
      e.loginVia = "At least one login method must be enabled";

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
      ...(form.password ? { password: form.password } : {}),
      ...(/^\d{6}$/.test(pin) ? { pin } : {}),
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

  // ===== Password dialog handlers =====
  const isEditingExisting = rows.some((r) => String(r.employeeId) === String(form.employeeId));
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
        // Backend case: "Current password is incorrect."
        setPwErrors((prev) => ({
          ...prev,
          current: e?.message || "Failed to update password.",
        }));
      } finally {
        setPwSaving(false);
      }
    })();
  }

  // ===== Security Questions dialog handlers =====
  function openSqDialog() {
    blurActive();
    setSqError("");
    initialSqRef.current = JSON.parse(JSON.stringify(sqFields));
    setSqDialogOpen(true);
  }

  function resetSqToInitial() {
    const fallback = [{ id: "", answer: "" }, { id: "", answer: "" }];
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
    // Validations
    if (filled.length > 2) {
      setSqError("You can save up to 2 questions.");
      return;
    }
    const ids = filled.map(f => f.id);
    if (new Set(ids).size !== ids.length) {
      setSqError("Please choose different questions.");
      return;
    }

    const isEditing = rows.some((r) => String(r.employeeId) === String(form.employeeId));

    // Clear all if nothing filled
    if (filled.length === 0) {
      if (isEditing) {
        try {
          setSqSaving(true);
          await updateUser(form.employeeId, { securityQuestions: [] });
          setForm((f) => ({ ...f, securityQuestions: [] }));
          setSqFields([{ id: "", answer: "" }, { id: "", answer: "" }]);
          setSqDialogOpen(false);
          alert.success("Security questions cleared.");
        } catch (e) {
          console.error(e);
          setSqError("Failed to save. Please try again.");
          alert.error(e?.message || "Failed to clear security questions.");
        } finally {
          setSqSaving(false);
        }
      } else {
        // create flow: stage as cleared
        setForm((f) => ({ ...f, securityQuestions: [] }));
        setSqFields([{ id: "", answer: "" }, { id: "", answer: "" }]);
        setSqTouched(true);
        setSqDialogOpen(false);
        alert.info("Security questions will be cleared on Save.");
      }
      return;
    }

    // Build payload with answers (backend hashes & stamps)
    const seen = new Set();
    const sqUnique = [];
    for (const q of filled) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      sqUnique.push({ id: q.id, answer: q.answer.trim() });
    }

    if (isEditing) {
      // ✅ save immediately via PATCH
      try {
        setSqSaving(true);
        await updateUser(form.employeeId, { securityQuestions: sqUnique });
        // Update the display summary (no answers)
        setForm((f) => ({
          ...f,
          securityQuestions: sqUnique.map(q => ({ id: q.id, question: SQ_CATALOG[q.id] || "Security question" }))
        }));
        // clear answers but keep selected IDs for next open
        const cleared = sqUnique.map(q => ({ id: q.id, answer: "" }));
        while (cleared.length < 2) cleared.push({ id: "", answer: "" });
        setSqFields(cleared);
        initialSqRef.current = JSON.parse(JSON.stringify(cleared));
        setSqDialogOpen(false);
        alert.success("Security questions saved.");
      } catch (e) {
        console.error(e);
        setSqError("Failed to save. Please try again.");
        alert.error(e?.message || "Failed to save security questions.");
      } finally {
        setSqSaving(false);
      }
    } else {
      // create flow: stage and close (will be sent on main Save)
      setForm((f) => ({
        ...f,
        securityQuestions: sqUnique.map(q => ({ id: q.id, question: SQ_CATALOG[q.id] || "Security question" }))
      }));
      setSqTouched(true);
      // clear answers but keep selected IDs
      const cleared = sqUnique.map(q => ({ id: q.id, answer: "" }));
      while (cleared.length < 2) cleared.push({ id: "", answer: "" });
      setSqFields(cleared);
      initialSqRef.current = JSON.parse(JSON.stringify(cleared));
      setSqDialogOpen(false);
      alert.info("Security questions will be saved on Create.");
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

  return (
    <Box p={2}>
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
            sx={{ width: "100%", borderRadius: 1, maxHeight: 520 }}
          >
            <Table
              stickyHeader
              aria-label="users table"
              className="table-auto nowrap-cells"
              sx={{ minWidth: 1024 }}
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
                        <Chip
                          size="small"
                          label={r.status}
                          color={r.status === "Active" ? "success" : "default"}
                          variant={r.status === "Active" ? "filled" : "outlined"}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Paper>

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

      {/* main dialog */}
      <Dialog
        open={open}
        onClose={requestCloseMain}
        maxWidth="md"
        fullWidth
        disableRestoreFocus
        PaperProps={{ sx: { overflow: "hidden" } }}
      >
        <DialogTitle sx={{ pb: 0.5, fontSize: 18 }}>
          {rows.some((r) => String(r.employeeId) === String(form.employeeId)) ? "Edit User" : "New User"}
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
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
                          endAdornment: (
                            <InputAdornment position="end">
                              <Switch
                                size="small"
                                checked={form.loginVia.employeeId}
                                onChange={(_, c) => {
                                  const next = { ...form.loginVia, employeeId: c };
                                  if (!next.employeeId && !next.username && !next.email) return;
                                  setForm((f) => ({ ...f, loginVia: next }));
                                }}
                              />
                            </InputAdornment>
                          ),
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
                      helperText={errors.username || "Optional — unique (lowercased)"}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))
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
                          endAdornment: (
                            <InputAdornment position="end">
                              <Switch
                                size="small"
                                checked={form.loginVia.username}
                                onChange={(_, c) => {
                                  const next = { ...form.loginVia, username: c };
                                  if (!next.employeeId && !next.username && !next.email) return; // keep at least one
                                  setForm((f) => ({ ...f, loginVia: next }));
                                }}
                              />
                            </InputAdornment>
                          ),
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
                      label="Email"
                      type="email"
                      value={form.email}
                      error={!!errors.email}
                      helperText={errors.email || "Optional — unique, valid email format"}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      slotProps={{
                        htmlInput: {
                          readOnly: !form.loginVia.email,
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
                          endAdornment: (
                            <InputAdornment position="end">
                              <Switch
                                size="small"
                                checked={form.loginVia.email}
                                onChange={(_, c) => {
                                  const next = { ...form.loginVia, email: c };
                                  if (!next.employeeId && !next.username && !next.email) return; // keep at least one method
                                  setForm((f) => ({ ...f, loginVia: next }));
                                }}
                              />
                            </InputAdornment>
                          ),
                          sx: !form.loginVia.email
                            ? { bgcolor: "action.disabledBackground" }
                            : undefined,
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

              <Grid size={{ xs: 12, md: 3 }}>
                <FormControl fullWidth error={!!errors.status} size="small">
                  <InputLabel required>Status</InputLabel>
                  <Select
                    label="Status"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* ===== Credentials ===== */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Credentials</Typography>

            <Grid container spacing={3} alignItems="center">
              {/* Password row */}
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
                        Password{rows.some((r) => String(r.employeeId) === String(form.employeeId)) ? "" : "*"}
                        {form.password ? " (staged)" : ""}
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

              {/* Security Questions row */}
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
                        {Array.isArray(form.securityQuestions) && form.securityQuestions.length > 0
                          ? `${form.securityQuestions.length} configured`
                          : "None configured"}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.25 }}>
                        Security Questions (up to 2)
                      </Typography>
                    </Box>
                  </Stack>
                  <ChevronRightOutlinedIcon fontSize="small" />
                </Paper>
                {!!sqError && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                    {sqError}
                  </Typography>
                )}
              </Grid>

              {/* PIN */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  POS PIN<span style={{ color: "#d32f2f" }}> *</span>
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="nowrap" sx={{ overflowX: "auto" }}>
                  <LockOutlinedIcon fontSize="small" />
                  <Stack direction="row" spacing={0.5}>
                    {form.pinDigits.map((d, i) => (
                      <TextField
                        key={i}
                        size="small"
                        inputRef={pinRefs[i]}
                        value={pinHidden && d ? "•" : d}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(-1);
                          setForm((f) => {
                            const arr = [...f.pinDigits];
                            arr[i] = v;
                            return { ...f, pinDigits: arr };
                          });
                          if (v && i < 5) pinRefs[i + 1].current?.focus();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !form.pinDigits[i] && i > 0) {
                            pinRefs[i - 1].current?.focus();
                          }
                        }}
                        slotProps={{
                          htmlInput: {
                            inputMode: "numeric",
                            pattern: "[0-9]*",
                            maxLength: 1,
                            style: { textAlign: "center", width: 28 },
                            "aria-label": `PIN digit ${i + 1}`,
                          },
                        }}
                        sx={{ "& .MuiInputBase-input": { p: "8px 6px" }, width: 34 }}
                      />
                    ))}
                  </Stack>
                  <Tooltip title={pinHidden ? "Show" : "Hide"}>
                    <IconButton size="small" onClick={() => setPinHidden((v) => !v)}>
                      {pinHidden ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                    </IconButton>
                  </Tooltip>
                </Stack>
                {errors.pin && <Typography variant="caption" color="error">{errors.pin}</Typography>}
              </Grid>
            </Grid>

            {errors.loginVia && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                {errors.loginVia}
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 1.5 }}>
          <Button onClick={requestCloseMain} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleSave} variant="contained" size="small">Save</Button>
        </DialogActions>
      </Dialog>

      {/* ===== Change Password sub-dialog ===== */}
      <Dialog open={pwDialogOpen} onClose={requestClosePw} maxWidth="xs" fullWidth disableAutoFocus disableRestoreFocus  TransitionProps={{ onEnter: blurActive }}>
        <DialogTitle sx={{ pb: 0.5 }}>Change Password</DialogTitle>
        <DialogContent dividers>
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
      <Dialog open={sqDialogOpen} onClose={requestCloseSq} maxWidth="sm" fullWidth disableAutoFocus disableRestoreFocus  TransitionProps={{ onEnter: blurActive }}>
        <DialogTitle sx={{ pb: 0.5 }}>Security Questions (up to 2)</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {[0,1].map((idx) => (
              <Grid key={idx} container spacing={1.5} alignItems="center">
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth size="small" disabled={sqSaving}>
                    <InputLabel>Question {idx+1}</InputLabel>
                    <Select
                      label={`Question ${idx+1}`}
                      value={sqFields[idx].id}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSqFields((arr) => {
                          const next = [...arr];
                          next[idx] = { ...next[idx], id };
                          return next;
                        });
                      }}
                    >
                      {Object.entries(SQ_CATALOG).map(([id, text]) => {
                        const takenByOther = selectedSqIds.includes(id) && sqFields[idx].id !== id;
                        return (
                          <MenuItem key={id} value={id} disabled={takenByOther}>
                            {text}
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    size="small"
                    label={`Answer ${idx+1}`}
                    value={sqFields[idx].answer}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSqFields((arr) => {
                        const next = [...arr];
                        next[idx] = { ...next[idx], answer: v };
                        return next;
                      });
                    }}
                    fullWidth
                    helperText="Not case-sensitive (we normalize)"
                    disabled={sqSaving}
                  />
                </Grid>
              </Grid>
            ))}

            {!!sqError && <Typography variant="caption" color="error">{sqError}</Typography>}

            <Typography variant="caption" color="text.secondary">
              Tip: set two distinct questions. Answers are securely hashed and never shown again.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 1.25, gap: 1 }}>
          {sqSaving && <CircularProgress size={18} />}
          <Button onClick={requestCloseSq} variant="outlined" size="small" disabled={sqSaving}>Cancel</Button>
          <Button onClick={saveSqDialog} variant="contained" size="small" disabled={sqSaving}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}