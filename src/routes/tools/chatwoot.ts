/**
 * Resumen en vivo de las conversaciones humanas en Chatwoot.
 */

import { Router } from 'express';
import { getConversationStats } from '../../services/chatwootService';

export const chatwootRouter = Router();

/* ===== Chatwoot en vivo ===== */

chatwootRouter.get('/chatwoot/summary', async (_req, res) => {
  const stats = await getConversationStats();
  res.json(stats);
});
