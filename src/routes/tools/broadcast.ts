/**
 * Mensajes masivos con templates aprobados de Meta.
 */

import { Router } from 'express';
import { AuthedRequest, requireAdmin } from '../../middleware/auth';
import { logAudit } from '../../services/auditService';
import { Response } from 'express';

export const broadcastRouter = Router();

/* ===== Broadcast / mensajes masivos por templates de Meta (WABA) — AL FINAL =====
   Infraestructura REAL: lista templates aprobados del Business Manager y
   envío masivo usando Graph API v20.0. Sin templates aprobados no hay envío
   posible (Meta no permite texto libre fuera de ventana 24h). Sin credenciales
   WABA en este entorno, la lista viene vacía — estado honesto en la UI. */

broadcastRouter.get('/broadcast/templates', async (_req, res) => {
  try {
    const { listApprovedTemplates } = await import('../../services/broadcastService');
    const templates = await listApprovedTemplates();
    res.json({ templates });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tools/broadcast/templates] error:', msg);
    res.status(502).json({ error: 'templates_error', message: msg });
  }
});

broadcastRouter.post('/broadcast/send', requireAdmin, async (req: AuthedRequest, res: Response) => {
  const { templateName, language, telefonos } = req.body ?? {};
  if (!templateName || !language || !Array.isArray(telefonos)) {
    res.status(400).json({ error: 'missing_fields', message: 'Se requiere { templateName, language, telefonos: string[] }' });
    return;
  }
  const cleanTemplate = String(templateName).trim();
  const cleanLang = String(language).trim();
  const nums: string[] = (telefonos as unknown[])
    .map(v => String(v ?? '').replace(/\D/g, ''))
    .filter(v => v.length >= 8);
  if (nums.length === 0) {
    res.status(400).json({ error: 'no_telefonos_validos' });
    return;
  }
  if (nums.length > 200) {
    res.status(400).json({ error: 'too_many_recipients', message: 'Máximo 200 destinatarios por envío' });
    return;
  }
  const unique = [...new Set(nums)];
  try {
    const { sendBroadcast } = await import('../../services/broadcastService');
    const result = await sendBroadcast(cleanTemplate, cleanLang, unique);
    await logAudit(req.user!.username, 'broadcast_enviado', `${cleanTemplate} · ${result.enviados.length}/${unique.length}`);
    console.log(`[asesor] ${req.user?.username} broadcast "${cleanTemplate}" (${cleanLang}) → ${result.enviados.length}/${unique.length} enviados`);
    res.json({ ok: true, template: cleanTemplate, language: cleanLang, total: unique.length, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isValidation = /requeridos|credenciales|vacía/.test(msg);
    console.error('[tools/broadcast/send] error:', msg);
    res.status(isValidation ? 400 : 502).json({ error: isValidation ? 'validation_error' : 'send_failed', message: msg });
  }
});
