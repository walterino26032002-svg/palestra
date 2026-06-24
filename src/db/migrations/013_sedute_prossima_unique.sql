-- Migration 013: indice parziale unique su sedute(cliente_id) WHERE stato='PROSSIMA'
-- Garantisce strutturalmente che un cliente abbia al massimo una seduta PROSSIMA.
-- Verificato: nessun duplicato PROSSIMA nel DB al momento dell'applicazione.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sedute_unica_prossima_per_cliente
  ON sedute(cliente_id)
  WHERE stato = 'PROSSIMA';
