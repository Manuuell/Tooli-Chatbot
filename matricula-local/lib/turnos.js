// ─────────────────────────────────────────────────────────────────────────────
// Turnos de matrícula web (Google Sheet "Listado General").
//
// La hoja se lee con la CUENTA DE SERVICIO (GOOGLE_SERVICE_ACCOUNT_JSON del .env
// de la raíz): el export CSV anónimo está bloqueado por la unidad compartida.
//
// Layout real (verificado, 4266 filas): la hoja repite un bloque de encabezados
// por cada "Turnos - Grupo N", así que NO se puede asumir que los datos empiezan
// en una fila fija — se busca por código en la columna B y ya.
//   B(1) Id · C(2) Programa · D(3) Nombres · E(4) Apellidos
//   F(5) Turno# · G(6) Día Inicio · H(7) Hora Inicio · I(8) Día Fin · J(9) Hora Fin
// Ejemplo de celdas: "viernes, 24 de julio de 2026" · "8:00" · "12:00:00  m."
// ─────────────────────────────────────────────────────────────────────────────
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.TURNOS_SHEET_ID || '1OdXAteKM4-Dwoz4bEumZuhMat-IPP39hpKd1duS9-XQ';
const RANGE = 'A:K';
const CACHE_MS = 5 * 60 * 1000;

const COL = { codigo: 1, programa: 2, nombre: 3, apellido: 4, turno: 5, diaIni: 6, horaIni: 7, diaFin: 8, horaFin: 9 };

const MESES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};
const sinTildes = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// "8:00" · "13:30" · "12:00:00  m." (mediodía) · "5:00 p. m."
function parseHora(hora) {
  const s = sinTildes(String(hora || '').toLowerCase());
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (/p\.?\s*m\.?/.test(s)) { if (h < 12) h += 12; }
  else if (/a\.?\s*m\.?/.test(s)) { if (h === 12) h = 0; }
  else if (/\bm\.?\s*$/.test(s)) { h = 12; }   // "12:00:00 m." = mediodía (uso colombiano)
  return { h, min };
}

// "viernes, 24 de julio de 2026" + hora → Date en la zona horaria local del equipo.
function parseFechaHora(fecha, hora) {
  const f = sinTildes(String(fecha || '').toLowerCase());
  const m = f.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (mes === undefined) return null;
  const t = parseHora(hora) || { h: 0, min: 0 };
  const d = new Date(Number(m[3]), mes, Number(m[1]), t.h, t.min, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

let cache = null;   // { at, rows }
let inFlight = null;

function credenciales() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function fetchRows() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  if (inFlight) return inFlight;

  const credentials = credenciales();
  if (!credentials) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON en el .env de la raíz del proyecto.');

  inFlight = (async () => {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: RANGE });
    const rows = res.data.values || [];
    cache = { at: Date.now(), rows };
    return rows;
  })();

  try { return await inFlight; }
  finally { inFlight = null; }
}

async function consultarTurno(codigoEstudiante) {
  const target = String(codigoEstudiante || '').trim().toUpperCase();
  if (!target) return null;

  const rows = await fetchRows();
  const fila = rows.find(r => (r[COL.codigo] ?? '').toString().trim().toUpperCase() === target);
  if (!fila) return null;

  const inicio = parseFechaHora(fila[COL.diaIni], fila[COL.horaIni]);
  const fin = parseFechaHora(fila[COL.diaFin], fila[COL.horaFin]);

  return {
    codigo: target,
    nombre: (fila[COL.nombre] || '').toString().trim(),
    apellido: (fila[COL.apellido] || '').toString().trim(),
    programa: (fila[COL.programa] || '').toString().trim(),
    turno: (fila[COL.turno] || '').toString().trim(),
    // texto tal cual sale en la hoja (para mostrar/verificar)
    inicioTexto: `${fila[COL.diaIni] || ''} ${fila[COL.horaIni] || ''}`.trim(),
    finTexto: `${fila[COL.diaFin] || ''} ${fila[COL.horaFin] || ''}`.trim(),
    // instantes resueltos (null si la celda no se pudo interpretar)
    inicioISO: inicio ? inicio.toISOString() : null,
    finISO: fin ? fin.toISOString() : null,
  };
}

function invalidarCache() { cache = null; }

module.exports = { consultarTurno, invalidarCache, parseFechaHora, parseHora };
