// api/search.js — Funzione serverless su Vercel, architettura a due stadi.
//
// STADIO 1 (il cuore): AeroDataBox FIDS → quali voli partono dall'aeroporto
//   nella finestra oraria scelta, e verso dove. Domanda sugli ORARI, non sul prezzo.
// STADIO 2 (monetizzazione): Travelpayouts → prezzo indicativo + link affiliato
//   per ogni destinazione trovata.
//
// Tutte le chiavi restano lato server. Il browser non le vede mai.

export default async function handler(req, res) {
  const ADB_KEY = process.env.ADB_KEY;                                  // chiave AeroDataBox (RapidAPI)
  const ADB_HOST = process.env.ADB_HOST || "aerodatabox.p.rapidapi.com";
  const TP_TOKEN = process.env.TP_TOKEN;                                 // token Travelpayouts (facoltativo)
  const MARKER = process.env.TP_MARKER || "";

  if (!ADB_KEY) {
    return res.status(500).json({
      error: "Manca ADB_KEY (chiave AeroDataBox) nelle variabili di ambiente di Vercel.",
    });
  }

  const origin = (req.query.origin || "").toUpperCase().trim();
  const date = (req.query.date || "").trim();          // YYYY-MM-DD
  const from = (req.query.from || "00:00").trim();     // HH:MM (locale aeroporto)
  const to = (req.query.to || "23:59").trim();         // HH:MM
  const currency = (req.query.currency || "eur").toLowerCase();

  if (!origin || !date) {
    return res.status(400).json({ error: "Specifica aeroporto di partenza e giorno." });
  }

  // ---------- STADIO 1: tabellone partenze (AeroDataBox FIDS) ----------
  let departures = [];
  try {
    for (const w of splitWindows(date, from, to)) {   // finestre <= 12h
      const url =
        `https://${ADB_HOST}/flights/airports/iata/${origin}/${w.f}/${w.t}` +
        `?direction=Departure&withCancelled=false&withCodeshared=false` +
        `&withCargo=false&withPrivate=false&withLocation=false&withLeg=false`;
      const r = await fetch(url, {
        headers: { "X-RapidAPI-Key": ADB_KEY, "X-RapidAPI-Host": ADB_HOST },
      });
      if (!r.ok) throw new Error("AeroDataBox " + r.status);
      const j = await r.json();
      parseDepartures(j).forEach((d) => departures.push(d));
    }
  } catch (e) {
    return res.status(502).json({
      error: "Non riesco a leggere il tabellone partenze (AeroDataBox). " + (e.message || ""),
    });
  }

  // Dedup per destinazione: tieni la partenza più presto nella finestra
  const byDest = new Map();
  for (const d of departures) {
    const cur = byDest.get(d.dest);
    if (!cur || d.depLocal < cur.depLocal) byDest.set(d.dest, d);
  }

  // ---------- STADIO 2: prezzo indicativo (Travelpayouts, best-effort, 1 chiamata) ----------
  const priceMap = {};
  if (TP_TOKEN) {
    try {
      const p = new URLSearchParams({
        origin,
        departure_at: date.slice(0, 7), // mese
        unique: "true",
        sorting: "price",
        direct: "true",
        currency,
        limit: "1000",
        one_way: "true",
        token: TP_TOKEN,
      });
      const r = await fetch(
        "https://api.travelpayouts.com/aviasales/v3/prices_for_dates?" + p.toString(),
        { headers: { "X-Access-Token": TP_TOKEN } }
      );
      const j = await r.json();
      (j.data || []).forEach((row) => {
        const d = (row.destination || "").toUpperCase();
        if (d && (priceMap[d] == null || row.price < priceMap[d])) priceMap[d] = row.price;
      });
    } catch (_) {
      /* il prezzo è opzionale: se salta, mostriamo comunque gli orari */
    }
  }

  const ddmm = date.slice(8, 10) + date.slice(5, 7); // per il link Aviasales
  const data = [...byDest.values()].map((d) => ({
    dest: d.dest,
    destName: d.destName,
    depTime: extractHHMM(d.depLocal),
    depLocal: d.depLocal,
    airline: d.airline,
    number: d.number,
    price: priceMap[d.dest] ?? null,
    currency,
    buy_url: aviasalesLink(origin, ddmm, d.dest, MARKER),
  }));

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
  return res.status(200).json({ success: true, origin, date, count: data.length, data });
}

// ---------- helpers ----------
function splitWindows(date, from, to) {
  const start = toMin(from), end = toMin(to);
  const out = [];
  let s = start;
  while (s < end) {
    const e = Math.min(s + 12 * 60 - 1, end);
    out.push({ f: `${date}T${fromMin(s)}`, t: `${date}T${fromMin(e)}` });
    s = e + 1;
  }
  if (!out.length) out.push({ f: `${date}T${from}`, t: `${date}T${to}` });
  return out;
}
function toMin(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); }
function fromMin(x) {
  const h = Math.floor(x / 60), m = x % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function extractHHMM(local) { const m = (local || "").match(/(\d{2}:\d{2})/); return m ? m[1] : ""; }

function parseDepartures(json) {
  const list = json.departures || json.Departures || [];
  return list
    .map((d) => {
      const mv = d.movement || {};
      const apt = mv.airport || {};
      const st = mv.scheduledTime || mv.revisedTime || {};
      return {
        dest: (apt.iata || "").toUpperCase(),
        destName: apt.name || apt.shortName || (apt.iata || "").toUpperCase(),
        depLocal: st.local || st.utc || "",
        airline: (d.airline && d.airline.name) || "",
        number: d.number || "",
      };
    })
    .filter((x) => x.dest && x.depLocal);
}

function aviasalesLink(origin, ddmm, dest, marker) {
  const base = `https://www.aviasales.com/search/${origin}${ddmm}${dest}1`;
  return marker ? `${base}?marker=${encodeURIComponent(marker)}` : base;
}
