/**
 * Prospectos de la campaña del evento de posgrados: listado, estado de
 * seguimiento e invitación a un próximo evento.
 */

import { Router } from 'express';
import { messaging } from '../../flows/shared';
import { AuthedRequest } from '../../middleware/auth';
import { logAudit } from '../../services/auditService';
import { actualizarSeguimientoEvento, leerRegistrosEventoPosgrado } from '../../services/posgradosEventoSheets';
import { Response } from 'express';

export const eventoRouter = Router();

/* ===== Registros del evento de posgrados (meetup, Google Sheets aparte) ===== */
/* Antes solo se veían los del menú normal del bot (registro.ts) — los que
   se registraron desde la campaña del evento quedaban invisibles en el
   panel aunque ya se estaban guardando en Sheets + HubSpot. */

eventoRouter.get('/registros-evento-posgrado', async (_req, res) => {
  try {
    const rows = await leerRegistrosEventoPosgrado();
    res.json({ rows });
  } catch (err: any) {
    console.error('[tools/registros-evento-posgrado] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

const SEGUIMIENTO_VALIDOS = [
  'Contactado', 'Interesado', 'Inscrito',
  'Invitado a próximo evento', 'No interesado',
  'Confirmó asistencia', 'Interesado en beca',
];

eventoRouter.post('/registros-evento-posgrado/:fila/seguimiento', async (req: AuthedRequest, res: Response) => {
  const fila = parseInt(req.params.fila, 10);
  const { estado } = req.body ?? {};
  if (!fila || !estado) { res.status(400).json({ error: 'missing_fields' }); return; }
  if (!SEGUIMIENTO_VALIDOS.includes(estado)) {
    res.status(400).json({ error: 'estado_invalido', validos: SEGUIMIENTO_VALIDOS });
    return;
  }
  try {
    await actualizarSeguimientoEvento(fila, estado);
    await logAudit(req.user!.username, 'seguimiento_evento_actualizado', `${estado} · fila ${fila}`);
    console.log(`[asesor] ${req.user?.username} marcó fila ${fila} como "${estado}"`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[tools/registros-evento-posgrado/seguimiento] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});


/**
 * Invita por WhatsApp a un prospecto del evento a un próximo evento de posgrados.
 * Usa el mismo adaptador de mensajería del bot (Evolution o Meta Cloud) — texto
 * plano simple, sin templates pre-aprobados. El asesor edita el mensaje antes
 * de enviar en el panel. Tras enviar, marca automáticamente "Invitado a próximo
 * evento" en el Sheet y registra auditoría.
 */
eventoRouter.post('/registros-evento-posgrado/:fila/invitar', async (req: AuthedRequest, res: Response) => {
  const fila = parseInt(req.params.fila, 10);
  const { mensaje, whatsapp } = req.body ?? {};
  if (!fila) { res.status(400).json({ error: 'missing_fields' }); return; }
  const texto = (mensaje ?? '').trim();
  if (!texto || texto.length < 10) {
    res.status(400).json({ error: 'mensaje_requerido', message: 'El mensaje debe tener al menos 10 caracteres' });
    return;
  }
  if (texto.length > 1000) {
    res.status(400).json({ error: 'mensaje_demasiado_largo' });
    return;
  }
  // Resolver WhatsApp: prioridad al body, fallback a leer la fila del Sheet
  let to = (whatsapp ?? '').replace(/\D/g, '');
  if (!to) {
    try {
      const rows = await leerRegistrosEventoPosgrado();
      const row = rows[fila - 2]; // A2 = índice 0 → fila 2
      to = (row?.[1] ?? '').replace(/\D/g, '');
    } catch { /* ignore */ }
  }
  if (!to) { res.status(400).json({ error: 'whatsapp_requerido' }); return; }

  try {
    await messaging.sendText({ to, text: texto });
    // Marca como invitado si no lo estaba ya — no bloquea el éxito del envío si falla el Sheet
    try { await actualizarSeguimientoEvento(fila, 'Invitado a próximo evento'); } catch (e) { console.warn('[invitar] no se pudo actualizar seguimiento:', e); }
    await logAudit(req.user!.username, 'invitacion_evento_enviada', `fila ${fila} · +${to.slice(-4)}`);
    await logAudit(req.user!.username, 'seguimiento_evento_actualizado', 'Invitado a próximo evento · fila ' + fila);
    console.log(`[asesor] ${req.user?.username} invitó a fila ${fila} (+${to.slice(-4)}) al próximo evento`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[tools/registros-evento-posgrado/invitar] error:', err?.response?.data ?? err?.message ?? err);
    res.status(502).json({ error: 'send_failed', message: err?.message ?? 'No se pudo enviar el mensaje' });
  }
});
