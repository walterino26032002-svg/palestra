-- =============================================================
-- Migration 006_cliente_username.sql
-- Aggiunge un identificativo di login testuale (username) ai clienti.
-- =============================================================
-- username: opzionale, unico se valorizzato. Il login cliente accetta
-- username / email / telefono / ID numerico (fallback tecnico).
-- I NULL sono considerati distinti da SQLite: piu' clienti senza
-- username sono ammessi.
-- =============================================================

ALTER TABLE clienti ADD COLUMN username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clienti_username ON clienti(username);
