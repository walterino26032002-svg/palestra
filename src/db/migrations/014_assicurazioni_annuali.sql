-- Migration 014: tabella assicurazioni annuali cliente
-- Stati: PAGATO | DA_SALDARE
CREATE TABLE IF NOT EXISTS assicurazioni_annuali_cliente (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id      INTEGER NOT NULL,
  anno            INTEGER NOT NULL,
  data_inizio     TEXT NOT NULL,
  data_fine       TEXT NOT NULL,
  stato_pagamento TEXT NOT NULL DEFAULT 'PAGATO',
  note            TEXT,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cliente_id, anno),
  FOREIGN KEY (cliente_id) REFERENCES clienti(id) ON DELETE CASCADE
);
