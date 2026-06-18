-- =============================================================
-- Migration 002_cliente_password.sql
-- Aggiunge credenziali di accesso lato cliente.
-- =============================================================
-- password_hash: bcrypt hash della password personale del cliente.
-- password_must_change: 1 = al primo login forzare cambio password.
-- =============================================================

ALTER TABLE clienti ADD COLUMN password_hash TEXT;
ALTER TABLE clienti ADD COLUMN password_must_change INTEGER NOT NULL DEFAULT 1 CHECK (password_must_change IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_clienti_password ON clienti(password_hash);
