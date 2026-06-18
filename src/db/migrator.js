'use strict';

/**
 * Migrator SQLite minimale.
 * - Crea tabella schema_migrations se manca.
 * - Elenca i file in src/db/migrations ordinati per nome.
 * - Applica quelli non ancora registrati, in transazione.
 *
 * CLI:
 *   node src/db/migrator.js up
 */

const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version      TEXT PRIMARY KEY,
      applicata_il TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getAppliedVersions(db) {
  return new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
}

function applyMigration(db, file) {
  const version = file.replace(/\.sql$/i, '');
  const fullPath = path.join(MIGRATIONS_DIR, file);
  const sql = fs.readFileSync(fullPath, 'utf8');

  // better-sqlite3: exec gestisce più statement separati da ';'
  const tx = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
  });
  tx();
}

function up() {
  const db = getDb();
  ensureMigrationsTable(db);
  const applied = getAppliedVersions(db);
  const files = listMigrationFiles();

  let appliedNow = 0;
  for (const f of files) {
    const version = f.replace(/\.sql$/i, '');
    if (applied.has(version)) continue;
    process.stdout.write(`-> applico ${version} ... `);
    applyMigration(db, f);
    process.stdout.write('ok\n');
    appliedNow += 1;
  }

  if (appliedNow === 0) {
    console.log('Nessuna migration pendente.');
  } else {
    console.log(`Migration applicate: ${appliedNow}`);
  }

  closeDb();
}

function status() {
  const db = getDb();
  ensureMigrationsTable(db);
  const applied = getAppliedVersions(db);
  const files = listMigrationFiles();
  console.log('Migration conosciute:');
  for (const f of files) {
    const v = f.replace(/\.sql$/i, '');
    const segno = applied.has(v) ? '[x]' : '[ ]';
    console.log(`  ${segno} ${v}`);
  }
  closeDb();
}

function main() {
  const cmd = process.argv[2] || 'up';
  if (cmd === 'up') return up();
  if (cmd === 'status') return status();
  console.error(`Comando sconosciuto: ${cmd}. Usa "up" o "status".`);
  process.exit(2);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('Errore migrator:', e.message);
    process.exit(1);
  }
}

module.exports = { up, status };
