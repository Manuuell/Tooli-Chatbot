/**
 * Auditoría de lo que hace cada asesor en el panel.
 */

import { Router } from 'express';
import { AuthedRequest, requireAdmin } from '../../middleware/auth';
import { getAdvisorSummary, getUserAudit } from '../../services/auditService';
import { Response } from 'express';

export const auditRouter = Router();

/* ===== Auditoría de asesores ===== */

auditRouter.get('/audit/me', async (req: AuthedRequest, res: Response) => {
  const entries = await getUserAudit(req.user!.username, 50);
  res.json({ entries });
});

auditRouter.get('/audit/summary', requireAdmin, async (req, res) => {
  const days = Math.min(30, Math.max(1, parseInt(String(req.query.days ?? '7')) || 7));
  const summary = await getAdvisorSummary(days);
  res.json({ days, summary });
});
