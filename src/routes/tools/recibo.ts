/**
 * Descarga del recibo de matrícula desde el portal Iceberg.
 */

import { Router } from 'express';
import { AuthedRequest } from '../../middleware/auth';
import { logAudit } from '../../services/auditService';
import { loginAndDownloadReceipt } from '../../services/icebergService';
import { maskCode } from '../../services/logSafe';
import { Response } from 'express';

export const reciboRouter = Router();

reciboRouter.post('/recibo', async (req: AuthedRequest, res: Response) => {
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

  console.log(`[tools/recibo] solicitud de asesor ${req.user?.username} para código ${maskCode(codigo)}`);

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
