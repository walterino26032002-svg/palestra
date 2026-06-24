-- Migration 008: aggiungi campo RPE agli esercizi della scheda
ALTER TABLE esercizi ADD COLUMN rpe TEXT;
