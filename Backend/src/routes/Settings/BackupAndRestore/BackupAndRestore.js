// Backend/src/routes/Settings/BackupAndRestore/BackupAndRestore.js
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

// --------------------------- MAIN EXPORT ---------------------------

module.exports = function BackupAndRestoreRoutes({ db }) {
  const router = Router();

  async function runBackupJob({
    backupType = "full",
    notes = null,
    employeeId = null,
    trigger = "manual",
  } = {}) {
    ensureBackupEnv();

    const filename = buildFilename(backupType);
    const fullPath = path.join(BACKUP_DIR, filename);

    console.log("[BACKUP] BACKUP_DIR =", BACKUP_DIR);
    console.log("[BACKUP] Full path  =", fullPath);

    let jobId;

    try {
      // log job as running
      const result = await db.query(
        `
        INSERT INTO backup_jobs
          (action, trigger_source, backup_type, filename, status, notes, created_by_employee_id)
        VALUES
          ('backup', ?, ?, ?, 'running', ?, ?)
        `,
        [trigger, backupType, filename, notes, employeeId]
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

      await db.query(
        `
        UPDATE backup_jobs
        SET status = 'success',
            size_bytes = ?,
            finished_at = NOW()
        WHERE id = ?
        `,
        [st.size, jobId]
      );

      return {
        ok: true,
        filename,
        sizeBytes: st.size,
        jobId,
        dir: BACKUP_DIR,
        fullPath,
      };
    } catch (err) {
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
        notes: `[SCHEDULE] Daily backup at ${sched.time_of_day}`,
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
        SELECT frequency, time_of_day, next_run_at, retention_days
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
          notes,
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
    const { frequency = "daily", timeOfDay, retentionDays = null } = req.body || {};

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
        SELECT frequency, time_of_day, next_run_at, retention_days
        FROM backup_schedule
        WHERE id = 1
        LIMIT 1
        `
      );

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
      notes = null,
      employeeId = null,
      trigger = "manual",
    } = req.body || {};

    try {
      const result = await runBackupJob({
        backupType,
        notes,
        employeeId,
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
    const { filename, employeeId = null } = req.body || {};
    if (!filename) {
      return res.status(400).json({ error: "filename is required" });
    }

    try {
      ensureBackupEnv();

      // safety: strip any path parts like ../../
      const safeName = path.basename(filename);
      const fullPath = path.join(BACKUP_DIR, safeName);

      // make sure file exists
      await fsp.access(fullPath, fs.constants.R_OK);

      // log restore job as running
      const result = await db.query(
        `
        INSERT INTO backup_jobs
          (action, trigger_source, backup_type, filename, status, notes, created_by_employee_id, started_at)
        VALUES
          ('restore', 'manual', 'full', ?, 'running', 'Restore from UI', ?, NOW())
        `,
        [safeName, employeeId]
      );
      const jobId = result.insertId;

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

      res.json({
        ok: true,
        jobId,
        filename: safeName,
      });
    } catch (err) {
      console.error("[RESTORE] Error during restore:", err);
      // if we already created a job, mark failed
      if (err && err.message && /insertId/.test(String(err)) === false) {
        // best-effort: job may or may not exist, so wrap in try
        try {
          await db.query(
            `
            UPDATE backup_jobs
            SET status = 'failed',
                message = ?
            WHERE action = 'restore' AND filename = ? AND status = 'running'
            ORDER BY started_at DESC
            LIMIT 1
            `,
            [err.message || String(err), filename]
          );
        } catch (_) {}
      }
      next(err);
    }
  });

  // DELETE /api/settings/backup-and-restore/backups/:filename
  router.delete("/backups/:filename", async (req, res, next) => {
    const filename = req.params.filename;
    if (!filename) {
      return res.status(400).json({ error: "filename param required" });
    }

    const fullPath = path.join(BACKUP_DIR, filename);
    try {
      await fsp.unlink(fullPath);
      res.json({ ok: true });
    } catch (err) {
      if (err.code === "ENOENT") return res.status(404).json({ error: "File not found" });
      next(err);
    }
  });

  return router;
};