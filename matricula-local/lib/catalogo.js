// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de secciones (para el PREVIEW del horario antes de matricular).
//
// Verificado en vivo: estas dos páginas responden SIN sesión de Banner, así que
// el preview funciona aunque el estudiante todavía no haya iniciado sesión.
//
//   1) bwckschd.p_disp_detail_sched?term_in&crn_in=<NRC>
//        → título, SUBJ/CRSE/SEC y cupos (Capacidad / Real / Restante).
//        → OJO: en esta instalación NO trae la tabla de horarios.
//   2) bwckschd.p_disp_listcrse?term_in&subj_in&crse_in&crn_in=<NRC>
//        → "Horas de Reunión Programadas" (hora, días, aula).
//        → OJO: con sólo crn_in responde HTTP 500; por eso hace falta el paso 1.
//
// Nomenclatura de días REAL observada: L M I J V S D (la leyenda de la página
// dice "Jueves (E)" pero los datos usan J, así que se aceptan ambas).
// ─────────────────────────────────────────────────────────────────────────────
const BASE = 'https://ssbprod.utb.edu.co:8443/PROD';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Safari/605.1.15';
const DEFAULT_TERM = process.env.BANNER_TERM || '202620';
const CACHE_MS = 10 * 60 * 1000;

const DAY_MAP = {
  L: 'LUN', M: 'MAR', I: 'MIE', W: 'MIE', X: 'MIE',
  J: 'JUE', E: 'JUE', V: 'VIE', S: 'SAB', D: 'DOM',
};

const H = { 'User-Agent': UA, 'Accept-Language': 'es-419,es;q=0.9', Accept: 'text/html' };
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const cache = new Map();   // crn → { at, data }

async function get(url) {
  const r = await fetch(url, { headers: H, redirect: 'manual' });
  return { status: r.status, html: await r.text() };
}

// ── paso 1: detalle (identidad + cupos) ──────────────────────────────────────
function parseDetalle(html, crn) {
  // <th CLASS="ddlabel" scope="row" >TITULO - 1237 - ISCO P02A - G<br /><br /></th>
  let ident = null;
  for (const m of html.matchAll(/<th[^>]*class="ddlabel"[^>]*>([\s\S]*?)<\/th>/gi)) {
    const t = strip(m[1]);
    const g = t.match(new RegExp('^([\\s\\S]+?)\\s+-\\s+' + crn + '\\s+-\\s+(\\S+)\\s+(\\S+)\\s+-\\s+(\\S+)$'));
    if (g) { ident = { title: g[1].trim(), subj: g[2], crse: g[3], sec: g[4] }; break; }
  }
  if (!ident) return null;

  // Fila "Lugares" (la de lista de espera dice "Lugares en Lista de Espera", no colisiona).
  const s = html.match(/Lugares<\/SPAN>[\s\S]*?<td[^>]*>(-?\d+)<\/td>\s*<td[^>]*>(-?\d+)<\/td>\s*<td[^>]*>(-?\d+)<\/td>/i);
  return {
    ...ident,
    cupos: s ? { capacidad: Number(s[1]), inscritos: Number(s[2]), disponibles: Number(s[3]) } : null,
  };
}

// ── paso 2: horas de reunión ─────────────────────────────────────────────────
const TIME_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;
const toMin = (h, m, ap) => ((Number(h) % 12) + (/p/i.test(ap) ? 12 : 0)) * 60 + Number(m);

function parseReuniones(html, crn) {
  // Acotar al bloque de ESTE NRC por si la página devuelve varias secciones.
  const iCrn = html.search(new RegExp('-\\s*' + crn + '\\s*-'));
  const rest = iCrn >= 0 ? html.slice(iCrn) : html;
  const iT = rest.search(/Horas de Reuni[oó]n Programadas/i);
  if (iT < 0) return [];
  const end = rest.indexOf('</table>', iT);
  const tabla = rest.slice(iT, end < 0 ? rest.length : end);

  const meetings = [];
  for (const row of tabla.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => strip(c[1]));
    if (cells.length < 3) continue;                       // fila de encabezados
    const tm = cells[1].match(TIME_RE);
    if (!tm) continue;                                    // "TBA" / sin hora
    const startMin = toMin(tm[1], tm[2], tm[3]);
    const endMin = toMin(tm[4], tm[5], tm[6]);
    const dias = [...new Set((cells[2].toUpperCase().match(/[A-Z]/g) || []).map(c => DAY_MAP[c]).filter(Boolean))];
    for (const day of dias) {
      meetings.push({
        day, startMin, endMin,
        timeLabel: cells[1],
        where: cells[3] || '',
        tipo: cells[0] || '',
        dateRange: cells[4] || '',
      });
    }
  }
  return meetings;
}

// ── consulta pública de una sección por NRC ──────────────────────────────────
async function seccion(crn, term = DEFAULT_TERM) {
  const key = `${term}:${crn}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  let data;
  try {
    const det = await get(`${BASE}/bwckschd.p_disp_detail_sched?term_in=${encodeURIComponent(term)}&crn_in=${encodeURIComponent(crn)}`);
    const info = det.status === 200 ? parseDetalle(det.html, crn) : null;

    if (!info) {
      data = { crn: String(crn), ok: false, error: `El NRC ${crn} no existe en el período ${term}.` };
    } else {
      const lst = await get(`${BASE}/bwckschd.p_disp_listcrse?term_in=${encodeURIComponent(term)}`
        + `&subj_in=${encodeURIComponent(info.subj)}&crse_in=${encodeURIComponent(info.crse)}&crn_in=${encodeURIComponent(crn)}`);
      const meetings = lst.status === 200 ? parseReuniones(lst.html, crn) : [];
      data = { crn: String(crn), ok: true, ...info, meetings };
    }
  } catch (e) {
    // Los errores de red NO se cachean: puede ser algo pasajero.
    return { crn: String(crn), ok: false, error: 'No se pudo consultar el portal: ' + e.message };
  }

  cache.set(key, { at: Date.now(), data });
  return data;
}

async function secciones(crns, term = DEFAULT_TERM) {
  const unicos = [...new Set(crns.map(c => String(c).trim()).filter(Boolean))];
  return Promise.all(unicos.map(c => seccion(c, term)));
}

module.exports = { seccion, secciones, parseDetalle, parseReuniones, DEFAULT_TERM };
