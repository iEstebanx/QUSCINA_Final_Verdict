// QUSCINA_BACKOFFICE/Frontend/src/pages/AuditTrail/AuditTrailPage.jsx
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Box,
  Paper,
  Stack,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TablePagination,
  Typography,
  MenuItem,
  Select,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Chip,
} from "@mui/material";

import PersonIcon from "@mui/icons-material/Person";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";

/* ============================================================
   AUTH STATUS LEGEND (same as your original)
   ============================================================ */
const AUTH_STATUS_LEGEND = {
  NONE: { label: "No change", color: "default" },

  LOGIN_UNKNOWN_IDENTIFIER: { label: "Unknown Login ID", color: "error" },
  LOGIN_ACCOUNT_NOT_ACTIVE: { label: "Account Not Active", color: "warning" },
  LOGIN_METHOD_DISABLED: { label: "Login Method Disabled", color: "warning" },
  LOGIN_BAD_PASSWORD: { label: "Invalid Password", color: "error" },
  LOGIN_LOCK_TEMP: { label: "Account Locked (Temp)", color: "warning" },
  LOGIN_LOCK_PERMA: { label: "Account Locked (Permanent)", color: "error" },
  LOGIN_OK: { label: "Login Successful", color: "success" },
  LOGIN_OK_BACKOFFICE_DENIED: {
    label: "Login OK (Backoffice Blocked)",
    color: "warning",
  },

  OTP_EMAIL_SENT: { label: "OTP Sent", color: "info" },
  OTP_EMAIL_RESENT: { label: "OTP Resent", color: "info" },
  OTP_COOLDOWN_ACTIVE: { label: "OTP Cooldown Active", color: "warning" },
  OTP_INVALID_OR_EXPIRED: { label: "OTP Invalid / Expired", color: "error" },
  OTP_EXPIRED: { label: "OTP Expired", color: "error" },
  OTP_BLOCKED: { label: "OTP Blocked (Too Many Attempts)", color: "error" },
  OTP_VERIFIED_RESET_ALLOWED: {
    label: "OTP Verified – Reset Allowed",
    color: "success",
  },

  SQ_FLOW_STARTED: {
    label: "Security Questions Started",
    color: "info",
  },
  SQ_VERIFIED_RESET_ALLOWED: {
    label: "Security Questions Verified – Reset Allowed",
    color: "success",
  },

  PASSWORD_RESET_SUCCESS: {
    label: "Password Reset Successful",
    color: "success",
  },
  PASSWORD_RESET_FAILED: {
    label: "Password Reset Failed",
    color: "error",
  },

  // 🔹 User Management statuses
  USER_CREATED:         { label: "User Created", color: "success" },
  USER_UPDATED:         { label: "User Updated", color: "info" },
  USER_DELETED:         { label: "User Deleted", color: "error" },
  USER_UNLOCKED:        { label: "User Unlocked", color: "info" },
  USER_PASSWORD_CHANGED:{ label: "Password Changed", color: "success" },
  USER_SQ_UPDATED:      { label: "Security Questions Updated", color: "info" },

  // Logout
  LOGOUT_OK:            { label: "Logout Successful", color: "info" },

  // 🔹 Authorization PIN settings
  PIN_SET:    { label: "PIN Set",    color: "success" },
  PIN_CHANGED:{ label: "PIN Changed",color: "success" },
  PIN_RESET:  { label: "PIN Reset",  color: "warning" },
};

/* ============================================================
   SMALL HELPER: WHAT MODULE PRODUCED THIS LOG?
   ============================================================ */
function getModuleKind(row) {
  const action = String(row?.action || "");

  // 🔐 Treat all account-credential actions as "auth"
  if (action.startsWith("Auth -")) return "auth";
  if (action.startsWith("Login")) return "auth";   // "Login - POS", "Login Failed - POS"
  if (action.startsWith("Logout")) return "auth";

  if (action.startsWith("POS -")) return "pos";

  if (
    action.startsWith("Backup") ||
    action.startsWith("Restore") ||
    action.startsWith("System")
  ) {
    return "system";
  }

  return "generic";
}

function getActionLabel(row) {
  const action = String(row?.action || "");

  // 🔹 POS / generic login failures FIRST
  if (action.startsWith("Login Failed -")) return "Login Failed";

  // 🔹 POS / generic login success
  if (action.startsWith("Login -")) return "Login Success";

  // 🔹 Backoffice auth logs: "Auth - Login Success", "Auth - Login Failed"
  if (action.startsWith("Auth - Login ")) {
    // "Auth - Login Success" -> "Login Success"
    return action.replace("Auth - ", "");
  }

  // 🔹 Some backoffice events may be "Auth - Logout"
  if (action.startsWith("Auth - Logout")) return "Logout";

  // 🔹 System-level Authorization PIN actions
  if (action.startsWith("System - Authorization PIN ")) {
    // "System - Authorization PIN Reset" -> "Authorization PIN Reset"
    return action.replace("System - ", "");
  }

  // Fallback: keep original
  return action;
}

/* ============================================================
   MAIN PAGE
   ============================================================ */
export default function AuditTrailPage() {
  const [rows, setRows] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState("All Employees");
  const [dateFilter, setDateFilter] = useState("Select Date");
  const [sourceFilter, setSourceFilter] = useState("All Sources");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;
  const [selectedRow, setSelectedRow] = useState(null);
  const [loading, setLoading] = useState(false);

  // 🔹 Apply Source filter (POS / Backoffice / All)
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (sourceFilter === "All Sources") return true;

      const raw =
        r.detail?.actionDetails?.app ||
        r.detail?.meta?.app ||
        "";

      const v = String(raw).toLowerCase();

      if (sourceFilter === "Backoffice") return v === "backoffice";
      if (sourceFilter === "POS")        return v === "pos";

      return true;
    });
  }, [rows, sourceFilter]);

  // ✅ single, reusable loader
  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);

      const res = await fetch("/api/audit-trail");
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to load logs");
      }

      if (data.ok && Array.isArray(data.data)) {
        setRows(data.data);
        setPageState((s) => ({ ...s, page: 0 })); // back to first page
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // initial load
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const moduleKind = getModuleKind(selectedRow);
  const isAuth = moduleKind === "auth";
  const isSystem = moduleKind === "system";

  const dialogTitle =
    selectedRow?.action === "POS - Void"
      ? "POS - Void Order Details"
      : selectedRow
      ? `${selectedRow.action} Details`
      : "";

  /* ============================================================
      RENDER
     ============================================================ */
  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        {/* ======================================================
            FILTER BAR
           ====================================================== */}
        <Box p={2}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            useFlexGap
            flexWrap="wrap"
            rowGap={1.5}
            columnGap={2}
          >
            {/* Left side: filters */}
            <Stack
              direction="row"
              useFlexGap
              alignItems="center"
              flexWrap="wrap"
              rowGap={1.5}
              columnGap={2}
            >
              <Select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                size="small"
                displayEmpty
                sx={{ minWidth: 220 }}
                startAdornment={
                  <InputAdornment position="start">
                    <PersonIcon fontSize="small" />
                  </InputAdornment>
                }
              >
                <MenuItem value="All Employees">All Employees</MenuItem>
                <MenuItem value="Admin">Admin</MenuItem>
                <MenuItem value="Manager">Manager</MenuItem>
                <MenuItem value="Cashier">Cashier</MenuItem>
              </Select>

              <Select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                size="small"
                displayEmpty
                sx={{ minWidth: 200 }}
                startAdornment={
                  <InputAdornment position="start">
                    <CalendarMonthIcon fontSize="small" />
                  </InputAdornment>
                }
              >
                <MenuItem value="Select Date">Select Date</MenuItem>
                <MenuItem value="Today">Today</MenuItem>
                <MenuItem value="This Week">This Week</MenuItem>
                <MenuItem value="This Month">This Month</MenuItem>
              </Select>

              {/* 🔹 NEW: Source Filter (POS / Backoffice / All) */}
              <Select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPageState((s) => ({ ...s, page: 0 })); // reset page whenever filter changes
                }}
                size="small"
                displayEmpty
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="All Sources">All Sources</MenuItem>
                <MenuItem value="Backoffice">Backoffice</MenuItem>
                <MenuItem value="POS">POS</MenuItem>
              </Select>
            </Stack>

            {/* Right side: Refresh button */}
            <Button
              variant="outlined"
              size="small"
              onClick={loadLogs}
            >
              Refresh
            </Button>
          </Stack>
        </Box>

        <Divider />

        {/* ======================================================
            TABLE
           ====================================================== */}
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{
              mx: "auto",
              width: { xs: "100%", sm: "auto" },
              maxWidth: 1100,
              borderRadius: 2,
            }}
          >
            <Table stickyHeader aria-label="audit trail table" sx={{ minWidth: 760, tableLayout: "fixed" }}>
              {/* NEW colgroup INCLUDING "Source" */}
              <colgroup>
                <col style={{ width: "18%" }} />
                <col style={{ width: "42%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography fontWeight={600}>User Role</Typography>
                  </TableCell>

                  <TableCell>
                    <Typography fontWeight={600}>Action</Typography>
                  </TableCell>

                  {/* center-aligned */}
                  <TableCell align="center">
                    <Typography fontWeight={600} sx={{ textAlign: "center" }}>
                      Timestamp
                    </Typography>
                  </TableCell>

                  <TableCell align="center">
                    <Typography fontWeight={600} sx={{ textAlign: "center" }}>
                      Source
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>

                {/* 🔄 Loading State */}
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          Loading audit logs…
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : paged.length === 0 ? (
                  
                  /* ❗Empty State */
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No audit trail records.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>

                ) : (

                  /* ✅ Normal Rows */
                  paged.map((r) => {
                    const rawSource =
                      r.detail?.actionDetails?.app ||
                      r.detail?.meta?.app ||
                      "—";

                    const sourceLabel =
                      typeof rawSource === "string" && rawSource !== "—"
                        ? rawSource.charAt(0).toUpperCase() + rawSource.slice(1)
                        : "—";

                    return (
                      <TableRow
                        key={r.id}
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() => setSelectedRow(r)}
                      >
                        {/* USER ROLE */}
                        <TableCell>{r.role || "—"}</TableCell>

                        {/* ACTION */}
                        <TableCell sx={{ overflow: "hidden" }}>
                          <Typography noWrap title={r.action}>
                            {getActionLabel(r)}
                          </Typography>
                        </TableCell>

                        {/* TIMESTAMP */}
                        <TableCell align="center">
                          <Typography
                            variant="body2"
                            sx={{ whiteSpace: "nowrap" }}
                          >
                            {r.timestamp}
                          </Typography>
                        </TableCell>

                        {/* SOURCE */}
                        <TableCell align="center">
                          <Typography variant="body2">
                            {sourceLabel}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })

                )}

              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredRows.length}
            page={page}
            onPageChange={(_, newPage) =>
              setPageState((s) => ({ ...s, page: newPage }))
            }
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) =>
              setPageState({
                page: 0,
                rowsPerPage: parseInt(e.target.value, 10),
              })
            }
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>

      {/* ======================================================
          DETAIL DIALOG - IMPROVED DESIGN
         ====================================================== */}
      <Dialog
        open={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            maxHeight: '85vh',
            overflow: "hidden",
          },
        }}
      >
        {selectedRow && (
          <>
            <DialogTitle sx={{ pb: 1, pt: 2.5, px: 3 }}>
              <Stack spacing={0.5}>
                <Typography variant="h6" fontWeight={700} component="div">
                  {dialogTitle}
                </Typography>
                {selectedRow.detail?.statusMessage && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                    {selectedRow.detail.statusMessage}
                  </Typography>
                )}
              </Stack>
            </DialogTitle>

            <DialogContent dividers className="scroll-x" sx={{ p: 0 }}>
              <Box sx={{ py: 2, px: 3 }}>
                <Grid container spacing={2}>
                  {/* ----------------------------------------------------
                      USER INFORMATION - COMPACT
                     ---------------------------------------------------- */}
                  <Grid item xs={12} md={isAuth ? 6 : 4}>
                    <Paper variant="outlined" sx={{ p: 2, height: "100%", borderRadius: 1.5 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom color="primary" sx={{ fontSize: '1rem' }}>
                        User Information
                      </Typography>

                      <Stack spacing={1.5} mt={1.5}>
                        <CompactDetailRow label="Employee" value={selectedRow.employee} />
                        <CompactDetailRow label="Role" value={selectedRow.role || "—"} />
                        <CompactDetailRow label="Timestamp" value={selectedRow.timestamp} />

                        {/* SOURCE */}
                        {(() => {
                          const raw =
                            selectedRow.detail?.actionDetails?.app ||
                            selectedRow.detail?.meta?.app ||
                            "—";
                          const label =
                            typeof raw === "string" && raw !== "—"
                              ? raw.charAt(0).toUpperCase() + raw.slice(1)
                              : "—";

                          return <CompactDetailRow label="Source" value={label} />;
                        })()}
                      </Stack>

                      {isAuth && selectedRow.detail?.affectedData?.statusChange && 
                        selectedRow.detail.affectedData.statusChange !== "NONE" && (
                          <Box mt={2}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ mb: 1, display: 'block', fontWeight: 600 }}
                            >
                              Status
                            </Typography>
                            <StatusChip detail={selectedRow.detail} isAuth={true} />
                          </Box>
                      )}
                    </Paper>
                  </Grid>

                  {/* ----------------------------------------------------
                      AFFECTED DATA - COMPACT
                     ---------------------------------------------------- */}
                  {!isAuth && (
                    <Grid item xs={12} md={4}>
                      <Paper variant="outlined" sx={{ p: 2, height: "100%", borderRadius: 1.5 }}>
                        <Typography variant="subtitle1" fontWeight={600} gutterBottom color="primary" sx={{ fontSize: '1rem' }}>
                          Affected Data
                        </Typography>

                        {isSystem ? (
                          <SystemAffectedData detail={selectedRow.detail} />
                        ) : (
                          <GenericAffectedData detail={selectedRow.detail} />
                        )}
                      </Paper>
                    </Grid>
                  )}

                  {/* ----------------------------------------------------
                      ACTION DETAILS - COMPACT
                     ---------------------------------------------------- */}
                  <Grid item xs={12} md={isAuth ? 6 : 4}>
                    <Paper variant="outlined" sx={{ p: 2, height: "100%", borderRadius: 1.5 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom color="primary" sx={{ fontSize: '1rem' }}>
                        Action Details
                      </Typography>

                      {isAuth ? (
                        <AuthActionDetails detail={selectedRow.detail} />
                      ) : isSystem ? (
                        <SystemActionDetails detail={selectedRow.detail} />
                      ) : (
                        <GenericActionDetails detail={selectedRow.detail} />
                      )}
                    </Paper>
                  </Grid>
                </Grid>
              </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button 
                variant="contained" 
                size="medium" 
                sx={{ minWidth: 100, borderRadius: 1.5 }} 
                onClick={() => setSelectedRow(null)}
              >
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

/* ============================================================
   COMPACT DETAIL ROW (more compressed)
   ============================================================ */
function CompactDetailRow({ label, value }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, py: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, fontSize: '0.75rem', fontWeight: 600 }}>
        {label}
      </Typography>

      <Typography variant="body2" fontWeight={500} sx={{ textAlign: "right", wordBreak: "break-word", fontSize: '0.8125rem' }}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

/* ============================================================
   ACTION DETAIL COMPONENTS (Updated for compact layout)
   ============================================================ */
function AuthActionDetails({ detail }) {
  const a = detail?.actionDetails || {};
  const meta = detail?.meta || {};
  const statusKey = detail?.affectedData?.statusChange;
  const legend = statusKey && AUTH_STATUS_LEGEND[statusKey];

  const loginMethodLabel =
    a.loginType === "employee_id"
      ? "Employee ID"
      : a.loginType === "username"
      ? "Username"
      : a.loginType === "email"
      ? "Email"
      : a.loginType || "login";

  const rememberRaw = a.remember ?? meta.remember;
  const rememberLabel =
    rememberRaw === true ? "Yes" :
    rememberRaw === false ? "No"  :
    "—";

  return (
    <Stack spacing={1.5} mt={1.5}>
      <CompactDetailRow label="Action Type" value={a.actionType || "login"} />
      {a.app && <CompactDetailRow label="App" value={a.app} />}
      <CompactDetailRow label="Remember Me" value={rememberLabel} />
      {a.loginType && <CompactDetailRow label="Login Method" value={loginMethodLabel} />}
      {a.identifier && <CompactDetailRow label="Login ID" value={a.identifier} />}

      {(legend?.label || a.result) && (
        <CompactDetailRow label="Result" value={legend?.label || a.result} />
      )}

      {meta.ip && <CompactDetailRow label="IP Address" value={meta.ip} />}
      {meta.userAgent && <CompactDetailRow label="Device / Browser" value={meta.userAgent} />}
    </Stack>
  );
}

function GenericActionDetails({ detail }) {
  const a = detail?.actionDetails || {};

  const showAmount = a.amount != null && a.amount !== "—";
  const showReason = !!a.reason;

  return (
    <Stack spacing={1.5} mt={1.5}>
      <CompactDetailRow label="Action Type" value={a.actionType} />

      {a.recipient && <CompactDetailRow label="Recipient" value={a.recipient} />}
      {a.receiptNo && <CompactDetailRow label="Receipt No." value={a.receiptNo} />}

      {showAmount && (
        <CompactDetailRow label="Amount Total" value={a.amount} />
      )}

      {showReason && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mb: 1, display: 'block', fontWeight: 600 }}
          >
            Reason
          </Typography>

          <Chip
            label={a.reason}
            size="small"
            sx={{
              borderRadius: 1,
              fontWeight: 600,
              fontSize: "0.75rem",
              height: '24px'
            }}
            color="primary"
            variant="outlined"
          />
        </Box>
      )}
    </Stack>
  );
}

function SystemActionDetails({ detail }) {
  const a = detail?.actionDetails || {};
  const backupJob = detail?.backupJob || {};
  const restoreJob = detail?.restoreJob || {};
  const job = backupJob.id ? backupJob : restoreJob;

  const trigger =
    a.triggerSource ||
    job.trigger_source ||
    (detail?.schedule ? "Manual" : "") ||
    "";

  const backupType = a.backupType || job.backup_type || (detail?.schedule ? "Schedule" : "");

  const sizeLabel =
    a.amount && a.amount !== "—"
      ? a.amount
      : job.size_bytes
      ? `${job.size_bytes} bytes`
      : "";

  return (
    <Stack spacing={1.5} mt={1.5}>
      <CompactDetailRow label="Action Type" value={a.actionType || job.action || "—"} />
      {backupType && <CompactDetailRow label="Backup Type" value={backupType} />}
      {trigger && <CompactDetailRow label="Trigger Source" value={trigger} />}
      {a.reference && <CompactDetailRow label="File / Reference" value={a.reference} />}
      {sizeLabel && <CompactDetailRow label="Backup Size" value={sizeLabel} />}
      {a.reason && <CompactDetailRow label="Notes" value={a.reason} />}
    </Stack>
  );
}

/* ============================================================
   AFFECTED DATA (generic + system) - COMPACT VERSION
   ============================================================ */
function GenericAffectedData({ detail }) {
  const items = detail?.affectedData?.items || [];

  return (
    <>
      <Box mt={1.5}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block', fontWeight: 600 }}>
          Items
        </Typography>

        {items.length ? (
          <Stack spacing={1}>
            {items.map((it, idx) => (
              <Box
                key={idx}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 0.75,
                  px: 1,
                  borderRadius: 0.75,
                  bgcolor: "action.hover",
                  fontSize: '0.8125rem'
                }}
              >
                <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{it.name}</Typography>
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", fontSize: '0.8125rem' }}>
            No items affected
          </Typography>
        )}
      </Box>

      {detail?.affectedData?.statusChange &&
        detail.affectedData.statusChange !== "NONE" && (
          <Box mt={2}>
            <Typography variant="caption" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>Status Change</Typography>
            <StatusChip detail={detail} isAuth={false} />
          </Box>
        )
      }
    </>
  );
}

function SystemAffectedData({ detail }) {
  const backupJob = detail?.backupJob || {};
  const restoreJob = detail?.restoreJob || {};
  const schedule = detail?.schedule || null;
  const job = backupJob.id ? backupJob : restoreJob;

  return (
    <>
      <Box mt={1.5}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>
          Status
        </Typography>
        <StatusChip detail={detail} />
      </Box>

      {job && (
        <Box mt={2}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>
            Job Details
          </Typography>

          <Stack spacing={1}>
            {job.status && <CompactDetailRow label="Job Status" value={job.status} />}
            {job.filename && <CompactDetailRow label="Filename" value={job.filename} />}
            {job.env && <CompactDetailRow label="Environment" value={job.env} />}
            {job.backup_dir && <CompactDetailRow label="Backup Directory" value={job.backup_dir} />}
          </Stack>
        </Box>
      )}

      {schedule && (
        <Box mt={2}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>
            Schedule
          </Typography>

          <Stack spacing={1}>
            <CompactDetailRow label="Frequency" value={schedule.frequency} />
            <CompactDetailRow label="Time of Day" value={schedule.time_of_day} />
            <CompactDetailRow label="Retention Days" value={String(schedule.retention_days) || "—"} />
            <CompactDetailRow label="Next Run" value={schedule.next_run_at || "—"} />
          </Stack>
        </Box>
      )}
    </>
  );
}

/* ============================================================
   STATUS CHIP - COMPACT
   ============================================================ */
function StatusChip({ detail, isAuth }) {
  const statusKey = detail?.affectedData?.statusChange;

  // 🔥 Hide completely if auth and empty status
  if (isAuth && (!statusKey || statusKey === "NONE" || statusKey === "—"))
    return null;

  const legend = AUTH_STATUS_LEGEND[statusKey] || null;

  return (
    <Chip
      label={legend?.label || statusKey}
      size="small"
      sx={{ 
        borderRadius: 1, 
        fontWeight: 600, 
        fontSize: "0.75rem",
        height: '24px'
      }}
      color={legend?.color || "default"}
      variant={legend ? "filled" : "outlined"}
    />
  );
}