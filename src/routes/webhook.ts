import { Router, Request, Response } from 'express';
import { parseEvolutionWebhook } from '../webhooks/evolutionParser';
import { claimMessageId } from '../services/session';
import { checkUserRateLimit } from '../services/rateLimit';
import { track } from '../services/metrics';
import { isBanned, recordActivity } from '../services/botUserService';
import { config } from '../config';
import { messaging } from '../flows/shared';
import { handleMessage } from '../flows';
import { handleEventoMessage } from '../flows/evento';
import { handlePosgradoMessage } from '../flows/posgrados-evento';

export const webhookRouter = Router();

webhookRouter.post(['/', '/:event'], async (req: Request, res: Response) => {
  const apikey = req.body?.apikey;
  if (apikey !== config.webhookSecret) {
    res.sendStatus(401);
    return;
  }

  console.log(
    '[webhook] event:',
    req.body?.event,
    'fromMe:',
    req.body?.data?.key?.fromMe,
    'remoteJid:',
    req.body?.data?.key?.remoteJid,
    'senderPn:',
    req.body?.data?.key?.senderPn
  );

  const inbound = parseEvolutionWebhook(req.body);

  if (!inbound) {
    console.log('[webhook] parser returned null — ignored');
    res.sendStatus(200);
    return;
  }

  console.log('[webhook] inbound:', { from: inbound.from, text: inbound.text, id: inbound.messageId });

  res.sendStatus(200);

  const isNew = await claimMessageId(inbound.messageId);
  if (!isNew) {
    console.log('[webhook] mensaje duplicado, ignorado:', inbound.messageId);
    await track('duplicate_message');
    return;
  }

  messaging
    .resolveSenderId(inbound.from)
    .then(async resolvedFrom => {
      if (resolvedFrom.endsWith('@lid')) {
        console.warn('[webhook] no se pudo resolver número real para', resolvedFrom, '— ignorando');
        return;
      }
      if (resolvedFrom !== inbound.from) {
        console.log('[webhook] resolved', inbound.from, '→', resolvedFrom);
      }

      if (await isBanned(resolvedFrom)) {
        console.warn('[webhook] usuario baneado, ignorando:', resolvedFrom.slice(-4));
        return;
      }

      await recordActivity(resolvedFrom, 'in', inbound.text);

      const limit = await checkUserRateLimit(resolvedFrom);
      if (!limit.allowed) {
        console.warn('[webhook] rate limit alcanzado para', resolvedFrom.slice(-4));
        await track('rate_limited');
        if (limit.firstBlock) {
          await messaging
            .sendText({
              to: resolvedFrom,
              text: `⚠️ Estás enviando mensajes muy rápido. Espera ${limit.retryAfterSec}s e intenta de nuevo.`,
            })
            .catch(() => {});
        }
        return;
      }

      if (config.evento.activo) {
        return handleEventoMessage(resolvedFrom, inbound.text);
      }
      if (config.posgradosEvento.activo) {
        return handlePosgradoMessage(resolvedFrom, inbound.text);
      }
      return handleMessage(resolvedFrom, inbound.text);
    })
    .catch(err => {
      console.error('Error en handleMessage para', inbound.from.slice(-4), err);
    });
});
