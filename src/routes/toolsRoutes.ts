import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth';
import { getUserAudit, getAdvisorSummary, logAudit } from '../services/auditService';
import { getConversationStats } from '../services/chatwootService';
import { consultarTurno } from '../services/turnosService';
import { loginAndDownloadReceipt } from '../services/icebergService';
import { getMetrics } from '../services/metrics';
import { track } from '../services/metrics';
import {
  getBotUser,
  resetSession,
  banUser,
  unbanUser,
  listActiveUsers,
  setAiEnabled,
} from '../services/botUserService';
import { leerRegistrosPosgrado } from '../services/registroService';
import { leerRegistrosEventoPosgrado, actualizarSeguimientoEvento } from '../services/posgradosEventoSheets';
import { leerEncuestasNutria, guardarEncuestaNutria } from '../services/nutriaSheets';
import { getCodigoNutria, canjearCodigoNutria, getCanjesRecientes } from '../services/nutriaCodigoService';
import { enviarRecordatorio } from '../flows/recordatorios';

export const toolsRouter = Router();

// ── Rutas PÚBLICAS de NutriA (sin autenticación) ──────────────────────────────

toolsRouter.get('/nutria/encuestas', async (_req, res) => {
  try {
    const rows = await leerEncuestasNutria();
    res.json({ rows });
  } catch (err: any) {
    console.error('[tools/nutria/encuestas] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

toolsRouter.post('/nutria/encuestas/seed', async (req, res) => {
  const { key } = req.body ?? {};
  if (key !== 'nutria-seed-2024') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  try {
    await guardarEncuestaNutria({
      whatsapp:           'seed-test',
      edad:               '20 años',
      genero:             'Femenino',
      tiempoCelular:      'Entre 4 y 6 horas',
      verificarMetricas:  'Sí',
      tiempoRedes:        'Entre 1 y 3 horas',
      redPrincipal:       'Instagram',
      sabeUltraprocesado: 'No',
      vioPublicidad:      'Sí',
      redPublicidad:      'Instagram',
      publicidadMotivo:   'Sí',
      consumoBebidas:     '2 veces',
      consumoPanaderia:   '1 vez',
      consumoPostres:     '2 veces',
      consumoMecatos:     '3 veces',
      comproDespues:      'Sí',
      sellos:             'A veces',
      consumiriaSello:    'Sí',
      motivacion:         'Me dio antojo',
      comoEntero:         'Por un amigo',
      contacto:           'Sí',
    });
    res.json({ ok: true, message: 'Fila de prueba guardada en Google Sheets ✅' });
  } catch (err: any) {
    console.error('[tools/nutria/seed] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

// ── Validación y canje de códigos QR NutriA (sin autenticación) ──────────────

toolsRouter.get('/nutria/codigo/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const data = await getCodigoNutria(code);
  if (!data) {
    res.status(404).json({ error: 'not_found', message: 'Código no existe o expiró' });
    return;
  }
  res.json({ ok: true, code, ...data });
});

toolsRouter.get('/nutria/canjes', async (_req, res) => {
  const canjes = await getCanjesRecientes(10);
  res.json({ canjes });
});

toolsRouter.post('/nutria/codigo/:code/canjear', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const result = await canjearCodigoNutria(code);
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : 409;
    res.status(status).json({ error: result.error, data: result.data });
    return;
  }
  console.log(`[nutria] código canjeado: ${code} — ${result.data?.phone?.slice(-4)}`);
  res.json({ ok: true, code, ...result.data });
});

// ── Rutas PROTEGIDAS (requieren sesión) ───────────────────────────────────────

toolsRouter.use(requireAuth);

toolsRouter.get('/turno/:codigo', async (req: AuthedRequest, res: Response) => {
  const codigo = req.params.codigo.toUpperCase().trim();
  if (!/^T\d{8}$/.test(codigo)) {
    res.status(400).json({ error: 'codigo_invalido', message: 'Formato esperado: T seguido de 8 dígitos' });
    return;
  }
  try {
    const turno = await consultarTurno(codigo);
    if (!turno) {
      res.status(404).json({ error: 'no_encontrado' });
      return;
    }
    await logAudit(req.user!.username, 'turno_consultado', codigo);
    res.json({ turno });
  } catch (err: any) {
    console.error('[tools/turno] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

toolsRouter.post('/recibo', async (req: AuthedRequest, res: Response) => {
  const { codigo, cedula } = req.body ?? {};
  if (!codigo || !cedula) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }
  if (!/^T\d{8}$/i.test(codigo)) {
    res.status(400).json({ error: 'codigo_invalido' });
    return;
  }
  if (!/^\d{6,12}$/.test(cedula)) {
    res.status(400).json({ error: 'cedula_invalida' });
    return;
  }

  console.log(`[tools/recibo] solicitud de asesor ${req.user?.username} para código ${codigo}`);

  try {
    const result = await loginAndDownloadReceipt(codigo.toUpperCase(), cedula);
    if (!result.ok) {
      res.status(400).json({ error: 'login_failed', detail: result.error });
      return;
    }
    if (result.noRecibos) {
      res.json({ ok: true, noRecibos: true, nombre: result.nombre });
      return;
    }
    if (!result.pdf) {
      res.status(500).json({ error: 'no_pdf' });
      return;
    }
    await logAudit(req.user!.username, 'recibo_descargado', codigo.toUpperCase());
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="recibo-${codigo}.pdf"`);
    res.send(result.pdf);
  } catch (err: any) {
    console.error('[tools/recibo] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

toolsRouter.get('/metrics/today', async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const data = await getMetrics(today);
  res.json({ day: today, metrics: data });
});

toolsRouter.get('/metrics/range', async (req, res) => {
  const days = Math.max(1, Math.min(30, parseInt(String(req.query.days ?? '7'))));
  const today = new Date();
  const result: Record<string, Record<string, string>> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    result[key] = await getMetrics(key);
  }
  res.json({ days: result });
});

toolsRouter.post('/track', async (req: AuthedRequest, res: Response) => {
  const { event, props } = req.body ?? {};
  if (!event) {
    res.status(400).json({ error: 'missing_event' });
    return;
  }
  await track(event, { ...props, source: 'asesor', asesor: req.user?.username });
  res.json({ ok: true });
});

/* ===== Gestión de usuarios del bot ===== */

function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

toolsRouter.get('/bot-users', async (_req, res) => {
  const phones = await listActiveUsers(100);
  res.json({ phones });
});

toolsRouter.get('/bot-users/:phone', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  const info = await getBotUser(phone);
  res.json(info);
});

toolsRouter.post('/bot-users/:phone/reset-session', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  await resetSession(phone);
  await logAudit(req.user!.username, 'sesion_reseteada', phone.slice(-4));
  console.log(`[asesor] ${req.user?.username} reseteó sesión de ${phone.slice(-4)}`);
  res.json({ ok: true });
});

toolsRouter.post('/bot-users/:phone/ban', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  const reason = req.body?.reason ?? `Baneado por ${req.user?.username}`;
  await banUser(phone, reason);
  await logAudit(req.user!.username, 'usuario_baneado', phone.slice(-4));
  console.log(`[asesor] ${req.user?.username} baneó ${phone.slice(-4)}: ${reason}`);
  res.json({ ok: true });
});

toolsRouter.post('/bot-users/:phone/unban', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  await unbanUser(phone);
  await logAudit(req.user!.username, 'usuario_desbaneado', phone.slice(-4));
  console.log(`[asesor] ${req.user?.username} desbaneó ${phone.slice(-4)}`);
  res.json({ ok: true });
});

toolsRouter.post('/bot-users/:phone/ai-toggle', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  const enabled = !!req.body?.enabled;
  await setAiEnabled(phone, enabled);
  await logAudit(req.user!.username, enabled ? 'ia_activada' : 'ia_desactivada', phone.slice(-4));
  console.log(`[asesor] ${req.user?.username} ${enabled ? 'activó' : 'apagó'} la IA para ${phone.slice(-4)}`);
  res.json({ ok: true, enabled });
});

/* ===== Auditoría de asesores ===== */

toolsRouter.get('/audit/me', async (req: AuthedRequest, res: Response) => {
  const entries = await getUserAudit(req.user!.username, 50);
  res.json({ entries });
});

toolsRouter.get('/audit/summary', requireAdmin, async (req, res) => {
  const days = Math.min(30, Math.max(1, parseInt(String(req.query.days ?? '7')) || 7));
  const summary = await getAdvisorSummary(days);
  res.json({ days, summary });
});

/* ===== Chatwoot en vivo ===== */

toolsRouter.get('/chatwoot/summary', async (_req, res) => {
  const stats = await getConversationStats();
  res.json(stats);
});

/* ===== Registros de prospectos de posgrado (Google Sheets) ===== */

toolsRouter.get('/registros-posgrado', async (_req, res) => {
  try {
    const rows = await leerRegistrosPosgrado();
    res.json({ rows });
  } catch (err: any) {
    console.error('[tools/registros-posgrado] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

/* ===== Registros del evento de posgrados (meetup, Google Sheets aparte) ===== */
/* Antes solo se veían los del menú normal del bot (registro.ts) — los que
   se registraron desde la campaña del evento quedaban invisibles en el
   panel aunque ya se estaban guardando en Sheets + HubSpot. */

toolsRouter.get('/registros-evento-posgrado', async (_req, res) => {
  try {
    const rows = await leerRegistrosEventoPosgrado();
    res.json({ rows });
  } catch (err: any) {
    console.error('[tools/registros-evento-posgrado] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

toolsRouter.post('/registros-evento-posgrado/:fila/seguimiento', async (req: AuthedRequest, res: Response) => {
  const fila = parseInt(req.params.fila, 10);
  const { estado } = req.body ?? {};
  if (!fila || !estado) { res.status(400).json({ error: 'missing_fields' }); return; }
  try {
    await actualizarSeguimientoEvento(fila, estado);
    await logAudit(req.user!.username, 'seguimiento_evento_actualizado');
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[tools/registros-evento-posgrado/seguimiento] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

/* ===== Recordatorios manuales (infraestructura real, disparo futuro) =====
   Infraestructura de envío REAL (usa Evolution/Meta ya configurado).
   El disparador es MANUAL vía este endpoint protegido con requireAuth.
   No hay integración con Banner/SIA — el día que exista, ese sistema solo
   debe llamar a enviarRecordatorio({ telefono, mensaje }) o a este endpoint
   vía cron. Ver src/flows/recordatorios.ts para el detalle. */
toolsRouter.post('/recordatorio', async (req: AuthedRequest, res: Response) => {
  const { telefono, mensaje } = req.body ?? {};
  if (!telefono || !mensaje) {
    res.status(400).json({ error: 'missing_fields', message: 'Se requiere { telefono, mensaje }' });
    return;
  }
  try {
    const result = await enviarRecordatorio({ telefono: String(telefono), mensaje: String(mensaje) });
    await logAudit(req.user!.username, 'recordatorio_enviado', result.to.slice(-4));
    res.json(result);
  } catch (err: any) {
    const msg = err?.message ?? 'internal_error';
    // Errores de validación → 400, resto → 500
    const isValidation = /requeridos|inválido|caracteres/.test(msg);
    console.error('[tools/recordatorio] error:', msg);
    res.status(isValidation ? 400 : 500).json({ error: isValidation ? 'validation_error' : 'internal_error', message: msg });
  }
});

