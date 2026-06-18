'use strict';

/**
 * Backup / restore locale del database SQLite.
 *
 * Strategia: si usa l'API nativa better-sqlite3 `db.backup(dest)` che è
 * WAL-aware e produce un singolo file .sqlite consistente anche a server
 * attivo. NON si copia il file grezzo (il -wal potrebbe contenere dati non
 * ancora in checkpoint).
 *
 * Sicurezza:
 *   - i filename sono validati con whitelist regex + path.basename + prefix
 *     check sul path risolto (anti path-traversal);
 *   - restore accetta SOLO file presenti in backupDir;
 *   - prima di un restore si crea un backup d'emergenza (pre_restore).
 *
 * Nessun backup su cloud. node_modules non è incluso (si copia solo il DB).
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const config = require('../config');
const { getDb, closeDb } = require('../db/connection');

// gestionale_backup_YYYY-MM-DD_HH-mm-ss[_auto|_manual|_pre_restore].sqlite
const NAME_RE = /^gestionale_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_[a-z_]+)?\.sqlite$/;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function buildName(tipo) {
  const suffix = tipo ? `_${tipo}` : '';
  return `gestionale_backup_${stamp()}${suffix}.sqlite`;
}

/**
 * Valida un filename di backup e ritorna il path assoluto sicuro dentro backupDir.
 * Lancia errore (code 'invalid_filename') su qualsiasi tentativo di traversal.
 */
function safeBackupPath(filename) {
  if (!filename || typeof filename !== 'string') {
    const e = new Error('Filename mancante'); e.code = 'invalid_filename'; throw e;
  }
  // niente separatori / niente ..
  if (path.basename(filename) !== filename) {
    const e = new Error('Filename non valido'); e.code = 'invalid_filename'; throw e;
  }
  if (!NAME_RE.test(filename)) {
    const e = new Error('Filename non conforme al formato backup'); e.code = 'invalid_filename'; throw e;
  }
  const full = path.resolve(config.backupDir, filename);
  if (full !== path.join(config.backupDir, filename) || !full.startsWith(config.backupDir + path.sep)) {
    const e = new Error('Path non consentito'); e.code = 'invalid_filename'; throw e;
  }
  return full;
}

function logBackup({ percorso, tipo, esito, messaggio = null }) {
  try {
    getDb().prepare(`
      INSERT INTO backup_log (percorso, tipo, esito, messaggio)
      VALUES (?, ?, ?, ?)
    `).run(percorso, tipo, esito, messaggio);
  } catch (e) {
    // il log non deve mai far fallire il backup
    console.error('[backup] log fallito:', e.message);
  }
}

/**
 * Crea un backup. tipo: 'manual' | 'auto' | 'pre_restore'.
 * @returns {Promise<{filename, percorso, size, creato_il}>}
 */
async function creaBackup(tipo = 'manual') {
  const filename = buildName(tipo);
  const dest = path.join(config.backupDir, filename);
  try {
    await getDb().backup(dest);
    const size = fs.statSync(dest).size;
    logBackup({ percorso: filename, tipo, esito: 'ok', messaggio: `size=${size}` });
    return { filename, percorso: dest, size, creato_il: new Date().toISOString() };
  } catch (e) {
    logBackup({ percorso: filename, tipo, esito: 'errore', messaggio: e.message });
    const err = new Error('Backup fallito: ' + e.message); err.code = 'backup_failed'; throw err;
  }
}

/** Elenco backup presenti su disco (con dati da backup_log se disponibili). */
function listBackup() {
  let files = [];
  try {
    files = fs.readdirSync(config.backupDir).filter((f) => NAME_RE.test(f));
  } catch (e) {
    return [];
  }
  const rows = files.map((f) => {
    const full = path.join(config.backupDir, f);
    let size = 0; let mtime = null;
    try { const st = fs.statSync(full); size = st.size; mtime = st.mtime.toISOString(); } catch (_) {}
    return { filename: f, size, modificato_il: mtime };
  });
  rows.sort((a, b) => (a.modificato_il < b.modificato_il ? 1 : -1));
  return rows;
}

function listBackupLog({ limit = 100 } = {}) {
  return getDb().prepare(`
    SELECT id, percorso, tipo, esito, messaggio, creato_il
    FROM backup_log ORDER BY id DESC LIMIT ?
  `).all(limit);
}

/**
 * Ripristina un backup. Crea PRIMA un backup d'emergenza (pre_restore),
 * poi sostituisce il DB, riapre e verifica l'integrità.
 * @returns {Promise<{restored, pre_restore, integrity}>}
 */
async function restoreBackup(filename) {
  const src = safeBackupPath(filename);
  if (!fs.existsSync(src)) {
    const e = new Error('File di backup inesistente'); e.code = 'not_found'; throw e;
  }

  // 1) backup d'emergenza dello stato corrente
  const pre = await creaBackup('pre_restore');

  // 2) chiudi connessione per rilasciare lock WAL/SHM
  closeDb();

  // 3) rimuovi -wal/-shm orfani e sostituisci il DB
  try {
    for (const ext of ['-wal', '-shm']) {
      const sidecar = config.dbPath + ext;
      if (fs.existsSync(sidecar)) { try { fs.unlinkSync(sidecar); } catch (_) {} }
    }
    fs.copyFileSync(src, config.dbPath);
  } catch (e) {
    // tenta di riaprire comunque
    getDb();
    logBackup({ percorso: filename, tipo: 'restore', esito: 'errore', messaggio: e.message });
    const err = new Error('Restore fallito durante la copia: ' + e.message); err.code = 'restore_failed'; throw err;
  }

  // 4) riapri e verifica integrità
  const db = getDb();
  let integrity = 'unknown';
  try {
    const row = db.prepare('PRAGMA integrity_check').get();
    integrity = row ? (row.integrity_check || Object.values(row)[0]) : 'unknown';
  } catch (e) {
    integrity = 'error: ' + e.message;
  }

  if (integrity !== 'ok') {
    // rollback dal backup d'emergenza
    try {
      closeDb();
      fs.copyFileSync(pre.percorso, config.dbPath);
      getDb();
    } catch (_) {}
    logBackup({ percorso: filename, tipo: 'restore', esito: 'errore', messaggio: `integrity=${integrity}, rollback eseguito` });
    const err = new Error('Restore annullato: integrity_check = ' + integrity); err.code = 'restore_integrity'; throw err;
  }

  logBackup({ percorso: filename, tipo: 'restore', esito: 'ok', messaggio: `pre_restore=${pre.filename}` });
  return { restored: filename, pre_restore: pre.filename, integrity };
}

/**
 * Retention prudente: cancella SOLO i backup 'auto'/'manual' più vecchi di
 * BACKUP_RETENTION_DAYS, mantenendo sempre almeno BACKUP_MIN_KEEP file.
 * Non tocca mai i pre_restore. Disabilitata se retentionDays <= 0.
 */
function applicaRetention() {
  const days = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
  const minKeep = parseInt(process.env.BACKUP_MIN_KEEP || '5', 10);
  if (!Number.isFinite(days) || days <= 0) return { deleted: [] };

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  // candidati: solo auto/manual (mai pre_restore)
  const all = listBackup().filter((b) => /_(auto|manual)\.sqlite$/.test(b.filename));
  // ordina dal più recente; mantieni i primi minKeep comunque
  const eliminabili = all.slice(minKeep).filter((b) => {
    const t = b.modificato_il ? Date.parse(b.modificato_il) : Date.now();
    return t < cutoff;
  });
  const deleted = [];
  for (const b of eliminabili) {
    try {
      fs.unlinkSync(path.join(config.backupDir, b.filename));
      deleted.push(b.filename);
    } catch (_) {}
  }
  if (deleted.length) console.log(`[backup] retention: rimossi ${deleted.length} backup`);
  return { deleted };
}

let cronTask = null;

/** Avvia il cron di backup automatico se BACKUP_ENABLED=true. */
function startBackupCron() {
  if (cronTask) return cronTask;
  const enabled = String(process.env.BACKUP_ENABLED || 'true').toLowerCase() === 'true';
  if (!enabled) {
    console.log('[backup] cron disabilitato (BACKUP_ENABLED=false)');
    return null;
  }
  const expr = process.env.BACKUP_CRON || '17 3 * * *';
  if (!cron.validate(expr)) {
    console.error('[backup] BACKUP_CRON non valido:', expr);
    return null;
  }
  cronTask = cron.schedule(expr, async () => {
    try {
      const r = await creaBackup('auto');
      console.log(`[backup] auto creato: ${r.filename} (${r.size} byte)`);
      applicaRetention();
    } catch (e) {
      console.error('[backup] auto fallito:', e.message);
    }
  });
  console.log(`[backup] cron attivo: "${expr}"`);
  return cronTask;
}

function stopBackupCron() {
  if (cronTask) { cronTask.stop(); cronTask = null; }
}

module.exports = {
  NAME_RE,
  safeBackupPath,
  creaBackup,
  listBackup,
  listBackupLog,
  restoreBackup,
  applicaRetention,
  startBackupCron,
  stopBackupCron,
};
