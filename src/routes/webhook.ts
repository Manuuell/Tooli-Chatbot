import { Router, Request, Response } from 'express';
import { parseEvolutionWebhook } from '../webhooks/evolutionParser';
import { EvolutionAPIAdapter } from '../adapters/messaging/EvolutionAPIAdapter';
import { config } from '../config';

export const webhookRouter = Router();

const messaging = new EvolutionAPIAdapter();

webhookRouter.post('/', async (req: Request, res: Response) => {
  // Evolution API envía el apikey en el body JSON, no en headers
  const apikey = req.body?.apikey;
  if (apikey !== config.webhookSecret) {
    res.sendStatus(401);
    return;
  }

  const inbound = parseEvolutionWebhook(req.body);

  if (!inbound) {
    // Evento que no es mensaje de texto (status update, etc.) — ignorar silenciosamente
    res.sendStatus(200);
    return;
  }

  try {
    // TODO: enrutar a Typebot o handler de intención
    // Por ahora: echo para verificar que el pipeline funciona end-to-end
    await messaging.sendText({
      to: inbound.from,
      text: `[echo] ${inbound.text}`,
    });
  } catch (err) {
    // Log sin exponer contenido del mensaje (Ley 1581)
    console.error('Error procesando mensaje de', inbound.from.slice(-4), err);
  }

  res.sendStatus(200);
});
