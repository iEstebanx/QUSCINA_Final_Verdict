// Backoffice/Frontend/src/pages/AuditTrail/AuditTrailPage.jsx
import { useState, useMemo, useEffect } from "react";
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
};

/* ============================================================
   SMALL HELPER: WHAT MODULE PRODUCED THIS LOG?
   ============================================================ */
function getModuleKind(row) {
  const action = String(row?.action || "");

  if (action.startsWith("Auth -")) return "auth";
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

/* ============================================================
   MAIN PAGE
   ============================================================ */
export default function AuditTrailPage() {
  const [rows, setRows] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState("All Employees");
  const [dateFilter, setDateFilter] = useState("Select Date");

  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  const [selectedRow, setSelectedRow] = useState(null);

  /* ------------------------------------------------------------
     Load Logs
     ------------------------------------------------------------ */
  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      const res = await fetch("/api/audit-trail");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Failed to load logs");
      }

      const data = await res.json();
      if (data.ok && Array.isArray(data.data)) {
        setRows(data.data);
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    }
  }

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

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
                {paged.length === 0 ? (
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
                        <TableCell>{r.role || "—"}</TableCell>

                        <TableCell sx={{ overflow: "hidden" }}>
                          <Typography noWrap title={r.action}>
                            {r.action}
                          </Typography>
                        </TableCell>

                        {/* center + no wrap for nice column alignment */}
                        <TableCell align="center">
                          <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
                            {r.timestamp}
                          </Typography>
                        </TableCell>

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
            count={rows.length}
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
          DETAIL DIALOG
         ====================================================== */}
      <Dialog
        open={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            minHeight: "60vh",
          },
        }}
      >
        {selectedRow && (
          <>
            <DialogTitle sx={{ pb: 2, pt: 3 }}>
              <Typography
                variant="h5"
                component="span"        // 👈 key part – no longer <h5>
                fontWeight={700}
                gutterBottom
              >
                {dialogTitle}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {selectedRow.detail?.statusMessage}
              </Typography>
            </DialogTitle>

            <DialogContent dividers className="scroll-x" sx={{ py: 3 }}>
              <Box sx={{ minWidth: isAuth ? 760 : 980 }}>
                <Grid container spacing={3}>
                  {/* ----------------------------------------------------
                      USER INFORMATION (with NEW "Source")
                     ---------------------------------------------------- */}
                  <Grid item xs={12} md={isAuth ? 6 : 4}>
                    <Paper variant="outlined" sx={{ p: 3, height: "100%", borderRadius: 2 }}>
                      <Typography variant="h6" fontWeight={700} gutterBottom color="primary">
                        User Information
                      </Typography>

                      <Stack spacing={2.5} mt={2}>
                        <DetailRow label="Employee" value={selectedRow.employee} />
                        <DetailRow label="Role" value={selectedRow.role || "—"} />
                        <DetailRow label="Timestamp" value={selectedRow.timestamp} />

                        {/* 🔥 NEW SOURCE */}
                        {(() => {
                          const raw =
                            selectedRow.detail?.actionDetails?.app ||
                            selectedRow.detail?.meta?.app ||
                            "—";
                          const label =
                            typeof raw === "string" && raw !== "—"
                              ? raw.charAt(0).toUpperCase() + raw.slice(1)
                              : "—";

                          return <DetailRow label="Source" value={label} />;
                        })()}
                      </Stack>

                      {isAuth && (
                        <Box mt={3}>
                          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                            Status
                          </Typography>
                          <StatusChip detail={selectedRow.detail} />
                        </Box>
                      )}
                    </Paper>
                  </Grid>

                  {/* ----------------------------------------------------
                      AFFECTED DATA
                     ---------------------------------------------------- */}
                  {!isAuth && (
                    <Grid item xs={12} md={4}>
                      <Paper variant="outlined" sx={{ p: 3, height: "100%", borderRadius: 2 }}>
                        <Typography variant="h6" fontWeight={700} gutterBottom color="primary">
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
                      ACTION DETAILS
                     ---------------------------------------------------- */}
                  <Grid item xs={12} md={isAuth ? 6 : 4}>
                    <Paper variant="outlined" sx={{ p: 3, height: "100%", borderRadius: 2 }}>
                      <Typography variant="h6" fontWeight={700} gutterBottom color="primary">
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

            <DialogActions sx={{ px: 3, py: 2.5 }}>
              <Button variant="contained" size="large" sx={{ minWidth: 120, borderRadius: 2 }} onClick={() => setSelectedRow(null)}>
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
   DETAIL ROW (shared)
   ============================================================ */
function DetailRow({ label, value }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, py: 1 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ minWidth: 120 }}>
        {label}
      </Typography>

      <Typography variant="body1" fontWeight={600} sx={{ textAlign: "right", wordBreak: "break-word" }}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

/* ============================================================
   ACTION DETAIL COMPONENTS (Auth / Generic / System)
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

  return (
    <Stack spacing={2.5} mt={2}>
      <DetailRow label="Action Type" value={a.actionType || "login"} />
      {a.app && <DetailRow label="App" value={a.app} />}
      {a.loginType && <DetailRow label="Login Method" value={loginMethodLabel} />}
      {a.identifier && <DetailRow label="Login ID" value={a.identifier} />}

      <DetailRow label="Result" value={legend?.label || a.result || "—"} />

      {meta.ip && <DetailRow label="IP Address" value={meta.ip} />}
      {meta.userAgent && <DetailRow label="Device / Browser" value={meta.userAgent} />}
    </Stack>
  );
}

function GenericActionDetails({ detail }) {
  const a = detail?.actionDetails || {};

  return (
    <Stack spacing={2.5} mt={2}>
      <DetailRow label="Action Type" value={a.actionType} />

      {a.recipient && <DetailRow label="Recipient" value={a.recipient} />}
      {a.receiptNo && <DetailRow label="Receipt No." value={a.receiptNo} />}

      <DetailRow label="Amount Total" value={a.amount || "—"} />

      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          Reason
        </Typography>

        {a.reason ? (
          <Chip
            label={a.reason}
            size="medium"
            sx={{ borderRadius: 2, fontWeight: 600, px: 1, py: 1.5, fontSize: "0.875rem" }}
            color="primary"
            variant="outlined"
          />
        ) : (
          <Typography variant="body1" color="text.secondary">—</Typography>
        )}
      </Box>
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
    <Stack spacing={2.5} mt={2}>
      <DetailRow label="Action Type" value={a.actionType || job.action || "—"} />
      {backupType && <DetailRow label="Backup Type" value={backupType} />}
      {trigger && <DetailRow label="Trigger Source" value={trigger} />}
      {a.reference && <DetailRow label="File / Reference" value={a.reference} />}
      {sizeLabel && <DetailRow label="Backup Size" value={sizeLabel} />}
      {a.reason && <DetailRow label="Notes" value={a.reason} />}
    </Stack>
  );
}

/* ============================================================
   AFFECTED DATA (generic + system)
   ============================================================ */
function GenericAffectedData({ detail }) {
  const items = detail?.affectedData?.items || [];

  return (
    <>
      <Box mt={2}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Items
        </Typography>

        {items.length ? (
          <Stack spacing={1.5}>
            {items.map((it, idx) => (
              <Box
                key={idx}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 1,
                  px: 1.5,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                }}
              >
                <Typography variant="body1">{it.name}</Typography>
                <Typography variant="body1" fontWeight={700}>
                  {it.qty > 0 ? `(${it.qty}x)` : ""}
                </Typography>
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography variant="body1" color="text.secondary" sx={{ fontStyle: "italic" }}>
            No items affected
          </Typography>
        )}
      </Box>

      <Box mt={3}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          Status Change
        </Typography>
        <StatusChip detail={detail} />
      </Box>
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
      <Box mt={2}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          Status
        </Typography>
        <StatusChip detail={detail} />
      </Box>

      {job && (
        <Box mt={3}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Job Details
          </Typography>

          <Stack spacing={1.5}>
            {job.status && <DetailRow label="Job Status" value={job.status} />}
            {job.filename && <DetailRow label="Filename" value={job.filename} />}
            {job.env && <DetailRow label="Environment" value={job.env} />}
            {job.backup_dir && <DetailRow label="Backup Directory" value={job.backup_dir} />}
          </Stack>
        </Box>
      )}

      {schedule && (
        <Box mt={3}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Schedule
          </Typography>

          <Stack spacing={1.5}>
            <DetailRow label="Frequency" value={schedule.frequency} />
            <DetailRow label="Time of Day" value={schedule.time_of_day} />
            <DetailRow label="Retention Days" value={String(schedule.retention_days) || "—"} />
            <DetailRow label="Next Run" value={schedule.next_run_at || "—"} />
          </Stack>
        </Box>
      )}
    </>
  );
}

/* ============================================================
   STATUS CHIP
   ============================================================ */
function StatusChip({ detail }) {
  const statusKey = detail?.affectedData?.statusChange;
  const legend = statusKey && AUTH_STATUS_LEGEND[statusKey];

  const label = legend?.label || statusKey || "—";
  const color = legend?.color || "default";

  return (
    <Chip
      label={label}
      size="medium"
      sx={{ borderRadius: 2, fontWeight: 700, px: 2, py: 1, fontSize: "0.875rem" }}
      color={color}
      variant={color === "default" ? "outlined" : "filled"}
    />
  );
}