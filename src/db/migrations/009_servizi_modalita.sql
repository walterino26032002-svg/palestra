-- Migration 009: aggiungi modalita ai tipi servizio (INGRESSI / MENSILE)
ALTER TABLE servizi ADD COLUMN modalita TEXT NOT NULL DEFAULT 'INGRESSI';
