-- Migration 012: indice unico su presenze(cliente_id, data)
-- Garantisce strutturalmente che non si crei più di una presenza
-- per lo stesso cliente nello stesso giorno (race condition doppio check-in).
-- Nessun duplicato nel DB al momento dell'applicazione (verificato).
UPDATE nfc_tessere SET tessera_uid = UPPER(tessera_uid) WHERE tessera_uid != UPPER(tessera_uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_presenze_cliente_data_unique
  ON presenze(cliente_id, data);
