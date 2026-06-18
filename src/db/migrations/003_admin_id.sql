-- =============================================================
-- Migration 003_admin_id.sql
-- Collega pagamenti e movimenti_ingressi all'admin che li ha
-- registrati. Nullable per retrocompatibilità.
-- =============================================================

ALTER TABLE pagamenti           ADD COLUMN admin_id INTEGER REFERENCES admin(id) ON DELETE SET NULL;
ALTER TABLE movimenti_ingressi  ADD COLUMN admin_id INTEGER REFERENCES admin(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pagamenti_admin   ON pagamenti(admin_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_admin   ON movimenti_ingressi(admin_id);
