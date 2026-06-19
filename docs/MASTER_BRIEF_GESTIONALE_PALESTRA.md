# MASTER BRIEF DEFINITIVO — GESTIONALE PALESTRA

## 1. Identità del progetto

Il progetto è un **gestionale palestra locale** pensato per **un solo proprietario/admin**.
Non è un prodotto multi-tenant, non è una SaaS cloud, non è una app mobile nativa.

L'obiettivo è fornire uno strumento semplice, ordinato e professionale per gestire:
- clienti;
- tessere NFC;
- pacchetti ingressi;
- check-in;
- schede allenamento;
- revisione allenamenti completati;
- preparazione della seduta successiva.

Il deploy previsto resta **locale**, con prospettiva di utilizzo su **Raspberry Pi / server locale**.

## 2. Vincoli fissi

Questi punti sono da considerare già decisi e non vanno rimessi in discussione senza motivazione esplicita.

- Il gestionale è per **un solo proprietario/admin**.
- Il cliente accede al proprio pannello con **codice cliente**.
- Il lettore NFC previsto è **PN532**.
- Il cliente può iniziare l'allenamento **solo dopo il passaggio della tessera NFC**.
- Il passaggio NFC deve:
  - registrare il check-in;
  - scalare **1 ingresso** dal pacchetto;
  - sbloccare l'allenamento del giorno.
- La logica **giorni / sedute / blocchi** è **già esistente nel progetto** e **non deve essere rigenerata da zero**.
- La programmazione è organizzata in **blocchi mensili**.
- Un blocco corrisponde a **1 mese**.
- Ogni blocco può contenere da **1 a 5 sedute/giorni settimanali**.
- L'admin deve poter:
  - creare clienti;
  - associare tessera NFC;
  - associare pacchetto ingressi;
  - gestire schede e blocchi;
  - revisionare allenamenti completati.
- Il cliente deve poter:
  - vedere la propria seduta disponibile;
  - compilare serie, ripetizioni, carico, note personali;
  - usare un cronometro;
  - vedere note trainer;
  - segnare stato esercizio;
  - inviare la seduta completata.
- L'admin deve ricevere le sedute completate in una sezione chiara: **Schede da revisionare**.
- Dalla revisione l'admin deve poter usare una funzione professionale di **Prepara prossima seduta**.
- I dati anagrafici cliente da privilegiare in UI sono minimi:
  - nome;
  - cognome;
  - codice cliente;
  - note admin;
  - pacchetto associato;
  - tessera NFC;
  - stato cliente.
- Il codice cliente può essere generato nel formato `nome.cognome`, con gestione dei duplicati.
- La UI deve essere:
  - chiara;
  - professionale;
  - semplice;
  - mobile friendly lato cliente;
  - ordinata lato admin.
- Non vanno aggiunte funzioni future non richieste.
- Non vanno create pagine duplicate, route duplicate o logiche parallele.

## 3. Obiettivo del refactor

Il progetto esiste già e funziona, ma oggi risulta confuso, con:
- logiche duplicate;
- helper ripetuti;
- codice morto;
- responsabilità sparse tra route e servizi;
- UI amministrativa disordinata;
- flussi poco lineari.

Il refactor deve quindi:
- **preservare la logica business valida già esistente**;
- eliminare stratificazioni e duplicazioni;
- rendere il codice più leggibile e mantenibile;
- semplificare la navigazione admin;
- chiarire il flusso cliente;
- preparare il progetto a un deploy più solido su Raspberry/server locale.

## 4. Logiche da mantenere

### 4.1 NFC e check-in
Da mantenere la logica per cui il check-in NFC:
- identifica la tessera;
- registra l'evento;
- registra la presenza giornaliera;
- scala un ingresso solo al primo check-in del giorno;
- sblocca l'allenamento solo se la seduta disponibile è quella corretta.

### 4.2 Pacchetti ingressi
Da mantenere il modello a ledger:
- i pacchetti/servizi generano movimenti positivi;
- il check-in genera un movimento negativo;
- il saldo è derivato dai movimenti e non va gestito a mano.

### 4.3 Blocchi / sedute / giorni
Da mantenere la logica già presente per:
- blocchi;
- settimane;
- sedute;
- stato della seduta;
- unica seduta `PROSSIMA` per cliente.

Questa parte va **studiata e rifattorizzata senza reinventarla**.

### 4.4 Revisione e preparazione prossima seduta
Da mantenere il flusso in cui:
- il cliente completa la seduta;
- l'admin la trova nelle schede da revisionare;
- l'admin salva note coach;
- l'admin può preparare la prossima seduta copiando la struttura utile nello slot corretto.

## 5. Ambito UI desiderato

### 5.1 Admin
L'area admin deve diventare più chiara e professionale, con sezioni nette:
- Clienti
- Tessere NFC
- Pacchetti / Pagamenti
- Schede
- Schede da revisionare
- Backup / Export

### 5.2 Cliente
L'area cliente deve restare mobile-first e semplice:
- accesso con codice cliente;
- vista stato accesso / allenamento;
- scheda del giorno chiara;
- compilazione rapida;
- autosave;
- timer;
- invio finale semplice.

## 6. Vincoli operativi per le prossime chat

Nelle prossime fasi di lavoro:
- non rigenerare da zero il dominio blocchi/sedute;
- non sostituire la logica NFC con un'altra architettura se non strettamente necessario;
- non cambiare il modello saldo a ledger;
- non cambiare il database senza una motivazione precisa e controllata;
- non aggiungere feature fuori scope;
- non creare nuovi flussi paralleli al posto di quelli già esistenti;
- rifattorizzare in modo incrementale, a step piccoli e verificabili.

## 7. Priorità reali

Ordine di priorità del progetto:
1. pulizia strutturale del codice;
2. rimozione duplicazioni e codice morto;
3. chiarimento dei flussi route/service;
4. riordino UI admin;
5. riordino UI cliente;
6. hardening per deploy locale/Raspberry.

## 8. Definizione di successo

Il refactor sarà corretto se alla fine il progetto:
- conserva le logiche business centrali già funzionanti;
- elimina pagine/route/logiche duplicate;
- ha responsabilità più pulite tra route, service e rendering;
- offre una UI più ordinata per admin e cliente;
- resta coerente con l'uso locale su Raspberry/server locale;
- non introduce complessità non richiesta.
