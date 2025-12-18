// Frontend/src/pages/Settings/BackupAndRestorePage/BackupAndRestorePage.jsx
import { useMemo, useState, useEffect } from "react";
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
  Tooltip,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  CircularProgress,
} from "@mui/material";

import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import SearchIcon from "@mui/icons-material/Search";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RestoreIcon from "@mui/icons-material/Restore";
import BackupIcon from "@mui/icons-material/Backup";
import ScheduleIcon from "@mui/icons-material/Schedule";
import HistoryIcon from "@mui/icons-material/History";
import { useAuth } from "@/context/AuthContext";

export default function BackupAndRestorePage() {
  const { user } = useAuth();
  const [view, setView] = useState("summary"); // summary | backup | restore | schedule | activities

  // 🔹 Summary stats state (for the cards)
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState("");

  // Restore table state
  const [backups, setBackups] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backupsErr, setBackupsErr] = useState("");
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  // Restore dialog state
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreErr, setRestoreErr] = useState("");
  const [restoreSuccessOpen, setRestoreSuccessOpen] = useState(false);

  // Backup now
  const [backupType, setBackupType] = useState("full");
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupErr, setBackupErr] = useState("");

  // 🔹 Backup progress / result dialog
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [backupStatus, setBackupStatus] = useState("idle");
  const [backupInfo, setBackupInfo] = useState(null);

  // confirm dialog before starting backup
  const [backupConfirmOpen, setBackupConfirmOpen] = useState(false);

  // 🔹 Activities (backup_jobs) state
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesErr, setActivitiesErr] = useState("");

  // Schedule state (daily only)
  const [scheduleTime, setScheduleTime] = useState("22:00"); // 24h format HH:MM
  const [retentionDays, setRetentionDays] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleErr, setScheduleErr] = useState("");
  const [scheduleSuccess, setScheduleSuccess] = useState("");
  // Schedule confirm dialog
  const [scheduleConfirmOpen, setScheduleConfirmOpen] = useState(false);

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  /* -------------------------- Loaders / API calls -------------------------- */

  const handleStartBackup = async () => {
    setBackupErr("");
    setBackupDialogOpen(true);
    setBackupStatus("running");
    setBackupInfo(null);
    setBackupLoading(true);

    // map user fields → payload (handle both employeeId/id, role/roleName, etc.)
    const employeeId =
      user?.employeeId ?? user?.id ?? null;

    const employeeName =
      user?.name ??
      (user?.firstName && user?.lastName
        ? `${user.firstName} ${user.lastName}`
        : null);

    const employeeRole =
      user?.role ?? user?.roleName ?? null;

    try {
      const res = await fetch("/api/settings/backup-and-restore/backup-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupType,
          employeeId,
          employeeName,
          employeeRole, // "Admin"
          trigger: "manual",
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.message || "Backup failed");
      }

      const data = await res.json();
      console.log("Backup OK:", data);

      setBackupStatus("success");
      setBackupInfo({
        filename: data.filename,
        fullPath: data.fullPath || data.dir || "",
        sizeBytes: data.sizeBytes,
      });

      // refresh stats + tables so UI updates
      await loadSummary();
      await loadActivities();
      await loadBackups();
    } catch (err) {
      console.error(err);
      const msg = err.message || "Backup failed";
      setBackupErr(msg);
      setBackupStatus("error");
    } finally {
      setBackupLoading(false);
    }
  };

  const loadActivities = async () => {
    try {
      setActivitiesLoading(true);
      setActivitiesErr("");
      const res = await fetch("/api/settings/backup-and-restore/activities");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Failed to load activities");
      }
      const data = await res.json();
      setActivities(data.items || []);
    } catch (err) {
      console.error("Activities load error:", err);
      setActivitiesErr(err.message || "Failed to load activities");
    } finally {
      setActivitiesLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      setLoadingBackups(true);
      setBackupsErr("");
      const res = await fetch("/api/settings/backup-and-restore/backups");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Failed to load backups");
      }
      const data = await res.json();
      setBackups(data.items || []);
    } catch (err) {
      console.error("Backups load error:", err);
      setBackupsErr(err.message || "Failed to load backups");
    } finally {
      setLoadingBackups(false);
    }
  };

  const loadSummary = async () => {
    try {
      setSummaryLoading(true);
      setSummaryErr("");
      const res = await fetch("/api/settings/backup-and-restore/summary");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Failed to load summary");
      }
      const data = await res.json();
      setSummary(data);

      // hydrate schedule form from backend
      if (data.schedule) {
        if (data.schedule.time_of_day) {
          setScheduleTime(data.schedule.time_of_day); // assumes "HH:MM"
        }
        if (data.schedule.retention_days != null) {
          setRetentionDays(String(data.schedule.retention_days));
        }
      }
    } catch (err) {
      console.error("Summary load error:", err);
      setSummaryErr(err.message || "Failed to load summary");
    } finally {
      setSummaryLoading(false);
    }
  };

  // Load summary, activities, backups once when page mounts
  useEffect(() => {
    loadSummary();
    loadActivities();
    loadBackups();
  }, []);

  /* ------------------------------ Formatters ------------------------------ */

  // Treat MySQL DATETIME (or ISO with trailing Z) as LOCAL time
  function parseMysqlDateTime(value) {
    if (!value) return null;

    if (value instanceof Date) return value;

    const s = String(value).trim();
    // normalize: "YYYY-MM-DDTHH:mm:ssZ" -> "YYYY-MM-DD HH:mm:ss"
    const cleaned = s.replace("T", " ").replace("Z", "");
    const [datePart, timePart] = cleaned.split(" ");
    if (!datePart || !timePart) {
      // fallback – let JS try
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const [y, m, d] = datePart.split("-").map(Number);
    const [hh, mm, ss] = timePart.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, ss || 0); // local time
  }

  const formatBytes = (bytes) => {
    if (bytes == null || isNaN(bytes)) return "—";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(1)} ${units[i]}`;
  };

  const formatBackupDateTime = (value) => {
    if (!value) return "—";

    let d;

    // If backend somehow already gave us a Date
    if (value instanceof Date) {
      d = value;
    } else {
      // ISO string from JSON (e.g. "2025-11-15T16:34:00.000Z")
      d = new Date(value);

      // fallback to MySQL parser if that fails
      if (Number.isNaN(d.getTime())) {
        d = parseMysqlDateTime(value);
      }
    }

    if (!d || Number.isNaN(d.getTime())) return "—";

    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const datePart = d.toLocaleDateString("en-US", {
      month: "long",
      day: "2-digit",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${weekday} · ${datePart} · ${timePart}`;
  };

  const formatActivityLine = (row) => {
    const isScheduleUpdate = row.action === "schedule-update";

    const actionLabel =
      row.action === "backup"
        ? "Backup"
        : row.action === "restore"
        ? "Restore"
        : row.action === "schedule-update"
        ? "Schedule"
        : row.action || "Activity";

    const statusLabel = row.status
      ? row.status.charAt(0).toUpperCase() + row.status.slice(1)
      : "";

    const sourceLabel =
      row.trigger_source === "schedule"
        ? "Schedule"
        : row.trigger_source === "test-run"
        ? "Test Run"
        : "Manual";

    const when = parseMysqlDateTime(row.finished_at || row.started_at);
    const whenStr =
      !when || isNaN(when)
        ? ""
        : when.toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });

    const filename = row.filename || "";

    const baseLabel = isScheduleUpdate
      ? "Schedule updated"
      : `${actionLabel} ${statusLabel}`.trim();

    const pieces = [
      baseLabel,
      isScheduleUpdate && row.notes ? row.notes : null,
      !isScheduleUpdate && sourceLabel ? `Source: ${sourceLabel}` : null,
      !isScheduleUpdate && filename ? `File: ${filename}` : null,
      whenStr && `On ${whenStr}`,
    ].filter(Boolean);

    return pieces.join(" · ");
  };


  const formatLastBackup = (last) => {
    if (!last) return "No successful backups yet.";
    const d = parseMysqlDateTime(last.finished_at || last.started_at || last.created_at);
    if (!d) return "No successful backups yet.";

    const dateStr = d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    const typeLabel = last.backup_type
      ? last.backup_type.charAt(0).toUpperCase() + last.backup_type.slice(1)
      : "Backup";

    const sizeLabel = formatBytes(last.size_bytes);

    // Example: "Tue, May 23, 2025 - 11:30 PM - Full - 0.3 MB"
    return `${dateStr} · ${typeLabel} · ${sizeLabel}`;
  };

  const formatSchedule = (sched) => {
    if (!sched) return "Not configured";

    const freqLabel = sched.frequency === "daily" ? "Daily" : "Custom";

    // sched.time_of_day might be "HH:MM"
    let timeLabel = "—";
    if (sched.time_of_day) {
      if (/^\d{1,2}:\d{2}$/.test(sched.time_of_day)) {
        const [hh, mm] = sched.time_of_day.split(":").map((n) => parseInt(n, 10));
        const d = new Date();
        if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
          d.setHours(hh, mm, 0, 0);
          timeLabel = d.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });
        } else {
          timeLabel = sched.time_of_day;
        }
      } else {
        timeLabel = sched.time_of_day;
      }
    }

    let nextLabel = "";
    if (sched.next_run_at) {
      const d = parseMysqlDateTime(sched.next_run_at);
      if (d && !Number.isNaN(d.getTime())) {
        nextLabel =
          " · Next: " +
          d.toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
      }
    }

    return `${freqLabel} at ${timeLabel}${nextLabel}`;
  };

  /* ------------------------------ Derived data ------------------------------ */

  const filteredBackups = useMemo(() => {
    if (!search.trim()) return backups;
    const q = search.toLowerCase();
    return backups.filter((b) => {
      const name = (b.filename || "").toLowerCase();
      const mtime = b.mtime ? String(b.mtime).toLowerCase() : "";
      const sizeStr =
        typeof b.sizeBytes === "number" ? String(b.sizeBytes).toLowerCase() : "";
      return name.includes(q) || mtime.includes(q) || sizeStr.includes(q);
    });
  }, [backups, search]);

  const pagedBackups = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredBackups.slice(start, start + rowsPerPage);
  }, [filteredBackups, page, rowsPerPage]);

  const backupsEmpty = !loadingBackups && !backupsErr && filteredBackups.length === 0;

  const showBackBar = view !== "summary";

  /* ------------------------- Restore / Delete handlers ------------------------- */

  const handleOpenRestoreDialog = (backup) => {
    setRestoreErr("");
    setRestoreTarget(backup);
  };

  const handleCloseRestoreDialog = () => {
    if (restoreLoading) return;
    setRestoreTarget(null);
    setRestoreErr("");
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget || !restoreTarget.filename) return;

    setRestoreLoading(true);
    setRestoreErr("");

    const employeeId = user?.employeeId ?? user?.id ?? null;
    const employeeRole = user?.role ?? user?.roleName ?? null;

    try {
      const res = await fetch("/api/settings/backup-and-restore/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: restoreTarget.filename,
          employeeId,
          employeeRole,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to start restore");
      }

      await loadActivities(); // show restore job in activities

      // close the confirmation dialog
      handleCloseRestoreDialog();

      // 🔹 open the nice success dialog instead of window.alert
      setRestoreSuccessOpen(true);
    } catch (err) {
      console.error("Restore error:", err);
      setRestoreErr(err.message || "Restore failed");
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleDeleteBackup = (backup) => {
    setDeleteErr("");
    setDeleteTarget(backup); // open dialog
  };

  const confirmDeleteBackup = async () => {
    if (!deleteTarget) return;

    setDeleteLoading(true);
    setDeleteErr("");

    try {
      const res = await fetch(
        `/api/settings/backup-and-restore/backups/${encodeURIComponent(
          deleteTarget.filename
        )}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Failed to delete backup");
      }

      // remove from table
      setBackups((prev) =>
        prev.filter((b) => b.filename !== deleteTarget.filename)
      );

      await loadSummary(); // update storage + total backups

      setDeleteTarget(null);
    } catch (err) {
      setDeleteErr(err.message || "Failed to delete backup");
    } finally {
      setDeleteLoading(false);
    }
  };


  const handleCloseBackupDialog = () => {
    if (backupStatus === "running") return;
    setBackupDialogOpen(false);
    setBackupStatus("idle");
    setBackupInfo(null);
    setBackupErr("");
    setView("summary");
  };

  /* --------------------------- Schedule handlers --------------------------- */

  const handleSaveSchedule = async () => {
    setScheduleErr("");
    setScheduleSuccess("");
    setScheduleSaving(true);

    const employeeId = user?.employeeId ?? user?.id ?? null;
    const employeeRole = user?.role ?? user?.roleName ?? null;

    try {
      if (!scheduleTime) {
        throw new Error("Time is required.");
      }

      const MIN_RETENTION_DAYS = 14;

      let retentionInt = null;
      if (retentionDays !== "") {
        retentionInt = parseInt(retentionDays, 10);

        if (Number.isNaN(retentionInt)) {
          throw new Error("Retention days must be a valid number.");
        }

        if (retentionInt < MIN_RETENTION_DAYS) {
          setScheduleErr(
            `Retention days must be at least ${MIN_RETENTION_DAYS}. ` +
              "Using fewer days is not recommended because it reduces your ability " +
              "to recover from issues that happened in the last two weeks."
          );
          setScheduleSaving(false);
          return; // ❌ don’t save
        }
      }

      const payload = {
        frequency: "daily",
        timeOfDay: scheduleTime,
        retentionDays: retentionInt, // null or >= 14
        employeeId,
        employeeRole,
      };

      const res = await fetch("/api/settings/backup-and-restore/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Failed to save schedule");
      }

      const data = await res.json();

      setSummary((prev) =>
        prev
          ? {
              ...prev,
              schedule: data.schedule || prev.schedule,
            }
          : prev
      );

      await loadActivities();

      setScheduleSuccess("Schedule updated.");
    } catch (err) {
      console.error("Save schedule error:", err);
      setScheduleErr(err.message || "Failed to save schedule");
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleTestRunNow = async () => {
    // reuse the backup dialog + logic, but tag it as test-run
    setBackupErr("");
    setBackupDialogOpen(true);
    setBackupStatus("running");
    setBackupInfo(null);
    setBackupLoading(true);

    // 👇 map auth user → backup payload
    const employeeId = user?.employeeId ?? user?.id ?? null;

    const employeeName =
      user?.name ??
      (user?.firstName && user?.lastName
        ? `${user.firstName} ${user.lastName}`
        : null);

    const employeeRole = user?.role ?? user?.roleName ?? null;

    try {
      const res = await fetch("/api/settings/backup-and-restore/backup-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupType: "full",
          notes: `[SCHEDULE TEST] Daily backup at ${scheduleTime}`,
          trigger: "test-run", // 👈 enum-safe value
          employeeId,
          employeeName,
          employeeRole,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.message || "Backup failed");
      }

      const data = await res.json();
      console.log("Schedule test backup OK:", data);

      setBackupStatus("success");
      setBackupInfo({
        filename: data.filename,
        fullPath: data.fullPath || data.dir || "",
        sizeBytes: data.sizeBytes,
      });

      await loadSummary();
      await loadActivities();
      await loadBackups();
    } catch (err) {
      console.error(err);
      const msg = err.message || "Backup failed";
      setBackupErr(msg);
      setBackupStatus("error");
    } finally {
      setBackupLoading(false);
    }
  };

  /* ------------------------------ Summary view ------------------------------ */

  const renderSummaryView = () => (
    <Stack spacing={3}>
      {/* ★ Stats Cards — Floating outside, no paper wrapper */}
      <Grid container spacing={2}>
        {/* Last Backup */}
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
                {summaryLoading && "Loading…"}
                {!summaryLoading && summaryErr && "Failed to load summary"}
                {!summaryLoading &&
                  !summaryErr &&
                  formatLastBackup(summary?.lastBackup)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Next Schedule */}
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
                {summaryLoading && "Loading…"}
                {!summaryLoading && summaryErr && "Failed to load summary"}
                {!summaryLoading &&
                  !summaryErr &&
                  formatSchedule(summary?.schedule)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Total Backups */}
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
                {summaryLoading && "—"}
                {!summaryLoading && summaryErr && "—"}
                {!summaryLoading &&
                  !summaryErr &&
                  (summary
                    ? `${summary.totalBackups} file${
                        summary.totalBackups === 1 ? "" : "s"
                      }`
                    : "0 files")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Storage Used */}
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
                {summaryLoading && "—"}
                {!summaryLoading && summaryErr && "—"}
                {!summaryLoading &&
                  !summaryErr &&
                  (summary ? formatBytes(summary.storageBytes) : "0 B")}
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
          {activitiesLoading && (
            <Typography variant="body2" color="text.secondary">
              Loading activities…
            </Typography>
          )}

          {!activitiesLoading && activitiesErr && (
            <Typography variant="body2" color="error">
              {activitiesErr}
            </Typography>
          )}

          {!activitiesLoading &&
            !activitiesErr &&
            activities.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No recent activities yet.
              </Typography>
            )}

          {!activitiesLoading &&
            !activitiesErr &&
            activities.slice(0, 3).map((row) => (
              <Typography key={row.id} variant="body1">
                {formatActivityLine(row)}
              </Typography>
            ))}
        </Stack>
      </Paper>
    </Stack>
  );

  /* ---------------------------- Enhanced Backup Now view ---------------------------- */

  const renderBackupNowView = () => {
    const lastBackupText = formatLastBackup(summary?.lastBackup);
    const scheduleText = formatSchedule(summary?.schedule);
    const storageUsedText = summary
      ? formatBytes(summary.storageBytes)
      : "—";

    return (
      <Paper sx={{ p: 3 }}>
        <Grid container spacing={4}>
          {/* LEFT: main action panel - expanded to use more space */}
          <Grid item xs={12} lg={8}>
            <Box sx={{ maxWidth: 800 }}>
              <Typography variant="h5" fontWeight={700} mb={2}>
                Backup Now
              </Typography>
              <Typography variant="body1" color="text.secondary" mb={4} sx={{ lineHeight: 1.6 }}>
                Create an on-demand backup of your database. This is useful
                before applying updates, importing data, or doing major changes
                to your configuration.
              </Typography>

              <Stack spacing={4}>

                {/* What happens section */}
                <Card variant="outlined" sx={{ p: 2.5 }}>
                  <Typography variant="subtitle1" fontWeight={600} mb={2}>
                    What this backup will do
                  </Typography>
                  <Stack spacing={1.5}>
                    <Box display="flex" alignItems="flex-start">
                      <Box sx={{ color: 'success.main', mr: 1.5, mt: 0.25 }}>•</Box>
                      <Typography variant="body2" color="text.secondary">
                        Create a new <strong>.sql</strong> file with the current date and time in the filename
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="flex-start">
                      <Box sx={{ color: 'success.main', mr: 1.5, mt: 0.25 }}>•</Box>
                      <Typography variant="body2" color="text.secondary">
                        Save the file to your configured backup folder
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="flex-start">
                      <Box sx={{ color: 'success.main', mr: 1.5, mt: 0.25 }}>•</Box>
                      <Typography variant="body2" color="text.secondary">
                        Leave all existing backup files untouched
                      </Typography>
                    </Box>
                  </Stack>
                </Card>

                {/* Actions */}
                <Box sx={{ pt: 2 }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Button
                      variant="contained"
                      size="large"
                      onClick={() => setBackupConfirmOpen(true)}
                      disabled={backupLoading}
                      sx={{ minWidth: 140, px: 3 }}
                    >
                      {backupLoading ? (
                        <CircularProgress size={20} sx={{ color: 'white' }} />
                      ) : (
                        'Start Backup'
                      )}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => setView("summary")}
                      size="large"
                    >
                      Back
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </Box>
          </Grid>

        </Grid>
      </Paper>
    );
  };

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
                  <TableRow key={b.filename} hover>
                    <TableCell>{formatBackupDateTime(b.mtime)}</TableCell>
                    <TableCell>
                      <Typography noWrap title={b.filename}>
                        {b.filename}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatBytes(b.sizeBytes)}</TableCell>
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
                            onClick={() => handleDeleteBackup(b)}
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

  const renderScheduleView = () => {
    // helper for "Next Run" label on the page (not the card)
    const sched = summary?.schedule;
    let nextRunLabel = "Not yet scheduled";
    if (sched?.next_run_at) {
      const d = parseMysqlDateTime(sched.next_run_at);
      if (d && !Number.isNaN(d.getTime())) {
        nextRunLabel = d.toLocaleString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      }
    }

    const minRetention = 14;
    const retentionTooLow =
    retentionDays !== "" && Number(retentionDays) < minRetention;

    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={700} mb={3}>
          Backup Schedule
        </Typography>

        <Stack spacing={3} sx={{ maxWidth: 500 }}>
          <Box>
            <Typography fontWeight={600} mb={1}>
              Daily backups
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Automatically create a full backup once per day at the time you
              choose below. Retention will clean up older backup files so your
              storage doesn&apos;t grow forever.
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Time"
                fullWidth
                size="small"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                inputProps={{
                  step: 60 * 5, // 5-minute increments
                }}
                helperText="Time of day for the daily backup"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Retention Days"
                fullWidth
                size="small"
                placeholder="e.g. 14"
                value={retentionDays}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*$/.test(v)) setRetentionDays(v);
                }}
                error={retentionTooLow}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">Days</InputAdornment>
                  ),
                }}
                helperText={
                  retentionTooLow
                    ? "Minimum of 14 days is recommended so you can restore from issues in the last two weeks."
                    : "Keep backups for this many days (minimum 14 recommended)."
                }
              />
            </Grid>
          </Grid>

          <Box>
            <Typography variant="body2" fontWeight={600} mb={0.5}>
              Next Run:
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {nextRunLabel}
            </Typography>
          </Box>

          {scheduleErr && (
            <Typography variant="body2" color="error">
              {scheduleErr}
            </Typography>
          )}
          {scheduleSuccess && (
            <Typography variant="body2" color="success.main">
              {scheduleSuccess}
            </Typography>
          )}

          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Button
              variant="contained"
              onClick={() => setScheduleConfirmOpen(true)}
              disabled={scheduleSaving}
            >
              {scheduleSaving ? "Saving…" : "Save Changes"}
            </Button>
            <Button variant="text" onClick={() => setView("summary")}>
              Back
            </Button>
          </Stack>
        </Stack>
      </Paper>
    );
  };

  /* ------------------------ Recent Activities view ----------------------- */

  const renderActivitiesView = () => (
    <Paper
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        height: {
          xs: "calc(100vh - 150px)",
          md: "calc(100vh - 180px)",
        },
      }}
    >
      <Typography variant="h6" fontWeight={700} mb={3}>
        Recent Activities
      </Typography>

      {activitiesLoading && (
        <Typography variant="body2" color="text.secondary">
          Loading activities…
        </Typography>
      )}

      {!activitiesLoading && activitiesErr && (
        <Typography variant="body2" color="error">
          {activitiesErr}
        </Typography>
      )}

      {!activitiesLoading && !activitiesErr && activities.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No backup or restore activity recorded yet.
        </Typography>
      )}

      {!activitiesLoading && !activitiesErr && activities.length > 0 && (
        <Stack
          spacing={0}
          className="scroll-x"            // 👈 reuse your custom scrollbar styles
          sx={{
            mt: 1,
            flex: 1,
            minHeight: 0,
            overflowY: "auto",           // vertical scroll only
            overflowX: "hidden",
            pr: 1,
          }}
        >
          {activities.map((row, idx) => (
            <Box key={row.id || idx} sx={{ py: 2 }}>
              <Typography>{formatActivityLine(row)}</Typography>

              {row.notes && row.action !== "schedule-update" && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Notes: {row.notes}
                </Typography>
              )}

              {idx !== activities.length - 1 && <Divider sx={{ mt: 2 }} />}
            </Box>
          ))}
        </Stack>
      )}
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

      {/* Backup confirmation dialog (before starting backup) */}
      <Dialog
        open={backupConfirmOpen}
        onClose={() => {
          if (backupLoading) return;
          setBackupConfirmOpen(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm Backup</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography>
              You are about to create a new{" "}
              <strong>{backupType === "full" ? "full" : "partial"}</strong> backup of
              the database.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This will export the current database into a new <strong>.sql</strong>{" "}
              file with the date and time in the filename. It will not delete or
              modify existing backup files.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBackupConfirmOpen(false)}
            disabled={backupLoading}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={async () => {
              setBackupConfirmOpen(false);
              await handleStartBackup();
            }}
            disabled={backupLoading}
          >
            {backupLoading ? "Starting…" : "Confirm Backup"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Backup progress / result dialog */}
      <Dialog
        open={backupDialogOpen}
        onClose={handleCloseBackupDialog}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={backupStatus === "running"}
      >
        <DialogTitle>
          {backupStatus === "running" && "Creating Backup"}
          {backupStatus === "success" && "Backup Completed"}
          {backupStatus === "error" && "Backup Failed"}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            {backupStatus === "running" && (
              <>
                <Typography>
                  Please wait while we export your database to a{" "}
                  <strong>.sql</strong> file.
                </Typography>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary">
                  This may take a moment depending on database size.
                </Typography>
              </>
            )}

            {backupStatus === "success" && backupInfo && (
              <Stack spacing={1}>
                <Typography>Backup created successfully.</Typography>
                <Typography variant="body2">
                  <strong>Filename:</strong> {backupInfo.filename}
                </Typography>
                {backupInfo.fullPath && (
                  <Typography variant="body2">
                    <strong>Location:</strong> {backupInfo.fullPath}
                  </Typography>
                )}
                {typeof backupInfo.sizeBytes === "number" && (
                  <Typography variant="body2">
                    <strong>Size:</strong> {formatBytes(backupInfo.sizeBytes)}
                  </Typography>
                )}
              </Stack>
            )}

            {backupStatus === "error" && (
              <Stack spacing={1}>
                <Typography color="error">Backup failed.</Typography>
                <Typography variant="body2" color="text.secondary">
                  {backupErr}
                </Typography>
              </Stack>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          {backupStatus === "running" ? (
            <Button disabled>Working…</Button>
          ) : (
            <Button onClick={handleCloseBackupDialog} variant="contained">
              Close
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete backup confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => {
          if (deleteLoading) return;
          setDeleteTarget(null);
          setDeleteErr("");
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Backup File</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography>
              Are you sure you want to delete this backup file?
            </Typography>

            {deleteTarget && (
              <Typography variant="body2">
                <strong>{deleteTarget.filename}</strong>
              </Typography>
            )}

            <Typography variant="body2" color="error">
              This action cannot be undone.
            </Typography>

            {deleteErr && (
              <Typography variant="body2" color="error">
                {deleteErr}
              </Typography>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleteLoading}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDeleteBackup}
            disabled={deleteLoading}
          >
            {deleteLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Schedule confirmation dialog */}
      <Dialog
        open={scheduleConfirmOpen}
        onClose={() => {
          if (scheduleSaving) return;
          setScheduleConfirmOpen(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm Schedule Changes</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography>
              You are about to update your automatic backup schedule.
            </Typography>

            <Box sx={{ bgcolor: "grey.100", p: 2, borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                New Schedule Summary
              </Typography>

              <Typography variant="body2">
                <strong>Backup Time:</strong> {scheduleTime}
              </Typography>

              <Typography variant="body2">
                <strong>Retention Days:</strong>{" "}
                {retentionDays ? `${retentionDays} days` : "Not set"}
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary">
              These changes will affect daily automated backups and retention cleanup.
            </Typography>

            {scheduleErr && (
              <Typography variant="body2" color="error">
                {scheduleErr}
              </Typography>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setScheduleConfirmOpen(false)}
            disabled={scheduleSaving}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={async () => {
              await handleSaveSchedule();
              if (!scheduleErr) setScheduleConfirmOpen(false);
            }}
            disabled={scheduleSaving}
          >
            {scheduleSaving ? "Saving…" : "Confirm Changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore started success dialog */}
      <Dialog
        open={restoreSuccessOpen}
        onClose={() => setRestoreSuccessOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Restore Started</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            Restore started successfully.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => setRestoreSuccessOpen(false)}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore confirmation dialog */}
      <Dialog
        open={!!restoreTarget}
        onClose={handleCloseRestoreDialog}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={restoreLoading}
      >
        <DialogTitle>Restore from Backup</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography>
              You are about to restore the database from this backup file:
            </Typography>
            {restoreTarget && (
              <Typography variant="body2">
                <strong>Filename:</strong> {restoreTarget.filename}
              </Typography>
            )}
            <Typography variant="body2" color="error">
              This will overwrite existing data in the database. Make sure no one is
              using the system while the restore runs.
            </Typography>

            {restoreErr && (
              <Typography variant="body2" color="error">
                {restoreErr}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRestoreDialog} disabled={restoreLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRestore}
            color="primary"
            variant="contained"
            disabled={restoreLoading}
          >
            {restoreLoading ? "Restoring…" : "Confirm Restore"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}