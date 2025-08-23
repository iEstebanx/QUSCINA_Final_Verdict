// src/pages/Users/UserManagementPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Paper, Stack, Button, IconButton, TextField, InputAdornment,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Select, FormControl, InputLabel, Tooltip, Switch,
  LinearProgress, Grid, Divider
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
import { Avatar } from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";

// 🔗 services
import {
  subscribeUsers,
  createUser,
  updateUser,
} from "@/services/Users/users";

const ROLE_OPTIONS = ["Admin", "Manager", "Chef", "Cashier"];
const STATUS_OPTIONS = ["Active", "Inactive"];

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
  const [rows, setRows] = useState([]);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [open, setOpen] = useState(false);

  // === Password sub-dialog state ===
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [pwShow, setPwShow] = useState({ current: false, next: false, confirm: false });
  const [pwFields, setPwFields] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");

  const [pinHidden, setPinHidden] = useState(true);
  const pinRefs = Array.from({ length: 6 }).map(() => useRef(null));

  useEffect(() => {
    const unsub = subscribeUsers(({ rows }) => setRows(rows));
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
        password: "", // nothing staged initially
        passwordLastChanged: row.passwordLastChanged || "—",
        pinDigits: ("".padStart(6)).split(""),
        loginVia: { ...(row.loginVia || { employeeId: true, username: true, email: true }) },
      });
    } else {
      setForm(makeBlank(rows));
    }
    setErrors({});
    setPinHidden(true);
    setPwDialogOpen(false);
    setPwFields({ current: "", next: "", confirm: "" });
    setPwError("");
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
    };

    if (form.password) payload.password = form.password; // staged by password dialog
    if (/^\d{6}$/.test(pin)) payload.pin = pin;

    const isEditing = rows.some((r) => String(r.employeeId) === String(form.employeeId));

    try {
      if (isEditing) {
        await updateUser(form.employeeId, payload); // PATCH
      } else {
        await createUser(payload); // POST
      }
      setOpen(false);
    } catch (e) {
      console.error(e);
      // TODO: show toast/snackbar
    }
  };

  // ===== Password dialog handlers =====
  const isEditingExisting = rows.some((r) => String(r.employeeId) === String(form.employeeId));
  const pwScore = scorePassword(pwFields.next);
  const pwRules = ruleChecks(pwFields.next);

  function openPasswordDialog() {
    setPwFields({ current: "", next: "", confirm: "" });
    setPwError("");
    setPwShow({ current: false, next: false, confirm: false });
    setPwDialogOpen(true);
  }

  function savePasswordDialog() {
    // basic client-side checks
    if (isEditingExisting && !pwFields.current.trim()) {
      setPwError("Please enter your current password.");
      return;
    }
    if (!pwFields.next || pwFields.next.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (pwFields.next !== pwFields.confirm) {
      setPwError("New password and confirmation do not match.");
      return;
    }
    // Stage into the main form; do not persist yet
    setForm((f) => ({ ...f, password: pwFields.next }));
    setPwDialogOpen(false);
  }

  return (
    <Box p={2}>
      {/* top bar */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ sm: "center" }}
        justifyContent="space-between"
        spacing={1}
        mb={1.5}
      >
        <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => openDialogFor(null)}>
          Add User
        </Button>
        <TextField
          placeholder="Search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          sx={{ width: 320, maxWidth: "100%" }}
          size="small"
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
      </Stack>

      {/* table */}
      <Paper sx={{ p: 0.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 120 }}>Employee ID</TableCell>
              <TableCell sx={{ width: 140 }}>Username</TableCell>
              <TableCell sx={{ width: 220 }}>Email</TableCell>
              <TableCell sx={{ width: 160 }}>First Name</TableCell>
              <TableCell sx={{ width: 160 }}>Last Name</TableCell>
              <TableCell sx={{ width: 140 }}>Phone</TableCell>
              <TableCell sx={{ width: 110 }}>Role</TableCell>
              <TableCell sx={{ width: 110 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {slice.map((r) => (
              <TableRow key={r.id || r.employeeId} hover onClick={() => openDialogFor(r)} sx={{ cursor: "pointer" }}>
                <TableCell>{r.employeeId}</TableCell>
                <TableCell>{r.username}</TableCell>
                <TableCell>{r.email}</TableCell>
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
            ))}
            {slice.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary" align="center" py={3}>No users found</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
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
                      InputProps={{
                        readOnly: true,
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
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                      disabled={!form.loginVia.username}
                      InputProps={{
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
                                if (!next.employeeId && !next.username && !next.email) return;
                                setForm((f) => ({ ...f, loginVia: next }));
                              }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>

                  {/* Email */}
                  <Grid size={{ xs: 12 }} sx={{ minWidth: 0 }}>
                    <TextField
                      sx={{ width: 300 }}
                      size="small"
                      label="Email"
                      value={form.email}
                      error={!!errors.email}
                      helperText={errors.email || "Optional — unique, valid email format"}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      disabled={!form.loginVia.email}
                      InputProps={{
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
                                if (!next.employeeId && !next.username && !next.email) return;
                                setForm((f) => ({ ...f, loginVia: next }));
                              }}
                            />
                          </InputAdornment>
                        ),
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
                  label={<>First Name<span style={{ color: "#d32f2f" }}> *</span></>}
                  value={form.firstName}
                  error={!!errors.firstName}
                  helperText={errors.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  fullWidth
                  InputProps={{ startAdornment: <InputAdornment position="start"><PersonOutlineIcon fontSize="small" /></InputAdornment> }}
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

            {/* Password row (clickable) */}
            <Grid container spacing={3} alignItems="center">
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
                  <ChevronRightIcon fontSize="small" />
                </Paper>
                {errors.password && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                    {errors.password}
                  </Typography>
                )}
              </Grid>

              {/* PIN (unchanged) */}
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
                        inputProps={{
                          inputMode: "numeric",
                          pattern: "[0-9]*",
                          maxLength: 1,
                          style: { textAlign: "center", width: 28 }
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
          <Button onClick={() => setOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleSave} variant="contained" size="small">Save</Button>
        </DialogActions>
      </Dialog>

      {/* ===== Change Password sub-dialog ===== */}
      <Dialog
        open={pwDialogOpen}
        onClose={() => setPwDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 0.5 }}>Change Password</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            {isEditingExisting && (
              <TextField
                size="small"
                type={pwShow.current ? "text" : "password"}
                label="Current Password"
                value={pwFields.current}
                onChange={(e) => setPwFields((s) => ({ ...s, current: e.target.value }))}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setPwShow((s) => ({ ...s, current: !s.current }))}>
                        {pwShow.current ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            )}

            {/* For both new user & edit: New + Confirm */}
            <TextField
              size="small"
              type={pwShow.next ? "text" : "password"}
              label={isEditingExisting ? "New Password" : "New Password *"}
              value={pwFields.next}
              onChange={(e) => setPwFields((s) => ({ ...s, next: e.target.value }))}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setPwShow((s) => ({ ...s, next: !s.next }))}>
                      {pwShow.next ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              size="small"
              type={pwShow.confirm ? "text" : "password"}
              label={isEditingExisting ? "Confirm New Password" : "Confirm Password *"}
              value={pwFields.confirm}
              onChange={(e) => setPwFields((s) => ({ ...s, confirm: e.target.value }))}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setPwShow((s) => ({ ...s, confirm: !s.confirm }))}>
                      {pwShow.confirm ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
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

            {!!pwError && (
              <Typography variant="caption" color="error">
                {pwError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 1.25 }}>
          <Button onClick={() => setPwDialogOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={savePasswordDialog} variant="contained" size="small">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}