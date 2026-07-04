# PARTO·ORA — MVP "dove posso andare?"

Motore time-first: scegli aeroporto, giorno e fascia oraria di partenza (es. "martedi
dopo le 18:30 da FCO"), e vedi dove puoi volare. Architettura a due stadi:

1. **AeroDataBox FIDS** = il cuore. Legge il tabellone partenze reale dell'aeroporto e
   restituisce i voli in partenza nella finestra oraria, con destinazione e orario.
2. **Travelpayouts** = monetizzazione. Aggancia a ogni destinazione un prezzo indicativo
   e un link affiliato "Cerca su Aviasales".

Perche' e' diverso da Skyscanner/Google: loro sono price-first (collassano ogni meta alla
tariffa piu' bassa e buttano via l'orario). Qui l'asse e' invertito: prima l'orario, poi il prezzo.

## File
- `index.html` — interfaccia (un solo file da modificare).
- `api/search.js` — funzione serverless a due stadi; tiene le chiavi lato server.
- `.env.example` — nomi delle variabili da mettere su Vercel.

## Deploy in 6 passi (senza scrivere codice)

### 1. Chiave AeroDataBox (obbligatoria)
- Vai su RapidAPI, cerca "AeroDataBox", iscriviti (c'e' un tier gratuito, poi da ~5-10$/mese).
- Copia la tua **X-RapidAPI-Key**.

### 2. (Opzionale) Travelpayouts per prezzo + affiliazione
- Registrati su travelpayouts.com → Profilo → API token: copia **token** e **marker**.
- Puoi saltarlo: senza, il sito mostra orari e destinazioni con link "Cerca su Aviasales".

### 3. File su GitHub
- github.com → New repository → Add file → Upload files → trascina `index.html`, la cartella
  `api`, `.gitignore`, `.env.example` → Commit. Mai caricare un `.env` con valori veri.

### 4. Vercel
- vercel.com → login con GitHub → Add New Project → importa il repo → framework "Other".

### 5. Variabili d'ambiente (prima del Deploy)
| Name | Value |
|---|---|
| `ADB_KEY` | la X-RapidAPI-Key del passo 1 |
| `ADB_HOST` | `aerodatabox.p.rapidapi.com` |
| `TP_TOKEN` | (opzionale) token Travelpayouts |
| `TP_MARKER` | (opzionale) marker Travelpayouts |

### 6. Deploy
- Premi Deploy → URL live in ~1 minuto.

## I due test da fare (15 minuti) — decidono se il modello regge

**Test A — copertura orari (il piu' importante).** Cerca FCO, oggi, "Sera". Devi vedere
decine di destinazioni con orari reali. Poi prova un aeroporto secondario (Bergamo, Treviso):
se torna vuoto o quasi, la copertura schedule di AeroDataBox li' e' scarsa → per ora resta
sui grandi hub. Questo e' il "would flip if" del progetto.

**Test B — link affiliato.** Clicca "Cerca su Aviasales" e verifica che il tuo marker venga
agganciato. Se no, la funzione da adattare e' `aviasalesLink()` in `api/search.js`.

## Come modificarlo
- **Aeroporti di partenza**: array `AIRPORTS` in cima allo `<script>` di `index.html`.
- **Fasce orarie**: i chip nella sezione "A partire da" (attributi `data-from`/`data-to`).
- **Soglie verdetto**: funzione `verdictFor()` in `index.html`.

## Limiti noti (MVP)
- Il prezzo e' indicativo per la destinazione in quel giorno, non del singolo volo: si verifica al clic.
- I risultati sono voli **diretti** in partenza (le coincidenze sono una feature v2).
- La finestra AeroDataBox e' max 12h per chiamata: "Tutto il giorno" fa 2 chiamate.
- Possibili disallineamenti aeroporto/citta' nel prezzo (es. Londra LGW vs LON): accettabile in MVP.
