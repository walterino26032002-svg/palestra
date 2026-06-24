-- Migration 010: tabella abbonamenti mensili per cliente
CREATE TABLE IF NOT EXISTS abbonamenti_mensili_cliente (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id          INTEGER NOT NULL,
  tipo_abbonamento_id INTEGER,
  data_inizio         TEXT NOT NULL,
  data_fine           TEXT NOT NULL,
  stato_pagamento     TEXT NOT NULL DEFAULT 'PAGATO',
  note                TEXT,
  admin_id            INTEGER,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES clienti(id) ON DELETE CASCADE,
  FOREIGN KEY (tipo_abbonamento_id) REFERENCES servizi(id) ON DELETE SET NULL
);
