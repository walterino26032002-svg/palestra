-- Migration 011: aggiungi stato_pagamento ai pagamenti (PAGATO / DA_SALDARE)
ALTER TABLE pagamenti ADD COLUMN stato_pagamento TEXT NOT NULL DEFAULT 'PAGATO';
