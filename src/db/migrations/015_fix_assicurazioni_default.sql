-- Migration 015: corregge DEFAULT stato_pagamento SALDATA → PAGATO
-- SQLite non supporta ALTER COLUMN, si ricrea la tabella.
-- La tabella era vuota al momento dell'applicazione.
CREATE TABLE assicurazioni_annuali_cliente_new (
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
INSERT INTO assicurazioni_annuali_cliente_new
  (id, cliente_id, anno, data_inizio, data_fine, stato_pagamento, note, created_at, updated_at)
SELECT
  id, cliente_id, anno, data_inizio, data_fine,
  CASE stato_pagamento
    WHEN 'SALDATA'   THEN 'PAGATO'
    WHEN 'DA_PAGARE' THEN 'DA_SALDARE'
    ELSE stato_pagamento
  END,
  note, created_at, updated_at
FROM assicurazioni_annuali_cliente;
DROP TABLE assicurazioni_annuali_cliente;
ALTER TABLE assicurazioni_annuali_cliente_new RENAME TO assicurazioni_annuali_cliente;
