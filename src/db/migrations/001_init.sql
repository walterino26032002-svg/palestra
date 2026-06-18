-- =============================================================
-- Migration 001_init.sql — schema base gestionale palestra V1
-- =============================================================
-- Eseguita da src/db/migrator.js dentro una transazione.
-- Convenzioni:
--   - PK autoincrement dove utile
--   - timestamps testuali ISO 8601
--   - stato come TEXT + CHECK per allinearsi al dominio
-- =============================================================

-- -------------------------------------------------------------
-- Amministratore
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------------
-- Clienti
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clienti (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT NOT NULL,
  cognome      TEXT NOT NULL,
  email        TEXT,
  telefono     TEXT,
  note         TEXT,
  attivo       INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0, 1)),
  creato_il    TEXT NOT NULL DEFAULT (datetime('now')),
  aggiornato_il TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clienti_cognome ON clienti(cognome);
CREATE INDEX IF NOT EXISTS idx_clienti_attivo  ON clienti(attivo);

-- -------------------------------------------------------------
-- Tessere NFC
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nfc_tessere (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tessera_uid  TEXT NOT NULL UNIQUE,
  cliente_id   INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
  attiva       INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0, 1)),
  creata_il    TEXT NOT NULL DEFAULT (datetime('now')),
  assegnata_il TEXT
);

CREATE INDEX IF NOT EXISTS idx_nfc_tessere_cliente ON nfc_tessere(cliente_id);

-- Storico assegnazioni tessera (chi l'ha avuta e quando)
CREATE TABLE IF NOT EXISTS storico_nfc (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tessera_uid  TEXT NOT NULL,
  cliente_id   INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
  assegnata_il TEXT NOT NULL DEFAULT (datetime('now')),
  rimossa_il   TEXT
);

CREATE INDEX IF NOT EXISTS idx_storico_nfc_tessera ON storico_nfc(tessera_uid);
CREATE INDEX IF NOT EXISTS idx_storico_nfc_cliente ON storico_nfc(cliente_id);

-- Log raw di ogni lettura NFC (sempre, anche per card sconosciute)
CREATE TABLE IF NOT EXISTS nfc_eventi (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tessera_uid  TEXT NOT NULL,
  cliente_id   INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
  letto_il     TEXT NOT NULL DEFAULT (datetime('now')),
  sorgente     TEXT,                 -- es: 'simulatore', 'endpoint'
  esito        TEXT                  -- es: 'ok', 'already', 'inactive', 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_nfc_eventi_cliente ON nfc_eventi(cliente_id);
CREATE INDEX IF NOT EXISTS idx_nfc_eventi_letto   ON nfc_eventi(letto_il);

-- -------------------------------------------------------------
-- Presenze: una riga al giorno per cliente
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presenze (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id  INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,         -- 'YYYY-MM-DD'
  entrata_il  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(cliente_id, data)
);

CREATE INDEX IF NOT EXISTS idx_presenze_cliente ON presenze(cliente_id);
CREATE INDEX IF NOT EXISTS idx_presenze_data    ON presenze(data);

-- -------------------------------------------------------------
-- Servizi (abbonamenti / pacchetti)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servizi (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT NOT NULL,
  descrizione     TEXT,
  ingressi        INTEGER NOT NULL DEFAULT 1 CHECK (ingressi >= 0),
  prezzo_cent     INTEGER NOT NULL DEFAULT 0 CHECK (prezzo_cent >= 0), -- centesimi
  attivo          INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0, 1)),
  creato_il       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------------
-- Pagamenti
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagamenti (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id  INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  servizio_id INTEGER REFERENCES servizi(id) ON DELETE SET NULL,
  importo_cent INTEGER NOT NULL CHECK (importo_cent >= 0),
  metodo      TEXT,                -- contanti, bonifico, satispay...
  note        TEXT,
  pagato_il   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pagamenti_cliente ON pagamenti(cliente_id);

-- -------------------------------------------------------------
-- Movimenti ingressi (ledger saldo)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimenti_ingressi (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id   INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  delta        INTEGER NOT NULL,    -- +N pagamento, -1 check-in
  motivo       TEXT NOT NULL,       -- 'pagamento', 'checkin', 'correzione'
  riferimento_id INTEGER,           -- id pagamento / presenza
  creato_il    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_movimenti_cliente ON movimenti_ingressi(cliente_id);

-- -------------------------------------------------------------
-- Blocchi (training block) e sedute
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocchi (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id   INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  data_inizio  TEXT NOT NULL,            -- 'YYYY-MM-DD'
  settimane    INTEGER NOT NULL DEFAULT 4 CHECK (settimane > 0),
  sedute_per_settimana INTEGER NOT NULL DEFAULT 5 CHECK (sedute_per_settimana > 0),
  creato_il    TEXT NOT NULL DEFAULT (datetime('now')),
  archiviato   INTEGER NOT NULL DEFAULT 0 CHECK (archiviato IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_blocchi_cliente ON blocchi(cliente_id);

CREATE TABLE IF NOT EXISTS sedute (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  blocco_id         INTEGER NOT NULL REFERENCES blocchi(id) ON DELETE CASCADE,
  cliente_id        INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  indice_settimana  INTEGER NOT NULL CHECK (indice_settimana >= 1),
  indice_seduta     INTEGER NOT NULL CHECK (indice_seduta >= 1),
  stato             TEXT NOT NULL DEFAULT 'BOZZA'
                    CHECK (stato IN ('BOZZA','PROSSIMA','COMPLETATA','SALTATA')),
  titolo            TEXT,
  note              TEXT,
  creata_il         TEXT NOT NULL DEFAULT (datetime('now')),
  aggiornata_il     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sedute_blocco   ON sedute(blocco_id);
CREATE INDEX IF NOT EXISTS idx_sedute_cliente  ON sedute(cliente_id);
CREATE INDEX IF NOT EXISTS idx_sedute_stato    ON sedute(stato);
-- Vincolo applicativo (gestito in service): massimo 1 PROSSIMA per cliente.
-- Non esprimibile come partial UNIQUE cross-table in SQLite < 3.31, lo
-- garantiamo via transazione nell'application layer.

-- -------------------------------------------------------------
-- Esercizi di una seduta
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS esercizi (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  seduta_id    INTEGER NOT NULL REFERENCES sedute(id) ON DELETE CASCADE,
  ordine       INTEGER NOT NULL DEFAULT 0,
  nome         TEXT NOT NULL,
  serie        INTEGER,
  ripetizioni  TEXT,         -- '8-10', '12', 'AMRAP', ecc.
  carico       TEXT,         -- descrizione libera ('60kg', 'corpo libero')
  note         TEXT,
  creato_il    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_esercizi_seduta ON esercizi(seduta_id);

-- -------------------------------------------------------------
-- Feedback
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_esercizi (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  esercizio_id INTEGER NOT NULL REFERENCES esercizi(id) ON DELETE CASCADE,
  cliente_id   INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  carico_effettivo TEXT,
  reps_effettive   TEXT,
  difficolta   INTEGER,     -- 1..5 RPE percepito
  note         TEXT,
  aggiornato_il TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(esercizio_id, cliente_id)
);

CREATE TABLE IF NOT EXISTS feedback_seduta (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  seduta_id     INTEGER NOT NULL REFERENCES sedute(id) ON DELETE CASCADE,
  cliente_id    INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  commento      TEXT,
  voto          INTEGER,            -- 1..5 generale
  inviato_il    TEXT,
  revisionato_il TEXT,
  note_coach    TEXT,
  UNIQUE(seduta_id, cliente_id)
);

-- -------------------------------------------------------------
-- Bacheca admin
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avvisi_bacheca (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo         TEXT NOT NULL,    -- 'seduta_mancante', 'saldo_negativo', ...
  cliente_id   INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
  messaggio    TEXT NOT NULL,
  creato_il    TEXT NOT NULL DEFAULT (datetime('now')),
  letto        INTEGER NOT NULL DEFAULT 0 CHECK (letto IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_avvisi_cliente ON avvisi_bacheca(cliente_id);
CREATE INDEX IF NOT EXISTS idx_avvisi_letto   ON avvisi_bacheca(letto);

-- -------------------------------------------------------------
-- Log backup
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  percorso     TEXT NOT NULL,
  tipo         TEXT NOT NULL,    -- 'auto', 'manual'
  esito        TEXT NOT NULL,    -- 'ok', 'errore'
  messaggio    TEXT,
  creato_il    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------------
-- Tabella di stato migration (gestita da migrator.js)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version      TEXT PRIMARY KEY,
  applicata_il TEXT NOT NULL DEFAULT (datetime('now'))
);
