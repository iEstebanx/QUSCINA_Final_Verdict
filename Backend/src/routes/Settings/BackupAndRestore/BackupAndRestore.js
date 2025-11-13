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
      // Last successful BACKUP job
      const [last] = await db.query(
        `
        SELECT action, backup_type, filename, size_bytes, status, finished_at
        FROM backup_jobs
        WHERE action = 'backup' AND status = 'success'
        ORDER BY finished_at DESC
        LIMIT 1
        `
      );

      const [{ total } = { total: 0 }] = await db.query(
        `SELECT COUNT(*) AS total FROM backup_jobs WHERE action = 'backup'`
      );

      // naive storage calc by scanning dir
      const entries = await fsp.readdir(BACKUP_DIR, { withFileTypes: true });
      let totalBytes = 0;
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!ent.name.toLowerCase().endsWith(".sql")) continue;
        const st = await fsp.stat(path.join(BACKUP_DIR, ent.name));
        totalBytes += st.size;
      }

      // fake schedule read (just frequency/time_of_day)
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
        totalBackups: total,
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

  // POST /api/settings/backup-and-restore/backup-now
  // body: { backupType: 'full' | 'schema', notes?: string, employeeId?: string }
  router.post("/backup-now", async (req, res, next) => {
    const { backupType = "full", notes = null, employeeId = null, trigger = "manual" } =
      req.body || {};

    try {
      ensureBackupEnv();

        const filename = buildFilename(backupType);
        const fullPath = path.join(BACKUP_DIR, filename);

        console.log("[BACKUP] BACKUP_DIR =", BACKUP_DIR);
        console.log("[BACKUP] Full path  =", fullPath);

      // log job as pending
      const result = await db.query(
        `
        INSERT INTO backup_jobs
          (action, trigger_source, backup_type, filename, status, notes, created_by_employee_id)
        VALUES
          ('backup', ?, ?, ?, 'running', ?, ?)
        `,
        [trigger, backupType, filename, notes, employeeId]
      );
      const jobId = result.insertId;

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

    res.json({
        ok: true,
        filename,
        sizeBytes: st.size,
        jobId,
        dir: BACKUP_DIR,
        fullPath,
    });
    } catch (err) {
      // mark as failed if we created a job
      if (err && err.jobId) {
        await db.query(
          `
          UPDATE backup_jobs
          SET status = 'failed', message = ?, finished_at = NOW()
          WHERE id = ?
          `,
          [err.message || String(err), err.jobId]
        ).catch(() => {});
      }
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

    // ⚠ For now just stub. Later you can wire mysql < file logic.
    try {
      await db.query(
        `
        INSERT INTO backup_jobs
          (action, trigger_source, backup_type, filename, status, notes, created_by_employee_id)
        VALUES
          ('restore', 'manual', 'full', ?, 'pending', 'TODO: implement restore', ?)
        `,
        [filename, employeeId]
      );

      res.status(501).json({
        ok: false,
        message: "Restore backend not implemented yet. (Stub record created.)",
      });
    } catch (err) {
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