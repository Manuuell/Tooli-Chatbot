/**
 * Fichas de seguimiento del CRM: notas, etapa del embudo, etiquetas
 * y asignación por prospecto.
 */

import { Router } from 'express';
import { normalizePhone } from './shared';
import { AuthedRequest } from '../../middleware/auth';
import { logAudit } from '../../services/auditService';
import { Response } from 'express';

export const crmRouter = Router();

/* ══════════════════════════════════════════════════════════════════════════
   FICHAS DE SEGUIMIENTO DEL CRM
   Notas, estado del embudo, etiquetas y asignación por prospecto.
   Ver `src/services/crmService.ts` para el porqué y los límites.
   ══════════════════════════════════════════════════════════════════════════ */

/** Todas las fichas de una, para que el CRM no haga N+1 al pintar la grilla. */
crmRouter.get('/crm/fichas', async (_req: AuthedRequest, res: Response) => {
  try {
    const { getFichas } = await import('../../services/crmService');
    res.json({ fichas: await getFichas() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tools/crm] error al listar fichas:', msg);
    res.status(500).json({ error: 'internal_error', message: msg });
  }
});

crmRouter.get('/crm/:phone', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  try {
    const { getFicha } = await import('../../services/crmService');
    res.json({ ficha: await getFicha(phone) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'internal_error', message: msg });
  }
});

crmRouter.post('/crm/:phone/nota', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  try {
    const { agregarNota } = await import('../../services/crmService');
    const ficha = await agregarNota(phone, String(req.body?.texto ?? ''), req.user!.username);
    await logAudit(req.user!.username, 'crm_nota_agregada', phone.slice(-4));
    res.json({ ok: true, ficha });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(/vacía|superar/.test(msg) ? 400 : 500).json({ error: 'validation_error', message: msg });
  }
});

crmRouter.delete('/crm/:phone/nota/:notaId', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  try {
    const { eliminarNota } = await import('../../services/crmService');
    const ficha = await eliminarNota(phone, String(req.params.notaId), req.user!.username);
    res.json({ ok: true, ficha });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'internal_error', message: msg });
  }
});

crmRouter.post('/crm/:phone/estado', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  try {
    const { setEstado } = await import('../../services/crmService');
    const ficha = await setEstado(phone, req.body?.estado, req.user!.username);
    await logAudit(req.user!.username, 'crm_estado_actualizado', `${phone.slice(-4)} · ${ficha.estado}`);
    res.json({ ok: true, ficha });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(/inválido/.test(msg) ? 400 : 500).json({ error: 'validation_error', message: msg });
  }
});

crmRouter.post('/crm/:phone/asignar', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  try {
    const { setAsignado } = await import('../../services/crmService');
    const username = req.body?.username ? String(req.body.username) : null;
    const ficha = await setAsignado(phone, username, req.user!.username);
    await logAudit(req.user!.username, 'crm_asignado', `${phone.slice(-4)} · ${username ?? 'sin asignar'}`);
    res.json({ ok: true, ficha });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'internal_error', message: msg });
  }
});

crmRouter.post('/crm/:phone/etiquetas', async (req: AuthedRequest, res: Response) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  try {
    const { setEtiquetas } = await import('../../services/crmService');
    const etiquetas = Array.isArray(req.body?.etiquetas) ? req.body.etiquetas : [];
    const ficha = await setEtiquetas(phone, etiquetas, req.user!.username);
    res.json({ ok: true, ficha });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'internal_error', message: msg });
  }
});
