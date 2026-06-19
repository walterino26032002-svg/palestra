# PROMPT RIPARTENZA — CLAUDE / CURSOR / CHATGPT

Sto lavorando su un progetto esistente chiamato **gestionale-palestra**.
È un gestionale locale per palestra/coaching, pensato per **un solo proprietario/admin**.

Prima di procedere, considera queste decisioni già prese come vincolanti:

- il progetto non va riscritto da zero;
- la logica business esiste già e va prima studiata e poi rifattorizzata;
- il cliente accede con **codice cliente**;
- il lettore NFC previsto è **PN532**;
- il cliente può iniziare l'allenamento solo dopo passaggio tessera NFC;
- il passaggio NFC deve registrare check-in, scalare un ingresso e sbloccare l'allenamento;
- il modello pacchetti ingressi / saldo a ledger va mantenuto;
- la logica **blocchi / settimane / sedute / PROSSIMA / COMPLETATA** esiste già e **non deve essere rigenerata da zero**;
- la revisione coach della seduta completata esiste già e va mantenuta;
- la funzione **prepara prossima seduta** esiste già e va mantenuta/refattorizzata, non reinventata;
- la UI finale dovrà essere più chiara, professionale, semplice e ordinata;
- il deploy futuro previsto è su **Raspberry Pi / server locale**.

Documenti di continuità già presenti nel progetto:
- `docs/MASTER_BRIEF_GESTIONALE_PALESTRA.md`
- `docs/AUDIT_PROGETTO_ATTUALE.md`
- `docs/REFACTOR_PLAN_STEP_BY_STEP.md`
- `docs/TODO_PROSSIMA_CHAT.md`

Prima di fare qualunque modifica:
1. leggi questi documenti;
2. allineati al brief definitivo;
3. non proporre una nuova architettura completa;
4. non introdurre feature nuove;
5. non cambiare database se non strettamente necessario;
6. non cambiare la logica di NFC, pacchetti, blocchi o sedute se non serve davvero al cleanup dello step corrente.

Vincoli forti:
- non rigenerare il dominio blocchi/sedute;
- non rifare da zero la logica NFC;
- non sostituire il modello saldo ingressi a ledger;
- non creare route duplicate;
- non creare nuove pagine parallele;
- non aggiungere complessità frontend non richiesta.

Adesso devi procedere **solo con STEP 1** del piano:
**cleanup strutturale senza cambiare logica business**.

Obiettivo dello STEP 1:
- rimuovere codice morto;
- rimuovere file HTML non usati;
- rimuovere route shadowed/inutili confermate;
- rimuovere middleware non usati;
- rimuovere duplicazioni locali banali;
- non toccare i flussi business vivi.

Cosa NON devi fare in questo step:
- non cambiare logica check-in NFC;
- non cambiare logica pacchetti/ingressi;
- non cambiare logica blocchi/sedute;
- non cambiare la logica revisione;
- non cambiare il database;
- non fare redesign UI;
- non iniziare lo STEP 2.

Voglio che tu:
1. analizzi i file da toccare nello STEP 1;
2. proponga un micro-piano di cleanup coerente;
3. esegua solo le modifiche strettamente necessarie allo STEP 1;
4. al termine mi dia:
   - elenco file modificati;
   - elenco file eliminati;
   - motivo di ogni modifica;
   - test manuali da fare;
   - conferma esplicita che la logica business non è stata alterata.
