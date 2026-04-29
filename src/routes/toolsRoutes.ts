import { Router, Response } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/auth';
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
} from '../services/botUserService';

export const toolsRouter = Router();

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
  console.log(`[asesor] ${req.user?.username} reseteó sesión de ${phone.slice(-4)}`);
  res.json({ ok: true });
});

toolsRouter.post('/bot-users/:phone/ban', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  const reason = req.body?.reason ?? `Baneado por ${req.user?.username}`;
  await banUser(phone, reason);
  console.log(`[asesor] ${req.user?.username} baneó ${phone.slice(-4)}: ${reason}`);
  res.json({ ok: true });
});

toolsRouter.post('/bot-users/:phone/unban', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  await unbanUser(phone);
  console.log(`[asesor] ${req.user?.username} desbaneó ${phone.slice(-4)}`);
  res.json({ ok: true });
});
