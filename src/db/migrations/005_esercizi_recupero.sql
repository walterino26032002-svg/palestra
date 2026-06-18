-- =============================================================
-- Migration 005_esercizi_recupero.sql
-- Aggiunge colonna recupero agli esercizi (es. "90s", "1'30").
-- =============================================================

ALTER TABLE esercizi ADD COLUMN recupero TEXT;
