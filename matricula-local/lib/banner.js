// ─────────────────────────────────────────────────────────────────────────────
// Motor de matrícula Banner (ssbprod / Autoservicio UTB).
//
// Login NATIVO confirmado en vivo:  POST twbkwbis.P_ValLogin con sid + PIN.
//   · sin Microsoft SSO, sin MFA (eso es SAVIO/Moodle, otro sistema)
//   · sin captcha · Cloudflare no bloquea el fetch del servidor
// Enroll (bwckcoms.P_Regs) validado contra el portal real.
// Tras el login hay que fijar el PERÍODO (bwcklibs.P_StoreTerm) antes del worksheet.
//
// Al integrar al bot esto se porta a TS (src/services/matriculaService.ts).
// ─────────────────────────────────────────────────────────────────────────────
const BASE = 'https://ssbprod.utb.edu.co:8443/PROD';
const WS = BASE + '/bwskfreg.P_AddDropCrse';   // hoja de trabajo (Agregar o Eliminar Clases)
const REGS = BASE + '/bwckcoms.P_Regs';         // procesa agregar/eliminar
const LOGIN = BASE + '/twbkwbis.P_ValLogin';    // valida sid + PIN
const LOGINPAGE = BASE + '/twbkwbis.P_WWWLogin';
const STORETERM = BASE + '/bwcklibs.P_StoreTerm'; // fija el período en la sesión
const ORIGIN = 'https://ssbprod.utb.edu.co:8443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Safari/605.1.15';

// Período de matrícula por defecto (código UTB del semestre en curso).
const DEFAULT_TERM = process.env.BANNER_TERM || '202620';

const H = (cookie, extra = {}) => ({ 'User-Agent': UA, 'Accept-Language': 'es-419,es;q=0.9', ...(cookie ? { Cookie: cookie } : {}), ...extra });
// Cualquier "muro" que Banner muestra cuando NO hay sesión válida:
//  · página de login normal ("Área Segura" / P_ValLogin)
//  · página de "Acceso a Representante" (proxy) que sale al pedir una página protegida sin sesión
const isAuthWall = html => /Ingreso de acceso a representante|bwgkpxya\.P_PA_Login|Acceso a Representante|Área Segura|twbkwbis\.P_ValLogin/i.test(html);
const isWorksheet = html => /Agregar o Eliminar/i.test(html);

// ── cookie jar ───────────────────────────────────────────────────────────────
function absorbCookies(res, jar) {
  const arr = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of arr) {
    const pair = c.split(';')[0];
    const i = pair.indexOf('=');
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}
const jarToHeader = jar => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

// ── parseo del formulario (validado) ─────────────────────────────────────────
function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'));
  if (m) return m[1];
  const m2 = tag.match(new RegExp(name + '\\s*=\\s*([^\\s>]+)', 'i'));
  return m2 ? m2[1] : null;
}
function parseForm(html) {
  const aIdx = html.search(/bwckcoms\.P_Regs/i);
  if (aIdx < 0) return null;
  const form = html.slice(html.lastIndexOf('<form', aIdx), html.indexOf('</form>', aIdx));
  const fields = [];
  const re = /<input\b[^>]*>|<select\b[^>]*>[\s\S]*?<\/select>/gi;
  let m;
  while ((m = re.exec(form))) {
    const tag = m[0];
    if (/^<input/i.test(tag)) {
      const type = (attr(tag, 'type') || 'text').toLowerCase();
      if (['submit', 'button', 'image', 'reset'].includes(type)) continue; // botones sólo al hacer clic
      const name = attr(tag, 'name');
      if (!name) continue;
      fields.push([name, attr(tag, 'value') || '', type]);
    } else {
      const name = attr(tag, 'name');
      if (!name) continue;
      let sel = tag.match(/<option[^>]*\bvalue\s*=\s*"([^"]*)"[^>]*\bselected/i)
             || tag.match(/<option[^>]*\bselected[^>]*\bvalue\s*=\s*"([^"]*)"/i);
      const value = sel ? sel[1] : (tag.match(/<option[^>]*\bvalue\s*=\s*"([^"]*)"/i) || [, ''])[1];
      fields.push([name, value, 'select']);
    }
  }
  return fields;
}
const enc = s => encodeURIComponent(s).replace(/%20/g, '+');

// Días/horas de reunión de la fila (celdas visibles: la de Días va justo antes de la de Horario)
const DAY_RE = /(LUN|MAR|MI[EÉ]|JUE|VIE|S[AÁ]B|DOM)/gi;
const TIME_RE = /(\d{1,2}):(\d{2})\s*([AP])\.?\s*M\.?\s*-\s*(\d{1,2}):(\d{2})\s*([AP])\.?\s*M\.?/i;
const normDay = d => d.toUpperCase().replace('É', 'E').replace('Á', 'A');
const toMin = (h, m, ap) => ((Number(h) % 12) + (ap.toUpperCase() === 'P' ? 12 : 0)) * 60 + Number(m);

function parseMeetings(win) {
  const cells = [...win.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map(c => c[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
  const meetings = [];
  for (let i = 0; i < cells.length; i++) {
    const tm = cells[i].match(TIME_RE);
    if (!tm) continue;
    const startMin = toMin(tm[1], tm[2], tm[3]);
    const endMin = toMin(tm[4], tm[5], tm[6]);
    const days = ((cells[i - 1] || '').match(DAY_RE) || []).map(normDay);
    const timeLabel = cells[i].replace(/\s*\.\s*/g, '').replace(/\s+/g, ' ').trim();
    for (const day of days) meetings.push({ day, startMin, endMin, timeLabel });
  }
  return meetings;
}

function parseSchedule(html) {
  const positions = [];
  const re = /name="CRN_IN"\s+value="(\d{3,5})"/gi;
  let m;
  while ((m = re.exec(html))) positions.push({ crn: m[1], idx: m.index });

  const courses = [];
  const seen = new Set();
  for (let k = 0; k < positions.length; k++) {
    const { crn, idx } = positions[k];
    if (seen.has(crn)) continue;
    seen.add(crn);
    const end = k + 1 < positions.length ? positions[k + 1].idx : idx + 2200;
    const win = html.slice(idx, end);
    const g = n => { const x = win.match(new RegExp('name="' + n + '"\\s+value="([^"]*)"', 'i')); return x ? x[1].trim() : ''; };
    courses.push({ crn, subj: g('SUBJ'), crse: g('CRSE'), sec: g('SEC'), cred: g('CRED'), title: g('TITLE'), meetings: parseMeetings(win) });
  }
  return courses;
}

function textNear(html, needle) {
  const t = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const i = t.indexOf(needle);
  return i < 0 ? '' : t.slice(i, i + 140).trim();
}

// ── login (nativo sid + PIN, verificado) ─────────────────────────────────────
async function login(codigo, pin) {
  const jar = {};
  try {
    const g = await fetch(LOGINPAGE, { headers: H('', { Accept: 'text/html' }), redirect: 'manual' });
    absorbCookies(g, jar);
    await g.text();

    const p = await fetch(LOGIN, {
      method: 'POST',
      headers: H(jarToHeader(jar), { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: LOGINPAGE }),
      body: `sid=${enc(codigo)}&PIN=${enc(pin)}`,
      redirect: 'manual',
    });
    absorbCookies(p, jar);
    await p.text();

    const cookie = jarToHeader(jar);
    // verificar contra una página que sólo existe autenticado
    const chk = await fetch(WS, { headers: H(cookie, { Accept: 'text/html' }), redirect: 'manual' });
    const html = await chk.text();
    if (isAuthWall(html)) return { ok: false, error: 'CREDENCIALES' };
    return { ok: true, cookie };
  } catch (e) {
    return { ok: false, error: 'LOGIN_ERROR', detail: e.message };
  }
}

// ── abrir el worksheet, fijando el período si hace falta ─────────────────────
async function openWorksheet(cookie, term) {
  let r = await fetch(WS, { headers: H(cookie, { Accept: 'text/html' }), redirect: 'manual' });
  let html = await r.text();
  if (isAuthWall(html)) return { error: 'Sesión inválida o expirada.' };
  if (isWorksheet(html)) return { html };

  // página de selección de período → fijarlo y reintentar
  if (/name="term_in"/i.test(html) || /P_StoreTerm/i.test(html)) {
    await fetch(STORETERM, {
      method: 'POST',
      headers: H(cookie, { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: WS }),
      body: `term_in=${enc(term)}`,
      redirect: 'manual',
    }).then(x => x.text()).catch(() => {});
    r = await fetch(WS, { headers: H(cookie, { Accept: 'text/html' }), redirect: 'manual' });
    html = await r.text();
    if (isWorksheet(html)) return { html };
    return { error: `No se pudo abrir la hoja de trabajo para el período ${term} (¿matrícula cerrada o retención?).` };
  }
  return { error: 'No se reconoció la página del portal (¿matrícula no habilitada?).' };
}

// ── matricular ───────────────────────────────────────────────────────────────
async function enroll(cookie, nrcs, term = DEFAULT_TERM) {
  const ws = await openWorksheet(cookie, term);
  if (ws.error) return { ok: false, error: ws.error };

  const fields = parseForm(ws.html);
  if (!fields) return { ok: false, error: 'No se encontró el formulario de matrícula en el portal.' };

  const queue = nrcs.slice(0, 10);
  for (const f of fields) {
    if (queue.length && f[0] === 'CRN_IN' && f[1] === '' && f[2] === 'text') f[1] = queue.shift();
  }
  fields.push(['REG_BTN', 'Enviar Cambios', 'submit']);
  const body = fields.map(([n, v]) => `${enc(n)}=${enc(v)}`).join('&');

  const pr = await fetch(REGS, {
    method: 'POST',
    headers: H(cookie, { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: WS }),
    body, redirect: 'manual',
  });
  const resp = await pr.text();
  const schedule = parseSchedule(resp);
  const enrolledSet = new Set(schedule.map(c => c.crn));
  const hadErrors = /Errores?\s+de\s+Inscripci/i.test(resp);
  const errBlock = (resp.match(/Errores?\s+de\s+Inscripci[\s\S]{0,2000}?<\/table>/i) || [])[0] || '';

  const results = nrcs.map(nrc => {
    const s = String(nrc);
    if (enrolledSet.has(s)) return { nrc: s, ok: true, message: 'Inscrito por Web' };
    const near = errBlock.includes(s) ? textNear(errBlock, s) : '';
    return { nrc: s, ok: false, message: near || 'No quedó inscrito (revisa cupo, requisitos, horario o retenciones).' };
  });

  return { ok: true, results, schedule, hadErrors };
}

// ── eliminar (drop): marca la fila del CRN con RSTS_IN=DW ─────────────────────
async function drop(cookie, crn, term = DEFAULT_TERM) {
  const target = String(crn).trim();
  const ws = await openWorksheet(cookie, term);
  if (ws.error) return { ok: false, error: ws.error };

  const before = parseSchedule(ws.html);
  if (!before.some(c => c.crn === target)) {
    return { ok: false, error: `El NRC ${target} no está en tu horario.`, schedule: before };
  }

  const fields = parseForm(ws.html);
  if (!fields) return { ok: false, error: 'No se encontró el formulario de matrícula.' };

  // En cada bloque el <select name="RSTS_IN"> va ANTES de su CRN_IN; al llegar al
  // CRN objetivo, marco el último RSTS_IN visto como "DW" (ELIMINAR).
  let lastRsts = -1, marked = false;
  for (let i = 0; i < fields.length; i++) {
    if (fields[i][0] === 'RSTS_IN') lastRsts = i;
    if (fields[i][0] === 'CRN_IN' && fields[i][1] === target && lastRsts >= 0) {
      fields[lastRsts][1] = 'DW';
      marked = true;
      break;
    }
  }
  if (!marked) return { ok: false, error: `No se pudo ubicar el NRC ${target} en el formulario.` };

  fields.push(['REG_BTN', 'Enviar Cambios', 'submit']);
  const body = fields.map(([n, v]) => `${enc(n)}=${enc(v)}`).join('&');

  const pr = await fetch(REGS, {
    method: 'POST',
    headers: H(cookie, { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: WS }),
    body, redirect: 'manual',
  });
  const resp = await pr.text();
  const schedule = parseSchedule(resp);

  if (schedule.some(c => c.crn === target)) {
    const errBlock = (resp.match(/Errores?\s+de\s+Inscripci[\s\S]{0,1500}?<\/table>/i) || [])[0] || '';
    const near = errBlock.includes(target) ? textNear(errBlock, target) : '';
    return { ok: false, error: near || `No se pudo eliminar el NRC ${target}.`, schedule };
  }
  return { ok: true, crn: target, schedule };
}

// ── keepalive: toca el menú principal para que la sesión no caduque (~30 min) ─
// No sirve el worksheet: antes del turno puede no abrir aunque la sesión esté viva.
async function ping(cookie) {
  try {
    const r = await fetch(`${BASE}/twbkwbis.P_GenMenu?name=bmenu.P_MainMnu`, {
      headers: H(cookie, { Accept: 'text/html' }), redirect: 'manual',
    });
    const html = await r.text();
    return { ok: !isAuthWall(html) };
  } catch (e) {
    // Falla de red: no se puede concluir que la sesión murió.
    return { ok: true, warn: e.message };
  }
}

async function schedule(cookie, term = DEFAULT_TERM) {
  const ws = await openWorksheet(cookie, term);
  if (ws.error) return { ok: false, error: ws.error };
  return { ok: true, schedule: parseSchedule(ws.html) };
}

// Plan B para el código: el SSO no siempre deja la cookie sghe_magellan_username,
// así que se busca el T######## en páginas del portal que ya requieren sesión.
// Devuelve { codigo, via } y, si no lo halla, un diagnóstico de lo que sí vio.
const PAGINAS_CODIGO = [
  '/twbkwbis.P_GenMenu?name=bmenu.P_MainMnu',
  '/bwskfreg.P_AddDropCrse',
  '/bwskfshd.P_CrseSchd',
  '/bwgkogad.P_SelectAtypUpdate',
  '/bwskotrn.P_ViewTermTran',
  '/twbkwbis.P_GenMenu?name=bmenu.P_AdminMnu',
];
const CODE_RE = /\bT\s?0\d{6,7}\b/;

async function codigoFromPortal(cookie) {
  const diag = [];
  for (const ruta of PAGINAS_CODIGO) {
    try {
      const r = await fetch(BASE + ruta, { headers: H(cookie, { Accept: 'text/html' }), redirect: 'manual' });
      const html = await r.text();
      if (isAuthWall(html)) { diag.push(`${ruta}: muro de login`); continue; }
      const texto = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      const m = texto.match(CODE_RE);
      if (m) return { codigo: m[0].replace(/\s/g, '').toUpperCase(), via: ruta, diag };
      diag.push(`${ruta}: sin código (${texto.slice(0, 90).trim()}…)`);
    } catch (e) {
      diag.push(`${ruta}: error ${e.message}`);
    }
  }
  return { codigo: null, diag };
}

// El código estudiantil viene en la cookie sghe_magellan_username (base64 del código).
function codigoFromCookie(cookieHeader) {
  const m = /(?:^|;\s*)sghe_magellan_username=([^;]+)/i.exec(cookieHeader || '');
  if (!m) return null;
  try {
    const dec = Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8').trim();
    return /^T\d{6,8}$/i.test(dec) ? dec.toUpperCase() : null;
  } catch { return null; }
}

module.exports = { login, enroll, drop, schedule, ping, openWorksheet, parseSchedule, parseForm, codigoFromCookie, codigoFromPortal, DEFAULT_TERM };
