// Frontend/src/pages/Settings/BackupAndRestorePage/BackupAndRestorePage.jsx
import { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Button,
  Divider,
  TextField,
  InputAdornment,
  IconButton,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  FormControlLabel,
  Radio,
  Tooltip,
  Grid,
  Card,
  CardContent,
} from "@mui/material";

import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import SearchIcon from "@mui/icons-material/Search";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RestoreIcon from "@mui/icons-material/Restore";
import BackupIcon from "@mui/icons-material/Backup";
import ScheduleIcon from "@mui/icons-material/Schedule";
import HistoryIcon from "@mui/icons-material/History";

const MOCK_LAST_BACKUP = "Tue, May 23, 2025 - 11:30 PM - Full - 0.3 MB";
const MOCK_NEXT_SCHEDULE = "Daily at 10:00 PM";

const MOCK_BACKUPS = [
  {
    id: 1,
    dateTime: "Tuesday · April 29, 2025 · 11:30 PM",
    filename: "backup-04-29-2025_11-30PM.sql",
    size: "0.6 MB",
  },
  {
    id: 2,
    dateTime: "Sunday · April 27, 2025 · 11:23 PM",
    filename: "backup-04-27-2025_11-23PM.sql",
    size: "0.2 MB",
  },
];

const MOCK_ACTIVITIES = [
  "Backup completed successfully on Mar 16, 2025",
  "Restore initiated on Feb 01, 2025",
  "Restore initiated on Feb 01, 2025",
  "Restore initiated on Feb 01, 2025",
  "Restore initiated on Feb 01, 2025",
];

export default function BackupAndRestorePage() {
  const [view, setView] = useState("summary"); // summary | backup | restore | schedule | activities

  // Restore table state (similar layout to CategoriePage)
  const [backups] = useState(MOCK_BACKUPS);
  const [search, setSearch] = useState("");
  const [loadingBackups] = useState(false);
  const [backupsErr] = useState("");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  const [restoreTarget, setRestoreTarget] = useState(null);

  // Backup now
  const [backupType, setBackupType] = useState("full");
  const [backupNotes, setBackupNotes] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupErr, setBackupErr] = useState("");

  // Schedule state
  const [scheduleFreq, setScheduleFreq] = useState("daily");
  const [scheduleTime, setScheduleTime] = useState("10:00 PM");
  const [retentionDays, setRetentionDays] = useState("");

  const handleStartBackup = async () => {
    setBackupErr("");
    setBackupLoading(true);
    try {
      const res = await fetch(
        "/api/settings/backup-and-restore/backup-now",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            backupType,              // "full" for now
            notes: backupNotes || null,
            // later you can pass employeeId from auth context
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.message || "Backup failed");
      }

      const data = await res.json();
      console.log("Backup OK:", data);

      // better feedback
      alert(
        `Backup created:\n${data.filename}\n\nLocation:\n${data.fullPath || data.dir || "(path not returned)"}`
      );

      // optional: go back to summary or refresh backups list
      setView("summary");
    } catch (err) {
      console.error(err);
      setBackupErr(err.message || "Backup failed");
    } finally {
      setBackupLoading(false);
    }
  };

  /* ------------------------------ Derived data ------------------------------ */

  const filteredBackups = useMemo(() => {
    if (!search.trim()) return backups;
    const q = search.toLowerCase();
    return backups.filter(
      (b) =>
        b.filename.toLowerCase().includes(q) ||
        b.dateTime.toLowerCase().includes(q) ||
        b.size.toLowerCase().includes(q)
    );
  }, [backups, search]);

  const pagedBackups = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredBackups.slice(start, start + rowsPerPage);
  }, [filteredBackups, page, rowsPerPage]);

  const backupsEmpty = !loadingBackups && !backupsErr && filteredBackups.length === 0;

  const showBackBar = view !== "summary";

  const handleOpenRestoreDialog = (backup) => setRestoreTarget(backup);
  const handleCloseRestoreDialog = () => setRestoreTarget(null);

  /* ------------------------------ Summary view ------------------------------ */

  const renderSummaryView = () => (
    <Stack spacing={3}>
      {/* ★ Stats Cards — Floating outside, no paper wrapper */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <BackupIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  Last Backup
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {MOCK_LAST_BACKUP}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <ScheduleIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  Next Schedule
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {MOCK_NEXT_SCHEDULE}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <HistoryIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  Total Backups
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {MOCK_BACKUPS.length} files
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <RestoreIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  Storage Used
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                0.8 MB total
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ★ ONE CLEAN SECTION (Quick Actions + Recent Activities) */}
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 1 }}>
        {/* Quick Actions */}
        <Typography variant="h6" fontWeight={700} mb={2}>
          Quick Actions
        </Typography>

        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Button
              variant="contained"
              fullWidth
              onClick={() => setView("backup")}
              startIcon={<BackupIcon />}
              sx={{ py: 1.5 }}
            >
              Backup Now
            </Button>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Button
              variant="contained"
              fullWidth
              onClick={() => setView("restore")}
              startIcon={<RestoreIcon />}
              sx={{ py: 1.5 }}
            >
              Restore
            </Button>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Button
              variant="contained"
              fullWidth
              onClick={() => setView("schedule")}
              startIcon={<ScheduleIcon />}
              sx={{ py: 1.5 }}
            >
              Edit Schedule
            </Button>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Recent Activities */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          mb={2}
          flexWrap="wrap"
          rowGap={1}
        >
          <Typography variant="h6" fontWeight={700}>
            Recent Activities
          </Typography>
          <Button
            variant="contained"
            onClick={() => setView("activities")}
            startIcon={<HistoryIcon />}
            sx={{ py: 1, px: 2.5 }}
          >
            View All
          </Button>
        </Stack>

        <Stack spacing={1.5} divider={<Divider flexItem />}>
          {MOCK_ACTIVITIES.slice(0, 3).map((line, idx) => (
            <Typography key={idx} variant="body1">
              {line}
            </Typography>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );

  /* ---------------------------- Backup Now view ---------------------------- */

  const renderBackupNowView = () => (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" fontWeight={700} mb={3}>
        Backup Now
      </Typography>

      <Typography mb={3}>
        Create an on-demand backup of your database.
      </Typography>

      <Stack spacing={3} sx={{ maxWidth: 600 }}>
        <Box>
          <RadioGroup
            value={backupType}
            onChange={(e) => setBackupType(e.target.value)}
          >
            <FormControlLabel
              value="full"
              control={<Radio />}
              label="Full backup"
              sx={{ mb: 1 }}
            />
          </RadioGroup>
        </Box>

        <Box>
          <Typography fontWeight={600} mb={1}>
            Notes (optional)
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Example: "Before migrating inventory" – helps for future audits.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            placeholder="Why are you running this backup?"
            value={backupNotes}
            onChange={(e) => setBackupNotes(e.target.value)}
          />
        </Box>

        <Box>
          <Typography fontWeight={600} mb={1}>
            Estimated output
          </Typography>
          <Typography variant="body2" color="text.secondary">
            A new <strong>.sql</strong> file will be created with the current
            date/time in the filename.
          </Typography>
        </Box>

        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={() => setView("summary")}>
            Cancel
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handleStartBackup}
            disabled={backupLoading}
          >
            {backupLoading ? "Backing up..." : "Start Backup"}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );

  /* ------------------------ Restore view (Categories style) ------------------------ */

  const renderRestoreView = () => (
    <Paper sx={{ overflow: "hidden" }}>
      {/* Header area like in CategoriePage (but with title + search) */}
      <Box p={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={2}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={700} mb={1}>
              Database Backups
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total backups found <strong>{filteredBackups.length}</strong>
            </Typography>
          </Box>

          <TextField
            size="small"
            placeholder="Search backups..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPageState((s) => ({ ...s, page: 0 }));
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: { xs: "100%", sm: 300 } }}
          />
        </Stack>
      </Box>

      <Divider />

      {/* Table area – mimic CategoriePage scroll-x + centered container */}
      <Box sx={{ minWidth: 0 }}>
        <TableContainer
          component={Paper}
          elevation={0}
          className="scroll-x"
          sx={{
            mx: "auto",
            width: { xs: "100%", sm: "auto" },
            maxWidth: 960,
          }}
        >
          <Table
            stickyHeader
            aria-label="database backups table"
            sx={{ tableLayout: "fixed", minWidth: 720 }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: "30%" }}>
                  <Typography fontWeight={600}>Backup Date & Time</Typography>
                </TableCell>
                <TableCell sx={{ width: "40%" }}>
                  <Typography fontWeight={600}>Filename</Typography>
                </TableCell>
                <TableCell sx={{ width: "15%" }}>
                  <Typography fontWeight={600}>Size</Typography>
                </TableCell>
                <TableCell sx={{ width: "15%" }} align="center">
                  <Typography fontWeight={600}>Actions</Typography>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loadingBackups && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2">Loading backups…</Typography>
                  </TableCell>
                </TableRow>
              )}

              {!!backupsErr && !loadingBackups && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="error">
                      {backupsErr}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {backupsEmpty && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      textAlign="center"
                      py={3}
                    >
                      No backups found. Use <strong>Backup Now</strong> to
                      create your first backup.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {!loadingBackups &&
                !backupsErr &&
                !backupsEmpty &&
                pagedBackups.map((b) => (
                  <TableRow key={b.id} hover>
                    <TableCell>{b.dateTime}</TableCell>
                    <TableCell>
                      <Typography noWrap title={b.filename}>
                        {b.filename}
                      </Typography>
                    </TableCell>
                    <TableCell>{b.size}</TableCell>
                    <TableCell align="center">
                      <Stack
                        direction="row"
                        spacing={1}
                        justifyContent="center"
                      >
                        <Tooltip title="Delete backup">
                          <IconButton
                            size="small"
                            aria-label="Delete backup"
                            color="error"
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Restore from this backup">
                          <IconButton
                            size="small"
                            aria-label="Restore backup"
                            color="primary"
                            onClick={() => handleOpenRestoreDialog(b)}
                          >
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={filteredBackups.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPageState((s) => ({ ...s, page: p }))}
          rowsPerPageOptions={[5, 10, 25]}
          onRowsPerPageChange={(e) =>
            setPageState({
              page: 0,
              rowsPerPage: parseInt(e.target.value, 10),
            })
          }
          sx={{ borderTop: 1, borderColor: "divider" }}
        />
      </Box>
    </Paper>
  );

  /* --------------------------- Schedule view --------------------------- */

  const renderScheduleView = () => (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" fontWeight={700} mb={3}>
        Backup Schedule
      </Typography>

      <Stack spacing={3} sx={{ maxWidth: 500 }}>
        <Box>
          <Typography fontWeight={600} mb={2}>
            Scheduled Backups
          </Typography>

          <Typography variant="body2" mb={2}>
            Backup Frequency
          </Typography>
          <RadioGroup
            value={scheduleFreq}
            onChange={(e) => setScheduleFreq(e.target.value)}
          >
            <FormControlLabel value="daily" control={<Radio />} label="Daily" />
            <FormControlLabel value="weekly" control={<Radio />} label="Weekly" />
            <FormControlLabel
              value="monthly"
              control={<Radio />}
              label="Monthly"
            />
          </RadioGroup>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Time"
              fullWidth
              size="small"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              helperText="Example: 10:00 PM"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Retention Days"
              fullWidth
              size="small"
              placeholder="e.g. 14"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">Days</InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>

        <Box>
          <Typography variant="body2" fontWeight={600} mb={1}>
            Next Run:
          </Typography>
          <Typography variant="body2">Tomorrow at 10:00 PM</Typography>
        </Box>

        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Button variant="contained">Save Changes</Button>
          <Button variant="outlined">Test Run Now</Button>
          <Button variant="text" onClick={() => setView("summary")}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );

  /* ------------------------ Recent Activities view ----------------------- */

  const renderActivitiesView = () => (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" fontWeight={700} mb={3}>
        Recent Activities
      </Typography>

      <Stack spacing={0}>
        {MOCK_ACTIVITIES.map((line, idx) => (
          <Box key={idx} sx={{ py: 2 }}>
            <Typography>{line}</Typography>
            {idx !== MOCK_ACTIVITIES.length - 1 && <Divider sx={{ mt: 2 }} />}
          </Box>
        ))}
      </Stack>
    </Paper>
  );

  /* --------------------------------- UI --------------------------------- */

  return (
    <Box p={2} display="grid" gap={2}>
      <Box sx={{ mx: "auto", width: "100%", maxWidth: 1200 }}>
        {/* Header / Back bar */}
        <Box mb={3}>
          {showBackBar ? (
            <Stack direction="row" alignItems="center" spacing={2}>
              <IconButton
                onClick={() => setView("summary")}
                aria-label="Back"
                size="large"
              >
                <ArrowBackIosNewIcon />
              </IconButton>
              <Typography variant="h5" fontWeight={700}>
                {view === "backup" && "Backup Now"}
                {view === "restore" && "Restore"}
                {view === "schedule" && "Backup Schedule"}
                {view === "activities" && "Recent Activities"}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="h4" fontWeight={700}>
              Backup and Restore
            </Typography>
          )}
        </Box>

        {view === "summary" && renderSummaryView()}
        {view === "backup" && renderBackupNowView()}
        {view === "restore" && renderRestoreView()}
        {view === "schedule" && renderScheduleView()}
        {view === "activities" && renderActivitiesView()}
      </Box>

      {/* Confirm restore dialog */}
      <Dialog
        open={!!restoreTarget}
        onClose={handleCloseRestoreDialog}
        maxWidth="sm"
        fullWidth
      >
        {restoreTarget && (
          <>
            <DialogTitle>Confirm Restore</DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                >
                  <Box>
                    <Typography fontWeight={600} mb={1}>
                      Restore {restoreTarget.filename}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {restoreTarget.dateTime}
                    </Typography>
                  </Box>
                  <Typography fontWeight={700}>{restoreTarget.size}</Typography>
                </Stack>

                <Box>
                  <Typography variant="body2" fontWeight={600} mb={1}>
                    Safety notes
                  </Typography>
                  <Typography variant="body2" mb={1}>
                    • Pre-restore snapshot – app will create a new backup first,
                    so you can roll back if needed.
                  </Typography>
                  <Typography variant="body2">
                    • Maintenance mode – puts app in read-only / queue pause to
                    avoid writes during restore.
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" fontWeight={600} mb={1}>
                    Type <strong>QUSCINA</strong> to Confirm:
                  </Typography>
                  <TextField fullWidth size="small" />
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseRestoreDialog}>Cancel</Button>
              <Button color="error" variant="contained">
                Restore Now
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}