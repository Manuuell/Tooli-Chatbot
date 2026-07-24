// Servidor local para la herramienta de matrícula UTB.
//   node matricula-local/server.js        →  http://localhost:4600
const path = require('path');
// El .env vive en la raíz del proyecto (de ahí sale GOOGLE_SERVICE_ACCOUNT_JSON).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const fs = require('fs');
const banner = require('./lib/banner');
const catalogo = require('./lib/catalogo');
const turnos = require('./lib/turnos');
const { captureSession } = require('./lib/loginBrowser');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// OJO: el .env de la raíz define PORT=3000 para el bot. Esta herramienta usa su
// propia variable para no quedar colgada del puerto del bot.
const PORT = process.env.MATRICULA_PORT || 4600;

// Sesión de Banner capturada por el login-por-navegador (en memoria).
let currentSession = null;
let currentCodigo = null;
let capturing = false;

// Cookie de sesión de respaldo (dev): env BANNER_COOKIE o archivo .session
function devCookie() {
  if (process.env.BANNER_COOKIE) return process.env.BANNER_COOKIE.trim();
  const f = path.join(__dirname, '.session');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  return null;
}

// Sesión utilizable sin interacción (la del navegador o la de dev). La usa la
// auto-matrícula, que corre sola y no puede pedirle nada al usuario.
function sesionActiva() { return currentSession || devCookie(); }

async function resolveSession({ codigo, pin, cookie }) {
  if (cookie && cookie.trim()) return { ok: true, cookie: cookie.trim(), via: 'cookie-manual' };
  if (currentSession) return { ok: true, cookie: currentSession, via: 'sesion-navegador' };
  const dev = devCookie();
  if (dev) return { ok: true, cookie: dev, via: 'cookie-dev' };
  if (!codigo || !pin) return { ok: false, error: 'Primero inicia sesión en Banner (botón de arriba) o pega una cookie de sesión.' };
  const lg = await banner.login(codigo, pin);
  if (!lg.ok) {
    const msg = lg.error === 'CREDENCIALES'
      ? 'Código o NIP incorrectos. (Ojo: en UTB casi todos entran por Microsoft, no con NIP — usa el botón “Iniciar sesión en Banner”.)'
      : 'No se pudo iniciar sesión en Banner en este momento. Intenta de nuevo.';
    return { ok: false, error: msg };
  }
  return { ok: true, cookie: lg.cookie, via: 'login-nip' };
}

// ── inicio de sesión asistido por navegador ──────────────────────────────────
app.post('/api/login-browser', async (req, res) => {
  if (capturing) return res.status(409).json({ ok: false, error: 'Ya hay un inicio de sesión en curso.' });
  capturing = true;
  try {
    const r = await captureSession({});
    if (!r.ok) return res.status(408).json(r);
    currentSession = r.cookie;
    currentCodigo = banner.codigoFromCookie(r.cookie);
    if (currentCodigo) {
      console.log(`  código ${currentCodigo} (cookie)`);
    } else {
      // El SSO no dejó la cookie del código: buscarlo dentro del portal.
      const p = await banner.codigoFromPortal(currentSession).catch(() => ({ codigo: null, diag: [] }));
      currentCodigo = p.codigo;
      if (currentCodigo) console.log(`  código ${currentCodigo} (portal: ${p.via})`);
      else {
        console.log('  ⚠️  no se pudo determinar el código. Diagnóstico:');
        (p.diag || []).forEach(d => console.log('     · ' + d));
      }
    }
    res.json({ ok: true, codigo: currentCodigo });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    capturing = false;
  }
});

app.get('/api/session-status', (req, res) => res.json({ ready: !!currentSession, codigo: currentCodigo }));
app.post('/api/logout', (req, res) => {
  if (auto && (auto.estado === 'esperando' || auto.estado === 'disparando')) cancelarAuto('Sesión cerrada por el usuario.');
  currentSession = null; currentCodigo = null;
  res.json({ ok: true });
});

// Plan B: si el SSO no dejó la cookie con el código, se fija a mano (sin él no
// se puede consultar el turno ni armar la auto-matrícula).
app.post('/api/codigo', (req, res) => {
  const codigo = String((req.body && req.body.codigo) || '').trim().toUpperCase();
  if (!/^T\d{6,8}$/.test(codigo)) return res.status(400).json({ ok: false, error: 'Código inválido (debe ser T seguido de 6 a 8 dígitos).' });
  currentCodigo = codigo;
  res.json({ ok: true, codigo: currentCodigo });
});

// ── turno de matrícula (Google Sheet) ────────────────────────────────────────
app.get('/api/turno', async (req, res) => {
  const codigo = (req.query.codigo || currentCodigo || '').toString().trim();
  if (!codigo) return res.status(400).json({ ok: false, error: 'Aún no se conoce tu código: inicia sesión en Banner.' });
  try {
    const t = await turnos.consultarTurno(codigo);
    if (!t) return res.status(404).json({ ok: false, error: `No encontramos un turno para ${codigo} en el listado.` });
    res.json({ ok: true, turno: t });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'No se pudo leer el listado de turnos: ' + e.message });
  }
});

// ── catálogo: horarios de las secciones que se quieren agregar (preview) ─────
app.post('/api/seccion', async (req, res) => {
  try {
    const nrcs = (req.body && req.body.nrcs) || [];
    const clean = [...new Set(nrcs.map(n => String(n).trim()).filter(n => /^\d{3,5}$/.test(n)))];
    if (!clean.length) return res.json({ ok: true, secciones: [] });
    res.json({ ok: true, secciones: await catalogo.secciones(clean) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── matrícula ────────────────────────────────────────────────────────────────
app.post('/api/matricula', async (req, res) => {
  try {
    const { codigo, pin, nrcs, cookie } = req.body || {};
    const clean = [...new Set((nrcs || []).map(n => String(n).trim()).filter(n => /^\d{3,5}$/.test(n)))];
    if (!clean.length) return res.status(400).json({ ok: false, error: 'Ingresa al menos un NRC válido (4-5 dígitos).' });

    const s = await resolveSession({ codigo, pin, cookie });
    if (!s.ok) return res.status(401).json(s);

    const out = await banner.enroll(s.cookie, clean);
    if (!out.ok) {
      // sesión vencida → limpiar para forzar nuevo login
      if (/expirada|inválida/i.test(out.error || '') && s.via === 'sesion-navegador') currentSession = null;
      return res.status(502).json(out);
    }
    res.json({ ...out, via: s.via });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/horario', async (req, res) => {
  try {
    const { codigo, pin, cookie } = req.body || {};
    const s = await resolveSession({ codigo, pin, cookie });
    if (!s.ok) return res.status(401).json(s);
    const out = await banner.schedule(s.cookie);
    if (!out.ok && /expirada|inválida/i.test(out.error || '') && s.via === 'sesion-navegador') currentSession = null;
    res.status(out.ok ? 200 : 502).json({ ...out, via: s.via });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/eliminar', async (req, res) => {
  try {
    const { crn, codigo, pin, cookie } = req.body || {};
    if (!/^\d{3,5}$/.test(String(crn || '').trim())) return res.status(400).json({ ok: false, error: 'NRC inválido.' });
    const s = await resolveSession({ codigo, pin, cookie });
    if (!s.ok) return res.status(401).json(s);
    const out = await banner.drop(s.cookie, String(crn).trim());
    res.status(out.ok ? 200 : 502).json({ ...out, via: s.via });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-MATRÍCULA: espera al turno manteniendo la sesión viva y dispara.
//
// Sólo puede haber un trabajo a la vez. Vive en memoria: si se reinicia el
// servidor, se pierde (a propósito — nada de matrículas "fantasma").
// ─────────────────────────────────────────────────────────────────────────────
let auto = null;

const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));

// Mensajes del portal que NO tiene sentido reintentar: no cambian esperando.
const ERROR_PERMANENTE = /prerrequisito|pre-?requisito|co-?requisito|repetid|duplicad|restricci|reten|conflicto|choque|no existe|inv[aá]lid|nivel|programa/i;

const PING_MS = Number(process.env.AUTO_PING_MS) || 2 * 60 * 1000;   // la sesión de Banner caduca ~30 min
const REINTENTO_RAPIDO = 2000;      // primer minuto del turno: la ventana caliente
const REINTENTO_LENTO = 10000;
const VENTANA_RAPIDA = 60 * 1000;
const DURACION_MAX = 15 * 60 * 1000;

function log(job, msg) {
  job.log.push({ t: Date.now(), msg });
  if (job.log.length > 200) job.log.shift();
  console.log(`  [auto] ${msg}`);
}

function cancelarAuto(motivo) {
  if (!auto) return;
  auto.cancelado = true;
  auto.motivoCancelacion = motivo || 'Cancelado.';
}

function vistaAuto(job) {
  if (!job) return null;
  return {
    estado: job.estado,
    nrcs: job.nrcs,
    pendientes: job.pendientes,
    listos: job.listos,
    descartados: job.descartados,
    intentos: job.intentos,
    startAtISO: new Date(job.startAt).toISOString(),
    deadlineISO: new Date(job.deadline).toISOString(),
    error: job.error || null,
    horario: job.horario || null,
    log: job.log.slice(-40),
  };
}

async function correrAuto(job) {
  try {
    // ── 1. esperar al turno, manteniendo viva la sesión ──────────────────────
    if (job.startAt > Date.now()) {
      log(job, `En espera del turno (${new Date(job.startAt).toLocaleString('es-CO')}).`);
    }
    while (!job.cancelado && Date.now() < job.startAt) {
      await sleep(Math.min(job.startAt - Date.now(), PING_MS));
      if (job.cancelado || Date.now() >= job.startAt) break;
      const ck = sesionActiva();
      if (!ck) {
        job.estado = 'error';
        job.error = 'Se cerró la sesión de Banner mientras se esperaba el turno.';
        return;
      }
      const p = await banner.ping(ck);
      if (!p.ok) {
        job.estado = 'error';
        job.error = 'La sesión de Banner caducó mientras se esperaba el turno. Vuelve a iniciar sesión y arma de nuevo.';
        currentSession = null; currentCodigo = null;
        log(job, job.error);
        return;
      }
      log(job, 'Sesión viva (keepalive).');
    }
    if (job.cancelado) { job.estado = 'cancelado'; job.error = job.motivoCancelacion; return; }

    // ── 2. disparar y reintentar hasta lograrlo ─────────────────────────────
    job.estado = 'disparando';
    log(job, 'Turno abierto — enviando matrícula.');

    while (!job.cancelado && job.pendientes.length && Date.now() < job.deadline) {
      job.intentos++;
      const ck = sesionActiva();
      if (!ck) {
        job.estado = 'error';
        job.error = 'Se cerró la sesión de Banner.';
        return;
      }

      const out = await banner.enroll(ck, job.pendientes);

      if (!out.ok) {
        log(job, `Intento ${job.intentos}: ${out.error}`);
        if (/expirada|inválida/i.test(out.error || '')) {
          job.estado = 'error';
          job.error = 'La sesión de Banner caducó. Vuelve a iniciar sesión y arma de nuevo.';
          currentSession = null; currentCodigo = null;
          return;
        }
      } else {
        if (out.schedule) job.horario = out.schedule;
        const siguen = [];
        for (const r of out.results) {
          if (r.ok) {
            job.listos.push({ nrc: r.nrc, message: r.message });
            log(job, `NRC ${r.nrc} inscrito ✓`);
          } else if (ERROR_PERMANENTE.test(r.message || '')) {
            job.descartados.push({ nrc: r.nrc, message: r.message });
            log(job, `NRC ${r.nrc} descartado: ${r.message}`);
          } else {
            siguen.push(r.nrc);
          }
        }
        job.pendientes = siguen;
        if (siguen.length) log(job, `Intento ${job.intentos}: faltan ${siguen.join(', ')}.`);
      }

      if (!job.pendientes.length) break;
      const rapido = Date.now() - job.startAt < VENTANA_RAPIDA;
      await sleep(rapido ? REINTENTO_RAPIDO : REINTENTO_LENTO);
    }

    // ── 3. desenlace ────────────────────────────────────────────────────────
    if (job.cancelado) { job.estado = 'cancelado'; job.error = job.motivoCancelacion; }
    else if (!job.pendientes.length && !job.descartados.length) { job.estado = 'ok'; log(job, 'Listo: todos los NRC quedaron inscritos.'); }
    else if (job.listos.length) { job.estado = 'parcial'; log(job, 'Terminó con NRC sin inscribir.'); }
    else { job.estado = 'error'; job.error = job.error || 'No se pudo inscribir ningún NRC dentro del tiempo límite.'; }

    // Refrescar el horario final si quedó algo inscrito.
    if (job.listos.length && sesionActiva()) {
      const s = await banner.schedule(sesionActiva()).catch(() => null);
      if (s && s.ok) job.horario = s.schedule;
    }
  } catch (e) {
    job.estado = 'error';
    job.error = e.message;
    log(job, 'Error inesperado: ' + e.message);
  }
}

app.post('/api/auto/start', async (req, res) => {
  try {
    if (auto && (auto.estado === 'esperando' || auto.estado === 'disparando')) {
      return res.status(409).json({ ok: false, error: 'Ya hay una auto-matrícula armada. Cancélala primero.' });
    }
    if (!sesionActiva()) {
      return res.status(401).json({ ok: false, error: 'Inicia sesión en Banner antes de armar la auto-matrícula.' });
    }

    const { nrcs, startAtISO } = req.body || {};
    const clean = [...new Set((nrcs || []).map(n => String(n).trim()).filter(n => /^\d{3,5}$/.test(n)))];
    if (!clean.length) return res.status(400).json({ ok: false, error: 'Ingresa al menos un NRC válido.' });
    if (clean.length > 10) return res.status(400).json({ ok: false, error: 'Máximo 10 NRC por envío.' });

    // Hora de inicio: la del turno, salvo que el cliente mande una explícita.
    let startAt;
    if (startAtISO) {
      startAt = new Date(startAtISO).getTime();
      if (isNaN(startAt)) return res.status(400).json({ ok: false, error: 'Hora de inicio inválida.' });
    } else {
      const t = await turnos.consultarTurno(currentCodigo).catch(() => null);
      if (!t || !t.inicioISO) {
        return res.status(400).json({ ok: false, error: 'No se pudo determinar la hora de tu turno; no se armó nada.' });
      }
      startAt = new Date(t.inicioISO).getTime();
      // Si el turno ya venció por completo, no tiene sentido armar.
      if (t.finISO && Date.now() > new Date(t.finISO).getTime()) {
        return res.status(400).json({ ok: false, error: 'Tu ventana de turno ya cerró.' });
      }
    }
    // Turno ya abierto → disparar de una.
    if (startAt < Date.now()) startAt = Date.now();

    auto = {
      nrcs: clean,
      pendientes: [...clean],
      listos: [],
      descartados: [],
      startAt,
      deadline: startAt + DURACION_MAX,
      estado: 'esperando',
      intentos: 0,
      cancelado: false,
      log: [],
      horario: null,
      error: null,
    };
    log(auto, `Armada para ${clean.join(', ')}.`);
    correrAuto(auto);                      // corre en segundo plano
    res.json({ ok: true, auto: vistaAuto(auto) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/auto/status', (req, res) => res.json({ ok: true, auto: vistaAuto(auto) }));

app.post('/api/auto/cancel', (req, res) => {
  if (!auto || (auto.estado !== 'esperando' && auto.estado !== 'disparando')) {
    return res.json({ ok: true, auto: vistaAuto(auto) });
  }
  cancelarAuto('Cancelada por el usuario.');
  res.json({ ok: true, auto: vistaAuto(auto) });
});

app.listen(PORT, () => {
  console.log(`\n  Matrícula UTB (local)  →  http://localhost:${PORT}\n`);
  if (devCookie()) console.log('  (usando cookie de sesión de .session / BANNER_COOKIE)\n');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) console.log('  ⚠️  Sin GOOGLE_SERVICE_ACCOUNT_JSON: no se podrán consultar turnos.\n');
});
