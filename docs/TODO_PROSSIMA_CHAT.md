# TODO PROSSIMA CHAT

1. Eseguire STEP 1 — cleanup strutturale senza cambiare logica business.
2. Rileggere `docs/MASTER_BRIEF_GESTIONALE_PALESTRA.md` per allinearsi al brief definitivo prima di toccare qualunque file.
3. Rileggere `docs/AUDIT_PROGETTO_ATTUALE.md` per confermare mappa reale, duplicazioni, codice morto e rischi già identificati.
4. Lavorare solo sui punti di cleanup già confermati: file morti, route shadowed, middleware inutili, duplicazioni locali evidenti.
5. Non modificare logica NFC, pacchetti ingressi, saldo a ledger, blocchi, sedute, revisioni o database nello STEP 1.
6. Prima di ogni modifica, verificare se il file coinvolto appartiene a flusso vivo o a codice morto.
7. A fine STEP 1, produrre un riepilogo con:
   - file modificati;
   - file eliminati;
   - motivazione di ogni cleanup;
   - eventuali dubbi residui.
8. Eseguire solo test manuali minimi di non regressione coerenti con lo STEP 1.
9. Fermarsi a fine STEP 1 e non proseguire automaticamente con STEP 2.
10. Chiedere conferma esplicita prima di iniziare la centralizzazione helper del STEP 2.
