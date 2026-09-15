/**
 * Consulta del turno de matrícula de un estudiante, en su nombre.
 */

import { Router } from 'express';
import { AuthedRequest } from '../../middleware/auth';
import { logAudit } from '../../services/auditService';
import { consultarTurno } from '../../services/turnosService';
import { Response } from 'express';

export const turnoRouter = Router();

turnoRouter.get('/turno/:codigo', async (req: AuthedRequest, res: Response) => {
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
