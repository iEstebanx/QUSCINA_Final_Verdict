// QUSCINA_BACKOFFICE/Backend/src/routes/Settings/BackupAndRestore/BackupAndRestore.js
const { Router } = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

// We rely on the same env as mysql.js
const {
  DB_HOST,
  DB_PORT = "3306",
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  BACKUP_DIR,           // e.g. C:\QUSCINA\QuscinaData\backups\production
  BACKUP_ENV = "production",
} = process.env;

function ensureBackupEnv() {
  if (!BACKUP_DIR) {
    throw new Error(
      "BACKUP_DIR env not set. Example: BACKUP_DIR=C:\\QUSCINA\\QuscinaData\\backups\\production"
    );
  }
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error(
      "DB_* env missing. Need DB_HOST, DB_USER, DB_PASSWORD, DB_NAME for mysqldump."
    );
  }
}

// helper: format new backup filename
function buildFilename(type = "full") {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());

  return `backup-${type}_${yyyy}-${mm}-${dd}_${hh}${mi}.sql`;
}

// small utility for human-readable size (for audit trail detail)
function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

// --------------------------- MAIN EXPORT ---------------------------

module.exports = function BackupAndRestoreRoutes({ db }) {
  const router = Router();

  /**
   * 🔹 Central helper: write to audit_trail
   * Keep it very defensive so backup doesn't fail just because audit logging failed.
   */
  async function logAuditTrail({ employee, role, action, detail }) {
    try {
      // Always tag logs from this route as coming from Backoffice,
      // but let callers override/extend meta if they want.
      const finalDetail = {
        ...(detail || {}),
        meta: {
          app: "backoffice",
          ...(detail && detail.meta),
        },
      };

      await db.query(
        `
          INSERT INTO audit_trail (employee, role, action, detail)
          VALUES (?, ?, ?, ?)
        `,
        [
          employee || "System",
          role || "System",
          action,
          JSON.stringify(finalDetail),
        ]
      );
    } catch (err) {
      console.error("[AUDIT] Failed to log audit_trail entry:", err);
    }
  }

  async function runBackupJob({
    backupType = "full",
    employeeId = null,
    employeeName = null,
    employeeRole = null,
    trigger = "manual",} = {}) {
    ensureBackupEnv();

    const filename = buildFilename(backupType);
    const fullPath = path.join(BACKUP_DIR, filename);

    console.log("[BACKUP] BACKUP_DIR =", BACKUP_DIR);
    console.log("[BACKUP] Full path  =", fullPath);

    let jobId;
    let sizeBytes = null;

    try {
      // log job as running
      const result = await db.query(
        `
        INSERT INTO backup_jobs
          (action, trigger_source, backup_type, filename, status, created_by_employee_id)
        VALUES
          ('backup', ?, ?, ?, 'running', ?)
        `,
        [trigger, backupType, filename, employeeId]
      );
      jobId = result.insertId;

      // run mysqldump
      const args = [
        `-h${DB_HOST}`,
        `-P${DB_PORT}`,
        `-u${DB_USER}`,
        `-p${DB_PASSWORD}`,
      ];

      if (backupType === "schema") {
        args.push("--no-data");
      }

      args.push(DB_NAME);

      await new Promise((resolve, reject) => {
        const outStream = fs.createWriteStream(fullPath);
        const proc = spawn("mysqldump", args);

        proc.stdout.pipe(outStream);
        let stderrBuf = "";

        proc.stderr.on("data", (chunk) => {
          stderrBuf += chunk.toString();
        });

        proc.on("error", (err) => reject(err));

        proc.on("close", (code) => {
          outStream.close();
          if (code === 0) resolve();
          else reject(new Error(stderrBuf || `mysqldump exited with code ${code}`));
        });
      });

      // get size + mark success
      const st = await fsp.stat(fullPath);
      sizeBytes = st.size;

      await db.query(
        `
        UPDATE backup_jobs
        SET status = 'success',
            size_bytes = ?,
            finished_at = NOW()
        WHERE id = ?
        `,
        [sizeBytes, jobId]
      );

      // 🔹 AUDIT TRAIL: BACKUP SUCCESS
      const actorEmployee =
        employeeId
          ? (employeeName || `User #${employeeId}`)
          : (trigger === "schedule" ? "System (Schedule)" : "System");

      const actorRole =
        employeeId
          ? (employeeRole || "Employee") // Admin / Manager / Chef / Cashier will come from frontend
          : "System";

      await logAuditTrail({
        employee: actorEmployee,
        role: actorRole,
        action:
          trigger === "schedule"
            ? "Backup - Scheduled"
            : "Backup - Manual",
        detail: {
          statusMessage: "Database backup completed successfully.",
          actionDetails: {
            actionType: "Database Backup",
            reference: filename,
            amount: formatBytes(sizeBytes),
            reason:
              trigger === "schedule"
                ? "Daily scheduled backup"
                : "On-demand backup",
            triggerSource: trigger,
            backupType,
          },
          affectedData: {
            items: [],
            statusChange: `Backup file created in ${BACKUP_DIR}`,
          },
          backupJob: {
            id: jobId,
            action: "backup",
            trigger_source: trigger,
            backup_type: backupType,
            filename,
            size_bytes: sizeBytes,
            status: "success",
            env: BACKUP_ENV,
            backup_dir: BACKUP_DIR,
          },
        },
      });

      return {
        ok: true,
        filename,
        sizeBytes,
        jobId,
        dir: BACKUP_DIR,
        fullPath,
      };
    } catch (err) {
      // mark job as failed if we already created one
      if (jobId) {
        await db
          .query(
            `
            UPDATE backup_jobs
            SET status = 'failed', message = ?, finished_at = NOW()
            WHERE id = ?
            `,
            [err.message || String(err), jobId]
          )
          .catch(() => {});
      }

      // 🔹 AUDIT TRAIL: BACKUP FAILURE
      const actorEmployee =
        employeeId
          ? (employeeName || `User #${employeeId}`)
          : (trigger === "schedule" ? "System (Schedule)" : "System");

      const actorRole =
        employeeId
          ? (employeeRole || "Employee")
          : "System";

      await logAuditTrail({
        employee: actorEmployee,
        role: actorRole,
        action:
          trigger === "schedule"
            ? "Backup Failed - Scheduled"
            : "Backup Failed - Manual",
        detail: {
          statusMessage: "Database backup failed.",
          actionDetails: {
            actionType: "Database Backup",
            reference: filename,
            amount: sizeBytes != null ? formatBytes(sizeBytes) : "—",
            reason:
              trigger === "schedule"
                ? "Daily scheduled backup"
                : "On-demand backup",
            triggerSource: trigger,
            backupType,
          },
          affectedData: {
            items: [],
            statusChange: "Backup did not complete.",
          },
          backupJob: {
            id: jobId || null,
            action: "backup",
            trigger_source: trigger,
            backup_type: backupType,
            filename,
            size_bytes: sizeBytes,
            status: "failed",
            env: BACKUP_ENV,
            backup_dir: BACKUP_DIR,
          },
          error: {
            message: err.message || String(err),
          },
        },
      });

      throw err;
    }
  }

  async function checkAndRunScheduledBackups() {
    try {
      const [sched] = await db.query(
        `
        SELECT id, frequency, time_of_day, next_run_at, retention_days
        FROM backup_schedule
        WHERE id = 1
        LIMIT 1
        `
      );

      if (!sched) return;
      if (sched.frequency !== "daily") return;
      if (!sched.next_run_at) return;

      const now = new Date();
      const nextRun = new Date(sched.next_run_at);
      if (Number.isNaN(nextRun.getTime())) return;

      // Not yet time
      if (now < nextRun) return;

      console.log("[SCHEDULE] Running daily backup. Now =", now, "next_run_at =", nextRun);

      // 1) run backup
      await runBackupJob({
        backupType: "full",
        employeeId: null,
        trigger: "schedule",
      });

      // 2) move next_run_at to the next day at the same time
      const newNext = new Date(nextRun.getTime());
      newNext.setDate(newNext.getDate() + 1);

      await db.query(
        `
        UPDATE backup_schedule
        SET next_run_at = ?
        WHERE id = 1
        `,
        [newNext]
      );

      console.log("[SCHEDULE] Next daily backup at", newNext);
    } catch (err) {
      console.error("[SCHEDULE] Error while running scheduled backup:", err);
    }
  }

  // check every 60 seconds
  setInterval(() => {
    checkAndRunScheduledBackups();
  }, 60 * 1000);

  // Make sure folder exists
  router.use(async (_req, _res, next) => {
    try {
      ensureBackupEnv();
      await fsp.mkdir(BACKUP_DIR, { recursive: true });
      next();
    } catch (err) {
      next(err);
    }
  });

  // GET /api/settings/backup-and-restore/summary
  router.get("/summary", async (_req, res, next) => {
    try {
      // Last successful BACKUP job (still from DB)
      const [last] = await db.query(
        `
        SELECT action, backup_type, filename, size_bytes, status, finished_at
        FROM backup_jobs
        WHERE action = 'backup' AND status = 'success'
        ORDER BY finished_at DESC
        LIMIT 1
        `
      );

      // 🔹 Real backups: scan BACKUP_DIR for .sql files
      const entries = await fsp.readdir(BACKUP_DIR, { withFileTypes: true });
      let totalBytes = 0;
      let totalFiles = 0;

      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!ent.name.toLowerCase().endsWith(".sql")) continue;

        const fullPath = path.join(BACKUP_DIR, ent.name);
        const st = await fsp.stat(fullPath);

        totalBytes += st.size;
        totalFiles += 1;   // 👈 count only actual .sql backup files
      }

      // Schedule info (optional)
      const [sched] = await db.query(
        `
        SELECT id, frequency, time_of_day, next_run_at, retention_days
        FROM backup_schedule
        WHERE id = 1
        LIMIT 1
        `
      );

      res.json({
        env: BACKUP_ENV,
        lastBackup: last || null,
        totalBackups: totalFiles,  // 👈 use file count, not COUNT(*)
        storageBytes: totalBytes,
        schedule: sched || null,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/settings/backup-and-restore/backups
  // Returns all .sql files in BACKUP_DIR
  router.get("/backups", async (_req, res, next) => {
    try {
      const entries = await fsp.readdir(BACKUP_DIR, { withFileTypes: true });
      const out = [];

      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!ent.name.toLowerCase().endsWith(".sql")) continue;

        const fullPath = path.join(BACKUP_DIR, ent.name);
        const st = await fsp.stat(fullPath);

        out.push({
          filename: ent.name,
          sizeBytes: st.size,
          mtime: st.mtime, // JS Date
        });
      }

      // newest first
      out.sort((a, b) => b.mtime - a.mtime);

      res.json({ items: out });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/settings/backup-and-restore/activities
  // For "Recent Activities" and "View All"
  router.get("/activities", async (_req, res, next) => {
    try {
      const rows = await db.query(
        `
        SELECT
          id,
          action,
          trigger_source,
          backup_type,
          filename,
          status,
          message,
          started_at,
          finished_at
        FROM backup_jobs
        ORDER BY started_at DESC
        LIMIT 200
        `
      );
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/settings/backup-and-restore/schedule
  // body: { frequency?: 'daily', timeOfDay: 'HH:MM', retentionDays?: number }
  router.post("/schedule", async (req, res, next) => {
    const { frequency = "daily", timeOfDay, retentionDays = null, employeeId = null, employeeRole = null } =
      req.body || {};

    if (!timeOfDay) {
      return res.status(400).json({ error: "timeOfDay is required" });
    }

    try {
      const now = new Date();
      let nextRun = new Date();

      // try to parse HH:MM
      const [hhStr, mmStr] = String(timeOfDay).split(":");
      const hh = parseInt(hhStr, 10);
      const mm = parseInt(mmStr, 10);

      if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
        nextRun.setHours(hh, mm, 0, 0);
        // if time today already passed, schedule for tomorrow
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
      } else {
        // fallback: 24h from now
        nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      }

      const retention = retentionDays === null ? null : parseInt(retentionDays, 10) || null;

      // upsert row with id = 1
      await db.query(
        `
        INSERT INTO backup_schedule (id, frequency, time_of_day, retention_days, next_run_at)
        VALUES (1, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          frequency = VALUES(frequency),
          time_of_day = VALUES(time_of_day),
          retention_days = VALUES(retention_days),
          next_run_at = VALUES(next_run_at)
        `,
        [frequency, timeOfDay, retention, nextRun]
      );

      const [sched] = await db.query(
        `
        SELECT id, frequency, time_of_day, next_run_at, retention_days
        FROM backup_schedule
        WHERE id = 1
        LIMIT 1
        `
      );

      try {
        const parts = [];

        if (sched && sched.time_of_day) {
          parts.push(`Time: ${sched.time_of_day}`);
        }
        if (sched && sched.retention_days != null) {
          parts.push(
            `Retention: ${sched.retention_days} day${
              sched.retention_days === 1 ? "" : "s"
            }`
          );
        }

        const description = parts.join(" · ") || "Schedule updated";

        // 🔹 log as a dedicated "schedule-update" row in backup_jobs
        await db.query(
          `
          INSERT INTO backup_jobs
            (action, trigger_source, backup_type, filename, status, started_at, finished_at, created_by_employee_id)
          VALUES
            ('schedule-update', 'manual', 'full', 'SCHEDULE-UPDATE', 'success', NOW(), NOW(), ?)
          `,
          [employeeId]
        );

        const actorEmployee = employeeId ? `User #${employeeId}` : "System";
        const actorRole = employeeId ? (employeeRole || "Employee") : "System";

        // 🔹 AUDIT TRAIL: SCHEDULE UPDATED
        await logAuditTrail({
          employee: actorEmployee,
          role: actorRole,
          action: "Backup Schedule Updated",
          detail: {
            statusMessage: "Backup schedule configuration updated.",
            actionDetails: {
              actionType: "Backup Schedule Update",
              reference: `Schedule #${sched.id}`,
              amount: "—",
              reason: description,
            },
            affectedData: {
              items: [],
              statusChange: `Next run at ${sched.next_run_at || "N/A"}`,
            },
            schedule: {
              id: sched.id,
              frequency: sched.frequency,
              time_of_day: sched.time_of_day,
              retention_days: sched.retention_days,
              next_run_at: sched.next_run_at,
            },
          },
        });
      } catch (e) {
        console.error(
          "[SCHEDULE] Failed to log schedule update in backup_jobs / audit_trail:",
          e
        );
      }

      res.json({
        ok: true,
        schedule: sched || null,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/settings/backup-and-restore/backup-now
  router.post("/backup-now", async (req, res, next) => {
    const {
      backupType = "full",
      employeeId = null,
      employeeName = null,
      employeeRole = null,
      trigger = "manual",
    } = req.body || {};

    try {
      const result = await runBackupJob({
        backupType,
        employeeId,
        employeeName,
        employeeRole,
        trigger,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/settings/backup-and-restore/restore
  // body: { filename: "backup-full_2025-03-16_2330.sql", employeeId? }
  router.post("/restore", async (req, res, next) => {
    const { filename, employeeId = null, employeeRole = null } = req.body || {};
    if (!filename) {
      return res.status(400).json({ error: "filename is required" });
    }

    const safeName = path.basename(filename);
    const fullPath = path.join(BACKUP_DIR, safeName);

    let jobId;

    try {
      ensureBackupEnv();

      // make sure file exists
      await fsp.access(fullPath, fs.constants.R_OK);

      // log restore job as running
      const result = await db.query(
        `
        INSERT INTO backup_jobs
          (action, trigger_source, backup_type, filename, status, created_by_employee_id, started_at)
        VALUES
          ('restore', 'manual', 'full', ?, 'running', ?, NOW())
        `,
        [safeName, employeeId]
      );
      jobId = result.insertId;

      // run mysql < backup.sql
      const args = [
        `-h${DB_HOST}`,
        `-P${DB_PORT}`,
        `-u${DB_USER}`,
        `-p${DB_PASSWORD}`,
        DB_NAME,
      ];

      await new Promise((resolve, reject) => {
        const inStream = fs.createReadStream(fullPath);
        const proc = spawn("mysql", args);

        inStream.pipe(proc.stdin);

        let stderrBuf = "";

        proc.stderr.on("data", (chunk) => {
          stderrBuf += chunk.toString();
        });

        proc.on("error", (err) => reject(err));

        proc.on("close", (code) => {
          if (code === 0) return resolve();
          reject(new Error(stderrBuf || `mysql exited with code ${code}`));
        });
      });

      // mark success
      await db.query(
        `
        UPDATE backup_jobs
        SET status = 'success',
            message = 'Restore completed successfully',
            finished_at = NOW()
        WHERE id = ?
        `,
        [jobId]
      );

      const actorEmployee = employeeId ? `User #${employeeId}` : "System";
      const actorRole = employeeId ? (employeeRole || "Employee") : "System";

      // 🔹 AUDIT TRAIL: RESTORE SUCCESS
      await logAuditTrail({
        employee: actorEmployee,
        role: actorRole,
        action: "Restore - Manual",
        detail: {
          statusMessage: "Database restore completed successfully.",
          actionDetails: {
            actionType: "Database Restore",
            reference: safeName,
            amount: "—",
            reason: "Restore from UI",
          },
          affectedData: {
            items: [],
            statusChange: `Database restored from backup file ${safeName}`,
          },
          restoreJob: {
            id: jobId,
            action: "restore",
            trigger_source: "manual",
            backup_type: "full",
            filename: safeName,
            status: "success",
          },
        },
      });

      res.json({
        ok: true,
        jobId,
        filename: safeName,
      });
    } catch (err) {
      console.error("[RESTORE] Error during restore:", err);

      // if we already created a job, mark failed
      if (jobId) {
        try {
          await db.query(
            `
            UPDATE backup_jobs
            SET status = 'failed',
                message = ?
            WHERE id = ?
            `,
            [err.message || String(err), jobId]
          );
        } catch (_) {}
      }

      const actorEmployee = employeeId ? `User #${employeeId}` : "System";
      const actorRole = employeeId ? (employeeRole || "Employee") : "System";

      // 🔹 AUDIT TRAIL: RESTORE FAILURE
      await logAuditTrail({
        employee: actorEmployee,
        role: actorRole,
        action: "Restore Failed - Manual",
        detail: {
          statusMessage: "Database restore failed.",
          actionDetails: {
            actionType: "Database Restore",
            reference: safeName,
            amount: "—",
            reason: "Restore from UI",
          },
          affectedData: {
            items: [],
            statusChange: "Database restore did not complete.",
          },
          restoreJob: {
            id: jobId || null,
            action: "restore",
            trigger_source: "manual",
            backup_type: "full",
            filename: safeName,
            status: "failed",
          },
          error: {
            message: err.message || String(err),
          },
        },
      });

      next(err);
    }
  });

  // DELETE /api/settings/backup-and-restore/backups/:filename
  router.delete("/backups/:filename", async (req, res, next) => {
    const filename = req.params.filename;
    if (!filename) {
      return res.status(400).json({ error: "filename param required" });
    }

    const safeName = path.basename(filename);
    const fullPath = path.join(BACKUP_DIR, safeName);

    try {
      await fsp.unlink(fullPath);

      // 🔹 AUDIT TRAIL: BACKUP FILE DELETED
      await logAuditTrail({
        employee: "System",
        role: "System",
        action: "Backup File Deleted",
        detail: {
          statusMessage: "Backup file deleted from backup directory.",
          actionDetails: {
            actionType: "Delete Backup File",
            reference: safeName,
            amount: "—",
            reason: "Deleted from Backup & Restore UI",
          },
          affectedData: {
            items: [],
            statusChange: `File ${safeName} removed from ${BACKUP_DIR}`,
          },
        },
      });

      res.json({ ok: true });
    } catch (err) {
      if (err.code === "ENOENT") return res.status(404).json({ error: "File not found" });
      next(err);
    }
  });

  return router;
};