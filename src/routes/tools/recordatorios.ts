/**
 * Recordatorios por WhatsApp: el envío inmediato y los programados,
 * que dispara solo el worker de reminderService.
 */

import { Router } from 'express';
import { enviarRecordatorio } from '../../flows/recordatorios';
import { AuthedRequest } from '../../middleware/auth';
import { logAudit } from '../../services/auditService';
import { Response } from 'express';

export const recordatoriosRouter = Router();

/* ===== Recordatorios manuales (infraestructura real, disparo futuro) =====
   Infraestructura de envío REAL (usa Evolution/Meta ya configurado).
   El disparador es MANUAL vía este endpoint protegido con requireAuth.
   No hay integración con Banner/SIA — el día que exista, ese sistema solo
   debe llamar a enviarRecordatorio({ telefono, mensaje }) o a este endpoint
   vía cron. Ver src/flows/recordatorios.ts para el detalle. */
recordatoriosRouter.post('/recordatorio', async (req: AuthedRequest, res: Response) => {
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

/* ══════════════════════════════════════════════════════════════════════════
   RECORDATORIOS PROGRAMADOS
   El endpoint `/recordatorio` (arriba) envía ya mismo. Estos programan para
   una fecha futura y los dispara solo el worker de `reminderService.ts`.
   ══════════════════════════════════════════════════════════════════════════ */

recordatoriosRouter.post('/recordatorios', async (req: AuthedRequest, res: Response) => {
  const { telefono, mensaje, scheduledAt } = req.body ?? {};
  try {
    const { scheduleReminder, ReminderValidationError } = await import('../../services/reminderService');
    try {
      const reminder = await scheduleReminder({
        telefono: String(telefono ?? ''),
        mensaje: String(mensaje ?? ''),
        scheduledAt: scheduledAt ?? '',
        createdBy: req.user!.username,
      });
      await logAudit(
        req.user!.username,
        'recordatorio_programado',
        `${reminder.telefono.slice(-4)} · ${new Date(reminder.scheduledAt).toISOString()}`
      );
      res.json({ ok: true, reminder });
    } catch (err: unknown) {
      if (err instanceof ReminderValidationError) {
        res.status(400).json({ error: 'validation_error', message: err.message });
        return;
      }
      throw err;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tools/recordatorios] error al programar:', msg);
    res.status(500).json({ error: 'internal_error', message: msg });
  }
});

recordatoriosRouter.get('/recordatorios', async (req: AuthedRequest, res: Response) => {
  try {
    const { listReminders } = await import('../../services/reminderService');
    const estado = req.query.estado ? String(req.query.estado) : undefined;
    const valido = ['programado', 'enviado', 'fallido', 'cancelado'].includes(estado ?? '');
    const reminders = await listReminders({
      estado: valido ? (estado as 'programado' | 'enviado' | 'fallido' | 'cancelado') : undefined,
      limit: Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? '50')) || 50)),
    });
    res.json({ reminders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tools/recordatorios] error al listar:', msg);
    res.status(500).json({ error: 'internal_error', message: msg });
  }
});

recordatoriosRouter.delete('/recordatorios/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const { cancelReminder } = await import('../../services/reminderService');
    const reminder = await cancelReminder(String(req.params.id));
    if (!reminder) {
      res.status(404).json({ error: 'not_found', message: 'Ese recordatorio ya no existe' });
      return;
    }
    await logAudit(req.user!.username, 'recordatorio_cancelado', reminder.telefono.slice(-4));
    res.json({ ok: true, reminder });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tools/recordatorios] error al cancelar:', msg);
    res.status(500).json({ error: 'internal_error', message: msg });
  }
});
