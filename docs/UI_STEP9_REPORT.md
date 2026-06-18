# UI STEP 9 — Restyling brand "Accademia — Élite Training Club"

> Restyling UI/UX completo del gestionale, dal look "funzionante ma grezzo" a prodotto premium brandizzato. Nessuna modifica alla logica core (NFC/check-in, sedute, export, backup, dominio).

Data: 2026-06 · Smoke/regressione: 28/28 PASS.

---

## 1. Obiettivo
Trasformare il gestionale nel prodotto proprietario premium della palestra Accademia: identità visiva forte, premium minimal, area cliente mobile-first stile mini-app, area admin ordinata e coerente. Tutta l'interfaccia resta in italiano, con tono elegante e chiaro.

## 2. Scelte estetiche
- **Premium minimal monocromatico**: nero profondo come colore guida, off-white/beige come sfondo, bianco per le card, grigio caldo per testi/bordi, accento oro discreto.
- Topbar admin e area cliente **nere**; superfici chiare; bordi morbidi (radius 14px), ombre leggere.
- Tipografia con **eyebrow** in maiuscoletto tracciato (letter-spacing) per i sottotitoli brand; titoli forti.
- Bottoni a pillola; primario nero pieno, secondario chiaro, danger in outline.
- Card-link con freccia animata; tabelle con header maiuscoletto; empty state dedicati.
- Micro-interazioni sobrie (hover lift, focus ring tenue).

## 3. Palette
| Token | Valore | Uso |
|------|--------|-----|
| `--ink` | `#0e0e0d` | nero profondo (topbar, bottoni, testo forte) |
| `--paper` | `#faf8f4` | off-white / beige sfondo |
| `--surface` | `#ffffff` | card |
| `--surface-2` | `#f3f0ea` | grigio caldo chiaro |
| `--text` | `#16150f` | testo |
| `--muted` | `#8a857a` | testo secondario |
| `--line` | `#e6e1d8` | bordi morbidi |
| `--gold` | `#9c8456` | accento discreto |
| ok/warn/danger | toni desaturati caldi | badge/alert |

## 4. Componenti creati/centralizzati
- **`src/views/adminLayout.js`** (nuovo): layout admin condiviso con navbar unica e coerente (Bacheca operativa, Clienti, Servizi, Schede, Revisioni, Tessere, Avvisi, Export, Backup), brandmark con logo, breadcrumb, voce attiva. Sostituisce le 5 copie duplicate di `adminLayout()`.
- **`public/css/app.css`** riscritto come design system completo: brandmark, auth, topbar/nav, bottoni, alert, card, badge, form, tabelle, empty state, simulatore NFC, area cliente (hero, stat-card, exercise), **cronometro**, responsive. Nomi classe invariati → nessuna rottura del markup esistente.
- Brand mark (`/assets/brand/accademia-logo.jpg`) servito via nuova static route `/assets` e usato in login, topbar admin e area cliente; impostato anche come favicon.

## 5. Pagine restylate
Accesso: `/login`, `/cliente/login` (logo, card premium, payoff "Élite Training Club", testi rivolti all'utente).
Admin: `/admin` (bacheca operativa a card), `/admin/clienti`, `/admin/clienti/:id`, `/admin/servizi`, `/admin/nfc`, `/admin/nfc/simulatore`, `/admin/bacheca`, `/admin/schede`, `/admin/clienti/:id/scheda`, `/admin/sedute/:id`, `/admin/revisioni`, `/admin/sedute/:id/revisione`, `/admin/export`, `/admin/backup` — tutti tramite il layout condiviso (navbar coerente con Revisioni/Export/Backup sempre raggiungibili).
Cliente: `/cliente` (home mini-app: hero, ingressi residui, stato check-in, CTA allenamento, empty state elegante), `/cliente/allenamento` (hero seduta, cronometro, card esercizio mobile-friendly, riepilogo, invio).

## 6. Cronometro / timer
**Implementato ex novo** in `public/js/cliente-workout.js`, visibile nella pagina allenamento:
- Avvia / Pausa / Azzera; display `mm:ss` (passa a `hh:mm:ss` oltre l'ora).
- Sticky in alto su mobile, stile Accademia (barra/pillola scura).
- Client-side puro (requestAnimationFrame), nessun database, non interferisce con feedback/autosave né con il completamento seduta.

## 7. File creati/modificati
**Creati**: `src/views/adminLayout.js`, `docs/UI_STEP9_REPORT.md`.
**Modificati**: `public/css/app.css` (riscritto), `src/server.js` (static `/assets`), `src/routes/auth.routes.js`, `src/routes/cliente.routes.js`, `public/js/cliente-workout.js`, `src/routes/admin.routes.js`, `src/routes/schede.routes.js`, `src/routes/nfc.routes.js`, `src/routes/export.routes.js`, `src/routes/backup.routes.js`.

## 8. Verifiche eseguite
- `node --check` su tutti i file JS modificati: **ALL SYNTAX OK**.
- Smoke test in-process (porta dedicata, doppio cookie jar admin/cliente): **28/28 PASS**.

## 9. Regressioni testate (tutte OK)
CSS e logo serviti; login admin; login cliente (cliente.test/cliente123); `/api/nfc/check` (check-in TEST-NFC-001); area cliente + `/cliente/api/me` + `/cliente/api/allenamento`; cronometro presente; tutte le pagine admin (clienti, dettaglio, schede, scheda cliente, editor seduta, servizi, NFC, simulatore, bacheca, revisioni, export, backup); navbar coerente (Revisioni/Export/Backup); export XLSX; `/admin/api/backup`.

## 10. Debiti residui
- Endpoint `POST /api/nfc/check` pubblico senza token/whitelist IP (invariato, by-design V1).
- Vincolo SQL "una sola PROSSIMA" solo applicativo.
- Username cliente non ancora nei form admin.
- Feedback cliente ancora modificabile dopo revisione coach.
- Dead code residuo (`public/cliente/index.html`, `public/admin/index.html`, route `/cliente` statica shadowed, middleware `__USER__`) — non più collegato al look ma da rimuovere in pulizia futura.
- Le card-tabelle larghe su mobile usano scroll orizzontale (`overflow-x`); accettabile, migliorabile con viste compatte dedicate.
